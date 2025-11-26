/**
 * Transcript Consumer - Background worker that consumes transcripts from Redis
 * and forwards them to the ingest-transcript API for intent detection and SSE broadcast.
 * 
 * This bridges the gap between ASR Worker (publishes to Redis) and Frontend (receives via SSE).
 */

import { createPubSubAdapterFromEnv } from './pubsub';
import { transcriptTopic, parseTopic } from './pubsub/topics';
import { ingestTranscriptCore } from './ingest-transcript-core';

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

interface TranscriptMessage {
  interaction_id: string;
  tenant_id: string;
  seq: number;
  type: 'partial' | 'final';
  text?: string; // Optional - may be empty for partial transcripts
  confidence?: number;
  timestamp_ms: number;
}

interface ActiveSubscription {
  interactionId: string;
  topic: string;
  handle: any;
  createdAt: Date;
  transcriptCount: number;
}

interface FailedTranscript {
  interaction_id: string;
  tenant_id: string;
  seq: number;
  type: 'partial' | 'final';
  text: string;
  confidence?: number;
  timestamp_ms: number;
  callId: string;
  error: string;
  failedAt: number;
  retryCount: number;
}

class TranscriptConsumer {
  private pubsub: ReturnType<typeof createPubSubAdapterFromEnv>;
  private subscriptions: Map<string, ActiveSubscription> = new Map();
  private isRunning: boolean = false;
  private baseUrl: string;
  private nextJsApiUrl: string;
  private deadLetterQueue: FailedTranscript[] = []; // In-memory dead-letter queue
  private maxDeadLetterSize: number = 500; // Max failed transcripts to keep in memory (reduced from 1000 for 512MB instances)
  private retryInterval: NodeJS.Timeout | null = null;
  
  // CRITICAL FIX: Track discovery failures for backoff
  private discoveryFailureCount: number = 0;
  private lastDiscoveryFailureTime: number = 0;
  private readonly DISCOVERY_BACKOFF_MS = 30000; // 30 seconds backoff after failures

  constructor() {
    this.pubsub = createPubSubAdapterFromEnv();
    
    // Determine base URL for internal API calls
    // CRITICAL FIX: In production (Render), must use the service's own URL
    // Priority order:
    // 1. RENDER_SERVICE_URL (Render-specific, most reliable)
    // 2. RENDER_EXTERNAL_URL (Render external URL)
    // 3. NEXT_PUBLIC_BASE_URL (explicitly set)
    // 4. VERCEL_URL (Vercel deployment)
    // 5. Localhost (development only)
    const port = process.env.PORT || process.env.NEXT_PUBLIC_PORT || '3000';
    
    if (process.env.RENDER_SERVICE_URL) {
      // Render service URL (e.g., https://frontend-8jdd.onrender.com)
      this.baseUrl = process.env.RENDER_SERVICE_URL;
      console.info('[TranscriptConsumer] Using RENDER_SERVICE_URL:', this.baseUrl);
    } else if (process.env.RENDER_EXTERNAL_URL) {
      // Render external URL (fallback)
      this.baseUrl = process.env.RENDER_EXTERNAL_URL;
      console.info('[TranscriptConsumer] Using RENDER_EXTERNAL_URL:', this.baseUrl);
    } else if (process.env.NEXT_PUBLIC_BASE_URL) {
      // Explicitly configured base URL
      this.baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      console.info('[TranscriptConsumer] Using NEXT_PUBLIC_BASE_URL:', this.baseUrl);
    } else if (process.env.VERCEL_URL) {
      // Vercel deployment
      this.baseUrl = `https://${process.env.VERCEL_URL}`;
      console.info('[TranscriptConsumer] Using VERCEL_URL:', this.baseUrl);
    } else {
      // Development: use localhost
      this.baseUrl = `http://localhost:${port}`;
      console.warn('[TranscriptConsumer] ⚠️ Using localhost (development mode). Set RENDER_SERVICE_URL for production!');
    }
    
    this.nextJsApiUrl = `${this.baseUrl}/api/calls/ingest-transcript`;

    console.info('[TranscriptConsumer] Initialized', {
      baseUrl: this.baseUrl,
      apiUrl: this.nextJsApiUrl,
      pubsubAdapter: process.env.PUBSUB_ADAPTER || 'redis_streams',
      environment: process.env.NODE_ENV || 'development',
      note: 'Transcripts will be forwarded to this API URL',
    });
  }

  /**
   * Start the transcript consumer
   * Subscribes to all transcript topics using pattern matching
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[TranscriptConsumer] Already running, skipping start');
      return;
    }

    console.info('[TranscriptConsumer] Starting transcript consumer...');
    this.isRunning = true;

    try {
      // Subscribe to all transcript topics
      // For Redis Streams, we'll subscribe to a pattern or use a wildcard consumer
      // Since Redis Streams doesn't support pattern subscriptions directly,
      // we'll use a different approach: subscribe to a known pattern or use XREAD with pattern matching
      
      // For now, we'll subscribe to transcript topics as they're discovered
      // In production, you might want to:
      // 1. Subscribe to all existing transcript.* streams
      // 2. Use Redis Streams pattern matching if available
      // 3. Or use a single consumer that reads from multiple streams

      // Start a background worker that periodically checks for new transcript streams
      // Note: startStreamDiscovery is async but we don't await it - it runs in background
      // Errors in discovery are caught internally and don't affect isRunning status
      this.startStreamDiscovery().catch((error: any) => {
        // Log error but don't stop the consumer - discovery is best-effort
        console.error('[TranscriptConsumer] Stream discovery failed during start:', error);
        // Don't set isRunning = false - consumer can still work with manual subscriptions
      });

      console.info('[TranscriptConsumer] ✅ Transcript consumer started', {
        isRunning: this.isRunning,
        hasPubsub: !!this.pubsub,
      });
    } catch (error: any) {
      console.error('[TranscriptConsumer] Failed to start:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Subscribe to a specific transcript topic
   */
  async subscribeToInteraction(interactionId: string): Promise<void> {
    if (this.subscriptions.has(interactionId)) {
      console.debug('[TranscriptConsumer] Already subscribed to', { interactionId });
      return;
    }

    // CRITICAL FIX: Safety limit to prevent memory issues and 502 errors
    // If we have too many subscriptions, clean up old ones first
    // Reduced from 50 to 30 for 512MB Render instances
    const MAX_SUBSCRIPTIONS = 30; // Limit to 30 active subscriptions
    if (this.subscriptions.size >= MAX_SUBSCRIPTIONS) {
      console.warn('[TranscriptConsumer] ⚠️ Subscription limit reached, cleaning up old subscriptions', {
        currentCount: this.subscriptions.size,
        maxAllowed: MAX_SUBSCRIPTIONS,
        newInteractionId: interactionId,
      });
      
      // Try to clean up ended calls first
      await this.cleanupEndedCallSubscriptions();
      
      // If still at limit, remove oldest subscriptions
      if (this.subscriptions.size >= MAX_SUBSCRIPTIONS) {
        const subscriptionsArray = Array.from(this.subscriptions.entries())
          .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime()); // Oldest first
        
        const toRemove = subscriptionsArray.slice(0, 10); // Remove 10 oldest
        for (const [id] of toRemove) {
          try {
            await this.unsubscribeFromInteraction(id);
            console.info('[TranscriptConsumer] 🧹 Removed oldest subscription to make room', { interactionId: id });
          } catch (error: any) {
            console.warn('[TranscriptConsumer] Failed to remove old subscription', { interactionId: id, error: error.message });
          }
        }
      }
    }

    const topic = transcriptTopic(interactionId);
    console.info('[TranscriptConsumer] Subscribing to transcript topic', { interactionId, topic });

    try {
      const handle = await this.pubsub.subscribe(topic, async (msg: any) => {
        await this.handleTranscriptMessage(msg as TranscriptMessage, interactionId);
      });

      this.subscriptions.set(interactionId, {
        interactionId,
        topic,
        handle,
        createdAt: new Date(),
        transcriptCount: 0,
      });

      console.info('[TranscriptConsumer] ✅ Subscribed to transcript topic', { 
        interactionId, 
        topic,
        totalSubscriptions: this.subscriptions.size,
      });
    } catch (error: any) {
      console.error('[TranscriptConsumer] Failed to subscribe to transcript topic', {
        interactionId,
        topic,
        error: error.message || String(error),
      });
      throw error;
    }
  }

  /**
   * Handle incoming transcript message
   */
  private async handleTranscriptMessage(msg: TranscriptMessage, interactionId: string): Promise<void> {
    const subscription = this.subscriptions.get(interactionId);
    if (subscription) {
      subscription.transcriptCount++;
    }

    // Validate message has required fields
    // Skip empty transcripts - they're not useful and cause log spam
    const isEmpty = !msg.text || (typeof msg.text === 'string' && msg.text.trim().length === 0);
    if (isEmpty) {
      console.debug('[TranscriptConsumer] ⚠️ Skipping transcript with EMPTY text', {
        interaction_id: interactionId,
        type: msg.type,
        seq: msg.seq,
      });
      // Skip processing empty transcripts - they're not useful
      return;
    }

    console.info('[TranscriptConsumer] Received transcript message', {
      interaction_id: interactionId,
      type: msg.type,
      seq: msg.seq,
      textLength: msg.text?.length || 0,
      textPreview: msg.text?.substring(0, 50) || '',
    });

    // Fix 1.1: Map interaction_id to callId with validation
    // CRITICAL: Ensure callId = interactionId for consistency
    // This must match the callId used in Exotel start event (callSid)
    let callId = interactionId;
    
    // Fix 1.1: Validate callId is not empty
    if (!callId || (typeof callId === 'string' && callId.trim().length === 0)) {
      console.error('[TranscriptConsumer] ❌ Invalid interactionId/callId detected!', {
        interactionId,
        seq: msg.seq,
        note: 'interactionId cannot be null, undefined, or empty. Skipping transcript.',
      });
      return; // Skip processing if callId is invalid
    }
    
    // Fix 1.1: Ensure callId is trimmed and consistent
    callId = String(callId).trim();
    
    // Log callId mapping for debugging
    if (callId !== interactionId) {
      console.warn('[TranscriptConsumer] ⚠️ CallId mismatch detected!', {
        interactionId,
        callId,
        note: 'callId should equal interactionId for proper SSE matching. Using interactionId.',
      });
      callId = String(interactionId).trim(); // Force consistency
    }

    // Forward to ingest-transcript core function
    // CRITICAL FIX: Use direct function call instead of HTTP fetch to avoid network issues
    // This is more efficient and reliable when calling from within the same Next.js process
    const text = msg.text || ''; // Type guard - we know it exists from check above
    
    try {
      // Task 1.3: Enhanced logging for callId flow tracing
      console.log('[DEBUG] CallId flow trace:', {
        step: 'transcript-consumer',
        redisInteractionId: interactionId,
        extractedCallId: callId,
        match: interactionId === callId,
        seq: msg.seq,
        textLength: text.length,
        timestamp: new Date().toISOString(),
      });
      
      console.debug('[TranscriptConsumer] Processing transcript via direct function call', {
        interactionId,
        callId,
        seq: msg.seq,
        textLength: text.length,
        textPreview: text.substring(0, 50),
        method: 'direct_function_call',
        note: 'Using ingestTranscriptCore() directly instead of HTTP fetch for better reliability',
      });

      // Call the core function directly (no HTTP overhead, more reliable)
      // Task 1.3: Log callId being passed to core function
      console.log('[DEBUG] Passing callId to ingestTranscriptCore:', {
        callId,
        callIdType: typeof callId,
        isEmpty: !callId || callId.trim().length === 0,
        seq: msg.seq,
      });
      
      const result = await ingestTranscriptCore({
        callId,
        seq: msg.seq,
        ts: new Date(msg.timestamp_ms).toISOString(),
        text: text,
        tenantId: msg.tenant_id || 'default',
      });

      if (result.ok) {
        console.info('[TranscriptConsumer] ✅ Processed transcript successfully', {
          interaction_id: interactionId,
          callId,
          seq: msg.seq,
          intent: result.intent,
          articlesCount: result.articles?.length || 0,
          method: 'direct_function_call',
        });
      } else {
        console.error('[TranscriptConsumer] ❌ Failed to process transcript', {
          interaction_id: interactionId,
          callId,
          seq: msg.seq,
          error: result.error,
          method: 'direct_function_call',
        });
        
        // Add to dead-letter queue for retry
        this.addToDeadLetterQueue({
          interaction_id: interactionId,
          tenant_id: msg.tenant_id,
          seq: msg.seq,
          type: msg.type,
          text: text,
          confidence: msg.confidence,
          timestamp_ms: msg.timestamp_ms,
          callId,
          error: result.error || 'Unknown error',
          failedAt: Date.now(),
          retryCount: 0,
        });
      }
    } catch (error: any) {
      console.error('[TranscriptConsumer] ❌ Error processing transcript', {
        interaction_id: interactionId,
        callId,
        seq: msg.seq,
        error: error.message || String(error),
        errorName: error.name,
        method: 'direct_function_call',
      });
      
      // Add to dead-letter queue for retry
      this.addToDeadLetterQueue({
        interaction_id: interactionId,
        tenant_id: msg.tenant_id,
        seq: msg.seq,
        type: msg.type,
        text: text,
        confidence: msg.confidence,
        timestamp_ms: msg.timestamp_ms,
        callId,
        error: error.message || String(error),
        failedAt: Date.now(),
        retryCount: 0,
      });
    }
    // Don't throw - continue processing other transcripts
  }

  /**
   * P2 FIX: Add failed transcript to dead-letter queue
   */
  private addToDeadLetterQueue(failed: FailedTranscript): void {
    // Prevent queue from growing too large
    if (this.deadLetterQueue.length >= this.maxDeadLetterSize) {
      // Remove oldest entries (FIFO)
      const removed = this.deadLetterQueue.splice(0, 10);
      console.warn('[TranscriptConsumer] Dead-letter queue full, removed oldest entries', {
        removedCount: removed.length,
        queueSize: this.deadLetterQueue.length,
      });
    }
    
    this.deadLetterQueue.push(failed);
    console.warn('[TranscriptConsumer] Added to dead-letter queue', {
      interaction_id: failed.interaction_id,
      seq: failed.seq,
      queueSize: this.deadLetterQueue.length,
      error: failed.error,
    });
    
    // Start retry processor if not already running
    if (!this.retryInterval) {
      this.startDeadLetterRetryProcessor();
    }
  }

  /**
   * P2 FIX: Retry failed transcripts from dead-letter queue
   */
  private startDeadLetterRetryProcessor(): void {
    if (this.retryInterval) {
      return; // Already running
    }
    
    console.info('[TranscriptConsumer] Starting dead-letter queue retry processor');
    
    // Retry every 30 seconds
    this.retryInterval = setInterval(async () => {
      if (this.deadLetterQueue.length === 0) {
        // Queue empty, stop retry processor
        if (this.retryInterval) {
          clearInterval(this.retryInterval);
          this.retryInterval = null;
        }
        return;
      }
      
      // Process up to 10 failed transcripts per retry cycle
      const toRetry = this.deadLetterQueue.splice(0, 10);
      console.info('[TranscriptConsumer] Retrying failed transcripts', {
        count: toRetry.length,
        remainingInQueue: this.deadLetterQueue.length,
      });
      
      for (const failed of toRetry) {
        // CRITICAL FIX: Remove permanently failed items instead of keeping them in memory
        // Only retry if retry count is below threshold (max 5 retries total)
        if (failed.retryCount >= 5) {
          console.error('[TranscriptConsumer] Max retries exceeded, removing permanently failed transcript', {
            interaction_id: failed.interaction_id,
            seq: failed.seq,
            retryCount: failed.retryCount,
            note: 'Removed from memory to prevent dead-letter queue growth',
          });
          // CRITICAL: Don't add back to queue - remove permanently to prevent memory leak
          continue; // Skip this one, it's permanently failed
        }
        
        try {
          // Try to process again using direct function call
          const result = await ingestTranscriptCore({
            callId: failed.callId,
            seq: failed.seq,
            ts: new Date(failed.timestamp_ms).toISOString(),
            text: failed.text,
            tenantId: failed.tenant_id || 'default',
          });
          
          if (result.ok) {
            console.info('[TranscriptConsumer] ✅ Successfully retried dead-letter transcript', {
              interaction_id: failed.interaction_id,
              seq: failed.seq,
              intent: result.intent,
              articlesCount: result.articles?.length || 0,
            });
            // Success - don't add back to queue
          } else {
            // Still failing - add back with incremented retry count
            failed.retryCount++;
            this.deadLetterQueue.push(failed);
            console.warn('[TranscriptConsumer] Dead-letter retry failed, will retry again', {
              interaction_id: failed.interaction_id,
              seq: failed.seq,
              retryCount: failed.retryCount,
              error: result.error,
            });
          }
        } catch (error: any) {
          // Error - add back with incremented retry count
          failed.retryCount++;
          this.deadLetterQueue.push(failed);
          console.warn('[TranscriptConsumer] Dead-letter retry error, will retry again', {
            interaction_id: failed.interaction_id,
            seq: failed.seq,
            retryCount: failed.retryCount,
            error: error.message || String(error),
          });
        }
      }
    }, 30000); // Retry every 30 seconds
  }

  /**
   * P2 FIX: Get dead-letter queue status
   */
  getDeadLetterQueueStatus(): { size: number; oldestFailedAt: number | null } {
    const oldest = this.deadLetterQueue.length > 0 
      ? Math.min(...this.deadLetterQueue.map(f => f.failedAt))
      : null;
    
    return {
      size: this.deadLetterQueue.length,
      oldestFailedAt: oldest,
    };
  }

  /**
   * Start stream discovery - automatically subscribe to transcript streams
   * 
   * Since Redis Streams doesn't support pattern subscriptions directly,
   * we'll use a background worker that periodically scans for new transcript.* streams
   * and automatically subscribes to them.
   */
  private discoveryInterval: NodeJS.Timeout | null = null;

  private async startStreamDiscovery(): Promise<void> {
    // Run discovery immediately
    await this.discoverAndSubscribeToNewStreams();

    // CRITICAL FIX: Use dynamic interval that backs off when Redis is down
    const runDiscovery = async () => {
      if (!this.isRunning) {
        if (this.discoveryInterval) {
          clearInterval(this.discoveryInterval);
          this.discoveryInterval = null;
        }
        return;
      }

      try {
        await this.discoverAndSubscribeToNewStreams();
        await this.cleanupEndedCallSubscriptions();
        
        // Success - reset failure count and use normal interval (5 seconds)
        this.discoveryFailureCount = 0;
        
        if (this.discoveryInterval) {
          clearInterval(this.discoveryInterval);
        }
        this.discoveryInterval = setTimeout(runDiscovery, 5000);
      } catch (error: any) {
        // Failure - increment failure count and use longer interval (30 seconds) to reduce spam
        this.discoveryFailureCount++;
        this.lastDiscoveryFailureTime = Date.now();
        
        if (this.discoveryInterval) {
          clearInterval(this.discoveryInterval);
        }
        this.discoveryInterval = setTimeout(runDiscovery, 30000);
      }
    };
    
    // Start with normal interval
    this.discoveryInterval = setTimeout(runDiscovery, 5000);

    console.info('[TranscriptConsumer] Stream discovery started (auto-subscribe mode)');
  }

  /**
   * CRITICAL FIX: Clean up subscriptions for ended calls
   * This prevents memory leaks and 502 errors from too many active subscriptions
   */
  private async cleanupEndedCallSubscriptions(): Promise<void> {
    try {
      // Get call registry to check which calls are ended
      const { getCallRegistry } = await import('@/lib/call-registry');
      const callRegistry = getCallRegistry();
      
      // CRITICAL FIX: Check if call registry is available before using
      const health = await callRegistry.checkHealth();
      if (!health.accessible) {
        // Registry not available - skip cleanup silently
        return;
      }
      
      // Get all active calls (only active ones)
      const activeCalls = await callRegistry.getActiveCalls(1000); // Get up to 1000 to check all
      const activeCallIds = new Set(activeCalls.map(call => call.interactionId));
      
      // Find subscriptions for calls that are no longer active
      const subscriptionsToCleanup: string[] = [];
      for (const [interactionId, subscription] of this.subscriptions.entries()) {
        // Check if call is ended (not in active calls list)
        if (!activeCallIds.has(interactionId)) {
          // Also check if subscription is old (created more than 1 hour ago)
          const ageMs = Date.now() - subscription.createdAt.getTime();
          const oneHourMs = 60 * 60 * 1000;
          
          if (ageMs > oneHourMs) {
            subscriptionsToCleanup.push(interactionId);
          }
        }
      }
      
      // Unsubscribe from ended/old calls
      if (subscriptionsToCleanup.length > 0) {
        console.info('[TranscriptConsumer] 🧹 Cleaning up subscriptions for ended/old calls', {
          count: subscriptionsToCleanup.length,
          interactionIds: subscriptionsToCleanup.slice(0, 5), // Log first 5
        });
        
        for (const interactionId of subscriptionsToCleanup) {
          try {
            await this.unsubscribeFromInteraction(interactionId);
          } catch (error: any) {
            console.warn('[TranscriptConsumer] Failed to cleanup subscription', {
              interactionId,
              error: error.message,
            });
          }
        }
        
        console.info('[TranscriptConsumer] ✅ Cleaned up subscriptions', {
          count: subscriptionsToCleanup.length,
          remainingSubscriptions: this.subscriptions.size,
        });
      }
    } catch (error: any) {
      // CRITICAL FIX: Don't log connection errors as warnings
      const isConnectionError = 
        error.message?.includes('Connection is closed') ||
        error.message?.includes('Redis client not initialized') ||
        error.message?.includes('not accessible');
      
      if (isConnectionError) {
        // Silently skip cleanup when Redis is unavailable
        return;
      }
      
      // Only log non-connection errors
      console.warn('[TranscriptConsumer] Cleanup error (non-critical):', {
        error: error.message || String(error),
      });
    }
  }

  /**
   * Discover and subscribe to new transcript streams
   * 
   * Uses Redis SCAN to find all transcript.* streams and auto-subscribes
   * 
   * This method is exposed for testing and manual triggering
   */
  async discoverAndSubscribeToNewStreams(): Promise<void> {
    try {
      // Access Redis client from adapter
      const redisAdapter = this.pubsub as any;
      
      // CRITICAL FIX: Check if Redis is actually connected before using it
      if (!redisAdapter.redis) {
        // Redis not initialized - skip discovery
        this.discoveryFailureCount++;
        this.lastDiscoveryFailureTime = Date.now();
        return;
      }
      
      const redis = redisAdapter.redis;
      
      // CRITICAL FIX: Check connection status before using
      if (redis.status !== 'ready' && redis.status !== 'connecting') {
        // Connection is closed or in error state - skip discovery
        this.discoveryFailureCount++;
        this.lastDiscoveryFailureTime = Date.now();
        return; // Skip this discovery cycle
      }
      
      // CRITICAL FIX: Check if we're in backoff period
      if (this.discoveryFailureCount > 0) {
        const timeSinceLastFailure = Date.now() - this.lastDiscoveryFailureTime;
        if (timeSinceLastFailure < this.DISCOVERY_BACKOFF_MS) {
          // Still in backoff - skip discovery
          return;
        }
        // Backoff expired - reset counter
        this.discoveryFailureCount = 0;
      }
      
      // Use SCAN instead of KEYS for better performance (non-blocking)
      let cursor = '0';
      const streamPattern = 'transcript.*';
      const discoveredStreams = new Set<string>();
      let scanCount = 0;
      
      try {
        do {
          const result = await redis.scan(
            cursor,
            'MATCH',
            streamPattern,
            'COUNT',
            '100'
          );
          
          // Handle both array and tuple responses
          const [nextCursor, keys] = Array.isArray(result) && result.length === 2
            ? result
            : [result[0], result[1] || []];
          
          cursor = nextCursor;
          scanCount++;
          
          if (Array.isArray(keys)) {
            for (const key of keys) {
              if (typeof key === 'string') {
                discoveredStreams.add(key);
              }
            }
          }
          
          // Safety limit to prevent infinite loops
          if (scanCount > 100) {
            console.warn('[TranscriptConsumer] SCAN limit reached, stopping discovery');
            break;
          }
        } while (cursor !== '0'); // Redis SCAN always returns string cursor
        
        // Success - reset failure count
        this.discoveryFailureCount = 0;
        
        // Subscribe to discovered streams
        let newSubscriptions = 0;
        for (const key of discoveredStreams) {
          const match = key.match(/^transcript\.(.+)$/);
          if (match && match[1]) {
            const interactionId = match[1];
            
            if (!this.subscriptions.has(interactionId)) {
              try {
                console.info('[TranscriptConsumer] Auto-discovered transcript stream', { 
                  interactionId,
                  stream: key,
                });
                await this.subscribeToInteraction(interactionId);
                newSubscriptions++;
              } catch (subError: any) {
                console.error('[TranscriptConsumer] Failed to subscribe to discovered stream', {
                  interactionId,
                  error: subError.message || String(subError),
                });
              }
            }
          }
        }
        
        if (newSubscriptions > 0) {
          console.info('[TranscriptConsumer] Auto-subscribed to new streams', {
            newSubscriptions,
            totalSubscriptions: this.subscriptions.size,
          });
        }
      } catch (scanError: any) {
        // Redis operation failed - increment failure count
        this.discoveryFailureCount++;
        this.lastDiscoveryFailureTime = Date.now();
        throw scanError; // Re-throw to be caught by outer catch
      }
    } catch (error: any) {
      // CRITICAL FIX: Don't spam errors for connection issues
      const isConnectionError = 
        error.message?.includes('Connection is closed') ||
        error.message?.includes('Redis client not initialized') ||
        error.message?.includes('not accessible');
      
      if (isConnectionError) {
        // Connection errors are expected when Redis is down - log as debug/warn
        if (this.discoveryFailureCount <= 3) {
          // Only log first few failures, then silence
          console.debug('[TranscriptConsumer] Stream discovery skipped (Redis unavailable)', {
            failureCount: this.discoveryFailureCount,
            backoff: this.discoveryFailureCount > 0 ? `${this.DISCOVERY_BACKOFF_MS / 1000}s` : 'none',
          });
        }
        // Don't re-throw - just skip this discovery cycle
        return;
      }
      
      // Only log non-connection errors
      console.warn('[TranscriptConsumer] Stream discovery error', {
        error: error.message || String(error),
      });
    }
  }

  /**
   * Unsubscribe from a specific interaction
   */
  async unsubscribeFromInteraction(interactionId: string): Promise<void> {
    const subscription = this.subscriptions.get(interactionId);
    if (!subscription) {
      return;
    }

    try {
      await subscription.handle.unsubscribe();
      this.subscriptions.delete(interactionId);
      console.info('[TranscriptConsumer] Unsubscribed from transcript topic', {
        interactionId,
        transcriptCount: subscription.transcriptCount,
      });
    } catch (error: any) {
      console.error('[TranscriptConsumer] Error unsubscribing', {
        interactionId,
        error: error.message || String(error),
      });
    }
  }

  /**
   * Stop the transcript consumer
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.info('[TranscriptConsumer] Stopping transcript consumer...');
    this.isRunning = false;

    // P2 FIX: Stop dead-letter retry processor
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
      console.info('[TranscriptConsumer] Stopped dead-letter retry processor');
    }

    // Stop discovery interval
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }

    // Unsubscribe from all topics
    const unsubscribePromises = Array.from(this.subscriptions.keys()).map((interactionId) =>
      this.unsubscribeFromInteraction(interactionId)
    );
    await Promise.all(unsubscribePromises);

    // Close pub/sub adapter
    try {
      await this.pubsub.close();
    } catch (error: any) {
      console.error('[TranscriptConsumer] Error closing pub/sub adapter:', error);
    }

    console.info('[TranscriptConsumer] ✅ Transcript consumer stopped');
  }

  /**
   * P2 FIX: Validate Redis connection
   */
  async validateRedisConnection(): Promise<{ accessible: boolean; error?: string }> {
    try {
      const redisAdapter = this.pubsub as any;
      if (!redisAdapter.redis) {
        return { accessible: false, error: 'Redis client not initialized' };
      }
      
      const redis = redisAdapter.redis;
      
      // Check if Redis is connected
      if (redis.status !== 'ready' && redis.status !== 'connecting') {
        return { accessible: false, error: `Redis status: ${redis.status}` };
      }
      
      // Try a simple PING command
      const result = await redis.ping();
      if (result === 'PONG') {
        return { accessible: true };
      }
      
      return { accessible: false, error: 'PING did not return PONG' };
    } catch (error: any) {
      return { accessible: false, error: error.message || String(error) };
    }
  }

  /**
   * P2 FIX: Validate API endpoint is reachable
   */
  async validateApiConnection(): Promise<{ accessible: boolean; error?: string; statusCode?: number }> {
    try {
      // Try to reach the health endpoint or a simple GET request
      const healthUrl = `${this.baseUrl}/api/health`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      return {
        accessible: response.ok,
        statusCode: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error: any) {
      return {
        accessible: false,
        error: error.message || String(error),
      };
    }
  }

  /**
   * P2 FIX: Get comprehensive health status including connection validation
   */
  async getHealthStatus(): Promise<{
    isRunning: boolean;
    subscriptionsCount: number;
    redis: { accessible: boolean; error?: string };
    api: { accessible: boolean; error?: string; statusCode?: number };
    deadLetterQueue: { size: number; oldestFailedAt: number | null };
    baseUrl: string;
    apiUrl: string;
  }> {
    const [redisStatus, apiStatus] = await Promise.all([
      this.validateRedisConnection(),
      this.validateApiConnection(),
    ]);
    
    const deadLetterStatus = this.getDeadLetterQueueStatus();
    
    return {
      isRunning: this.isRunning,
      subscriptionsCount: this.subscriptions.size,
      redis: redisStatus,
      api: apiStatus,
      deadLetterQueue: deadLetterStatus,
      baseUrl: this.baseUrl,
      apiUrl: this.nextJsApiUrl,
    };
  }

  getStatus(): {
    isRunning: boolean;
    subscriptionsCount: number;
    subscriptions: Array<{
      interactionId: string;
      transcriptCount: number;
      createdAt: Date;
    }>;
    hasDiscoveryInterval: boolean;
    deadLetterQueue: { size: number; oldestFailedAt: number | null };
  } {
    // Log status check for debugging
    if (!this.isRunning) {
      console.debug('[TranscriptConsumer] Status check: consumer is NOT running', {
        hasPubsub: !!this.pubsub,
        subscriptionsCount: this.subscriptions.size,
        hasDiscoveryInterval: !!this.discoveryInterval,
      });
    }
    
    const deadLetterStatus = this.getDeadLetterQueueStatus();
    
    return {
      isRunning: this.isRunning,
      subscriptionsCount: this.subscriptions.size,
      subscriptions: Array.from(this.subscriptions.values()).map((sub) => ({
        interactionId: sub.interactionId,
        transcriptCount: sub.transcriptCount,
        createdAt: sub.createdAt,
      })),
      hasDiscoveryInterval: !!this.discoveryInterval,
      deadLetterQueue: deadLetterStatus,
    };
  }
}

// Singleton instance
let consumerInstance: TranscriptConsumer | null = null;

/**
 * Get or create the transcript consumer instance
 */
export function getTranscriptConsumer(): TranscriptConsumer {
  if (!consumerInstance) {
    consumerInstance = new TranscriptConsumer();
  }
  return consumerInstance;
}

/**
 * Start the transcript consumer (call this when Next.js app starts)
 */
export async function startTranscriptConsumer(): Promise<void> {
  const consumer = getTranscriptConsumer();
  await consumer.start();
}

/**
 * Stop the transcript consumer (call this when Next.js app shuts down)
 */
export async function stopTranscriptConsumer(): Promise<void> {
  if (consumerInstance) {
    await consumerInstance.stop();
    consumerInstance = null;
  }
}

/**
 * Subscribe to transcripts for a specific interaction
 * Call this when a new call starts
 */
export async function subscribeToTranscripts(interactionId: string): Promise<void> {
  const consumer = getTranscriptConsumer();
  if (consumer['isRunning']) {
    await consumer.subscribeToInteraction(interactionId);
  } else {
    console.warn('[TranscriptConsumer] Consumer not running, starting...');
    await consumer.start();
    await consumer.subscribeToInteraction(interactionId);
  }
}

/**
 * Unsubscribe from transcripts for a specific interaction
 * Call this when a call ends
 */
export async function unsubscribeFromTranscripts(interactionId: string): Promise<void> {
  const consumer = getTranscriptConsumer();
  await consumer.unsubscribeFromInteraction(interactionId);
}

/**
 * Get consumer status (for monitoring)
 */
export function getTranscriptConsumerStatus() {
  const consumer = getTranscriptConsumer();
  return consumer.getStatus();
}

/**
 * Trigger stream discovery manually (for health checks and manual triggers)
 */
export async function triggerStreamDiscovery(): Promise<void> {
  const consumer = getTranscriptConsumer();
  if (consumer['isRunning']) {
    await consumer['discoverAndSubscribeToNewStreams']();
  } else {
    console.warn('[TranscriptConsumer] Consumer not running, cannot trigger discovery');
  }
}


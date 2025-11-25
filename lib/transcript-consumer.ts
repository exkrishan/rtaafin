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
  private maxDeadLetterSize: number = 1000; // Max failed transcripts to keep in memory
  private retryInterval: NodeJS.Timeout | null = null;

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

      console.info('[TranscriptConsumer] ✅ Subscribed to transcript topic', { interactionId, topic });
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

    // Map interaction_id to callId
    // CRITICAL: Ensure callId = interactionId for consistency
    // This must match the callId used in Exotel start event (callSid)
    const callId = interactionId;

    // Log callId mapping for debugging
    if (callId !== interactionId) {
      console.warn('[TranscriptConsumer] ⚠️ CallId mismatch detected!', {
        interactionId,
        callId,
        note: 'callId should equal interactionId for proper SSE matching',
      });
    }

    // Forward to ingest-transcript core function
    // CRITICAL FIX: Use direct function call instead of HTTP fetch to avoid network issues
    // This is more efficient and reliable when calling from within the same Next.js process
    const text = msg.text || ''; // Type guard - we know it exists from check above
    
    try {
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
        // Only retry if retry count is below threshold (max 5 retries total)
        if (failed.retryCount >= 5) {
          console.error('[TranscriptConsumer] Max retries exceeded for dead-letter transcript', {
            interaction_id: failed.interaction_id,
            seq: failed.seq,
            retryCount: failed.retryCount,
          });
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

    // Start periodic discovery (every 5 seconds for faster real-time discovery)
    // CRITICAL FIX: Reduced from 30s to 5s to catch new transcript streams faster
    this.discoveryInterval = setInterval(async () => {
      if (!this.isRunning) {
        if (this.discoveryInterval) {
          clearInterval(this.discoveryInterval);
          this.discoveryInterval = null;
        }
        return;
      }

      try {
        await this.discoverAndSubscribeToNewStreams();
      } catch (error: any) {
        console.error('[TranscriptConsumer] Stream discovery error:', error);
      }
    }, 5000); // CRITICAL FIX: Reduced from 30000ms (30s) to 5000ms (5s) for faster discovery

    console.info('[TranscriptConsumer] Stream discovery started (auto-subscribe mode)');
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
      
      // Check if we have direct Redis access
      if (redisAdapter.redis) {
        const redis = redisAdapter.redis;
        
        // Use SCAN instead of KEYS for better performance (non-blocking)
        let cursor = '0';
        const streamPattern = 'transcript.*';
        const discoveredStreams = new Set<string>();
        let scanCount = 0;
        
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
      } else {
        // Fallback: Manual subscription mode
        // Components should call subscribeToInteraction() when a call starts
        // This is expected in some configurations where Redis client is not directly accessible
        if (this.subscriptions.size === 0) {
          console.debug('[TranscriptConsumer] Redis client not accessible, using manual subscription mode');
          console.debug('[TranscriptConsumer] Use POST /api/transcripts/subscribe with interactionId to subscribe');
        }
      }
    } catch (error: any) {
      // Don't log as error - discovery is best-effort and may fail in some configurations
      // Only log if it's a critical error
      if (error.message && !error.message.includes('not accessible')) {
        console.warn('[TranscriptConsumer] Stream discovery error', {
          error: error.message || String(error),
        });
      }
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


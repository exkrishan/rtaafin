/**
 * Transcript Consumer - Background worker that consumes transcripts from Redis
 * and forwards them to the ingest-transcript API for intent detection and SSE broadcast.
 * 
 * This bridges the gap between ASR Worker (publishes to Redis) and Frontend (receives via SSE).
 */

import { createPubSubAdapterFromEnv } from './pubsub';
import { transcriptTopic, parseTopic } from './pubsub/topics';

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

class TranscriptConsumer {
  private pubsub: ReturnType<typeof createPubSubAdapterFromEnv>;
  private subscriptions: Map<string, ActiveSubscription> = new Map();
  private isRunning: boolean = false;
  private baseUrl: string;
  private nextJsApiUrl: string;

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

    // Forward to ingest-transcript API
    // This will trigger intent detection and SSE broadcast
    // At this point, we know msg.text exists and is not empty (checked above)
    const text = msg.text || ''; // Type guard - we know it exists from check above
    
    // Retry logic for failed API calls
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000; // 1 second
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.debug('[TranscriptConsumer] Forwarding transcript to ingest API', {
          interactionId,
          callId,
          seq: msg.seq,
          textLength: text.length,
          textPreview: text.substring(0, 50),
          attempt,
          maxRetries: MAX_RETRIES,
          apiUrl: this.nextJsApiUrl,
        });

        const response = await fetch(this.nextJsApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': msg.tenant_id || 'default',
          },
          body: JSON.stringify({
            callId,
            seq: msg.seq,
            ts: new Date(msg.timestamp_ms).toISOString(),
            text: text, // Use the type-guarded text variable
          }),
          // Add timeout to prevent hanging
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastError = new Error(`HTTP ${response.status}: ${errorText}`);
          
          // Don't retry on client errors (4xx), only on server errors (5xx) and network errors
          if (response.status >= 400 && response.status < 500) {
            console.error('[TranscriptConsumer] Client error (not retrying)', {
              interaction_id: interactionId,
              callId,
              seq: msg.seq,
              status: response.status,
              error: errorText,
              attempt,
            });
            break; // Don't retry client errors
          }
          
          // Retry on server errors
          if (attempt < MAX_RETRIES) {
            console.warn('[TranscriptConsumer] Server error, retrying...', {
              interaction_id: interactionId,
              callId,
              seq: msg.seq,
              status: response.status,
              attempt,
              nextRetryIn: `${RETRY_DELAY_MS}ms`,
            });
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt)); // Exponential backoff
            continue;
          } else {
            console.error('[TranscriptConsumer] Failed to forward transcript after all retries', {
              interaction_id: interactionId,
              callId,
              seq: msg.seq,
              status: response.status,
              error: errorText,
              attempts: MAX_RETRIES,
            });
          }
        } else {
          // Success!
          const result = await response.json();
          console.info('[TranscriptConsumer] ✅ Forwarded transcript successfully', {
            interaction_id: interactionId,
            callId,
            seq: msg.seq,
            intent: result.intent,
            articlesCount: result.articles?.length || 0,
            attempt,
          });
          lastError = null; // Clear error on success
          break; // Exit retry loop on success
        }
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a timeout or network error (retry these)
        const isRetryable = error.name === 'AbortError' || 
                           error.message?.includes('fetch failed') ||
                           error.message?.includes('ECONNREFUSED') ||
                           error.message?.includes('ETIMEDOUT');
        
        if (isRetryable && attempt < MAX_RETRIES) {
          console.warn('[TranscriptConsumer] Network error, retrying...', {
            interaction_id: interactionId,
            callId,
            seq: msg.seq,
            error: error.message || String(error),
            attempt,
            nextRetryIn: `${RETRY_DELAY_MS * attempt}ms`,
          });
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt)); // Exponential backoff
          continue;
        } else {
          // Non-retryable error or max retries reached
          console.error('[TranscriptConsumer] Error forwarding transcript', {
            interaction_id: interactionId,
            callId,
            seq: msg.seq,
            error: error.message || String(error),
            errorName: error.name,
            isRetryable,
            attempt,
            maxRetries: MAX_RETRIES,
            apiUrl: this.nextJsApiUrl,
            note: isRetryable && attempt >= MAX_RETRIES 
              ? 'Max retries reached' 
              : 'Non-retryable error',
          });
          break; // Exit retry loop
        }
      }
    }
    
    // Log final error if all retries failed
    if (lastError) {
      console.error('[TranscriptConsumer] ❌ Failed to forward transcript after all attempts', {
        interaction_id: interactionId,
        callId,
        seq: msg.seq,
        finalError: lastError.message || String(lastError),
        apiUrl: this.nextJsApiUrl,
        suggestion: 'Check if ingest API is accessible and baseUrl is correctly configured',
      });
    }
    // Don't throw - continue processing other transcripts
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

    // Start periodic discovery (every 30 seconds to reduce log spam)
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
    }, 30000); // Changed from 5000ms (5s) to 30000ms (30s) to reduce log spam

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
   * Get status information
   */
  getStatus(): {
    isRunning: boolean;
    subscriptionCount: number;
    subscriptions: Array<{
      interactionId: string;
      transcriptCount: number;
      createdAt: Date;
    }>;
  } {
    // Log status check for debugging
    if (!this.isRunning) {
      console.debug('[TranscriptConsumer] Status check: consumer is NOT running', {
        hasPubsub: !!this.pubsub,
        subscriptionCount: this.subscriptions.size,
        hasDiscoveryInterval: !!this.discoveryInterval,
      });
    }
    return {
      isRunning: this.isRunning,
      subscriptionCount: this.subscriptions.size,
      subscriptions: Array.from(this.subscriptions.values()).map((sub) => ({
        interactionId: sub.interactionId,
        transcriptCount: sub.transcriptCount,
        createdAt: sub.createdAt,
      })),
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


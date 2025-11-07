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
    // In production (Render), use the service's own URL
    // In development, use localhost
    const port = process.env.PORT || process.env.NEXT_PUBLIC_PORT || '3000';
    
    // For internal calls, prefer localhost or service URL
    if (process.env.NEXT_PUBLIC_BASE_URL) {
      this.baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    } else if (process.env.VERCEL_URL) {
      this.baseUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      // Default to localhost for development
      this.baseUrl = `http://localhost:${port}`;
    }
    
    this.nextJsApiUrl = `${this.baseUrl}/api/calls/ingest-transcript`;

    console.info('[TranscriptConsumer] Initialized', {
      baseUrl: this.baseUrl,
      apiUrl: this.nextJsApiUrl,
      pubsubAdapter: process.env.PUBSUB_ADAPTER || 'redis_streams',
      port,
    });
  }

  /**
   * Start the transcript consumer
   * Subscribes to all transcript topics using pattern matching
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[TranscriptConsumer] Already running');
      return;
    }

    this.isRunning = true;
    console.info('[TranscriptConsumer] Starting transcript consumer...');

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
      this.startStreamDiscovery();

      console.info('[TranscriptConsumer] ✅ Transcript consumer started');
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
    // TEMPORARY: Allow empty transcripts through for debugging (remove after fix is verified)
    const isEmpty = !msg.text || (typeof msg.text === 'string' && msg.text.trim().length === 0);
    if (isEmpty) {
      console.warn('[TranscriptConsumer] ⚠️ Received transcript with EMPTY text (allowing through for debugging)', {
        interaction_id: interactionId,
        type: msg.type,
        seq: msg.seq,
        msgKeys: Object.keys(msg),
        msgSample: JSON.stringify(msg).substring(0, 200),
      });
      // TEMPORARY: Forward empty transcripts with placeholder text for debugging
      // Remove this after fix is verified and new calls work
      msg.text = msg.text || '[EMPTY - Debug Mode]';
    }

    console.info('[TranscriptConsumer] Received transcript message', {
      interaction_id: interactionId,
      type: msg.type,
      seq: msg.seq,
      textLength: msg.text?.length || 0,
      textPreview: msg.text?.substring(0, 50) || '',
    });

    // Map interaction_id to callId
    // For now, use interaction_id as callId (they should match)
    // In production, you might have a mapping table
    const callId = interactionId;

    // Forward to ingest-transcript API
    // This will trigger intent detection and SSE broadcast
    try {
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
          text: msg.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TranscriptConsumer] Failed to forward transcript', {
          interaction_id: interactionId,
          callId,
          seq: msg.seq,
          status: response.status,
          error: errorText,
        });
      } else {
        const result = await response.json();
        console.info('[TranscriptConsumer] ✅ Forwarded transcript successfully', {
          interaction_id: interactionId,
          callId,
          seq: msg.seq,
          intent: result.intent,
          articlesCount: result.articles?.length || 0,
        });
      }
    } catch (error: any) {
      console.error('[TranscriptConsumer] Error forwarding transcript', {
        interaction_id: interactionId,
        callId,
        seq: msg.seq,
        error: error.message || String(error),
      });
      // Don't throw - continue processing other transcripts
    }
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

    // Start periodic discovery (every 5 seconds)
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
    }, 5000);

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


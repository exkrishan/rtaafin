/**
 * Redis Streams adapter for pub/sub
 * Uses XADD for publishing and XREADGROUP for consuming with ack semantics
 */

// Dynamic import for optional ioredis dependency
// This allows the module to be loaded even if ioredis is not installed
let ioredis: any = null;
try {
  ioredis = require('ioredis');
} catch (e) {
  // ioredis is optional - adapter will throw if used without it
}

import { PubSubAdapter, MessageEnvelope, SubscriptionHandle } from '../types';

// Type definitions (using any since ioredis may not be available)
type RedisInstance = any;
type RedisOptions = any;

interface RedisSubscription {
  id: string;
  topic: string;
  consumerGroup: string;
  consumerName: string;
  handler: (msg: MessageEnvelope) => Promise<void>;
  redis: RedisInstance;
  running: boolean;
}

// Singleton pattern: Reuse Redis connections per URL to prevent max clients error
const connectionCache = new Map<string, RedisInstance>();
const connectionRefCount = new Map<string, number>(); // Track how many adapters use each connection

// Cleanup dead connections periodically
setInterval(() => {
  for (const [url, conn] of connectionCache.entries()) {
    if (conn && conn.status !== 'ready' && conn.status !== 'connecting') {
      console.warn(`[RedisStreamsAdapter] Removing dead connection from cache: ${url}`);
      connectionCache.delete(url);
      connectionRefCount.delete(url);
      try {
        conn.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
}, 30000); // Check every 30 seconds

export class RedisStreamsAdapter implements PubSubAdapter {
  private redis: RedisInstance | null = null;
  private subscriptions: Map<string, RedisSubscription> = new Map();
  private consumerGroup: string;
  private consumerName: string;
  private defaultRedisOptions: RedisOptions;
  private redisUrl: string;

  constructor(config?: { url?: string; consumerGroup?: string; consumerName?: string }) {
    const url = config?.url || process.env.REDIS_URL || 'redis://localhost:6379';
    this.redisUrl = url;
    this.consumerGroup = config?.consumerGroup || process.env.REDIS_CONSUMER_GROUP || 'agent-assist';
    this.consumerName = config?.consumerName || process.env.REDIS_CONSUMER_NAME || `consumer-${process.pid}`;

    this.defaultRedisOptions = {
      retryStrategy: (times: number) => {
        // Exponential backoff with max delay
        // Return null to stop retrying after max attempts
        if (times > 10) {
          console.error('[RedisStreamsAdapter] Max retries reached, stopping connection attempts');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: null, // Use retryStrategy instead
      enableReadyCheck: true,
      // Connection pool settings to prevent max clients error
      lazyConnect: false,
      keepAlive: 30000, // Keep connections alive
      connectTimeout: 10000,
    };

    if (!ioredis) {
      throw new Error('ioredis is not installed. Install it with: npm install ioredis');
    }
    
    // SINGLETON: Reuse existing connection for this URL if available
    if (connectionCache.has(url)) {
      const cachedConnection = connectionCache.get(url);
      // Check if connection is still valid and ready
      if (cachedConnection && (cachedConnection.status === 'ready' || cachedConnection.status === 'connecting')) {
        console.info('[RedisStreamsAdapter] Reusing existing Redis connection:', url, `(status: ${cachedConnection.status})`);
        this.redis = cachedConnection;
        // Increment reference count
        connectionRefCount.set(url, (connectionRefCount.get(url) || 0) + 1);
      } else {
        // Connection is dead, remove from cache and create new one
        console.warn('[RedisStreamsAdapter] Cached connection is dead, creating new one:', url);
        connectionCache.delete(url);
        connectionRefCount.delete(url);
        try {
          cachedConnection?.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
        this.redis = this.createNewConnection(url);
      }
    } else {
      this.redis = this.createNewConnection(url);
    }

    this.redis.on('error', (err: Error) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[RedisStreamsAdapter] Redis error:', errorMsg);
      
      // If max clients error, don't retry immediately - wait longer
      if (errorMsg.includes('max number of clients')) {
        console.warn('[RedisStreamsAdapter] Max clients reached - will retry after delay');
        // Don't create new connections on error
      }
    });

    this.redis.on('connect', () => {
      console.info('[RedisStreamsAdapter] Connected to Redis:', url);
    });

    this.redis.on('close', () => {
      console.warn('[RedisStreamsAdapter] Redis connection closed:', url);
      // Remove from cache when closed (only if this is the cached connection)
      if (connectionCache.get(url) === this.redis) {
        const refCount = connectionRefCount.get(url) || 0;
        if (refCount <= 1) {
          // Last reference, safe to remove
          connectionCache.delete(url);
          connectionRefCount.delete(url);
        } else {
          // Other adapters still using it, just decrement ref count
          connectionRefCount.set(url, refCount - 1);
        }
      }
    });
  }

  private createNewConnection(url: string): RedisInstance {
    console.info('[RedisStreamsAdapter] Creating new Redis connection:', url);
    const connection = new ioredis(url, this.defaultRedisOptions);
    connectionCache.set(url, connection);
    connectionRefCount.set(url, 1);
    
    // Add error handler to remove from cache on fatal errors
    connection.on('error', (err: Error) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('max number of clients') || errorMsg.includes('ECONNREFUSED')) {
        // Don't remove on max clients - might be temporary
        // But do remove on connection refused (server down)
        if (errorMsg.includes('ECONNREFUSED')) {
          console.warn('[RedisStreamsAdapter] Connection refused, removing from cache:', url);
          connectionCache.delete(url);
          connectionRefCount.delete(url);
        }
      }
    });
    
    return connection;
  }

  async publish(topic: string, message: any): Promise<string | void> {
    if (!this.redis) {
      throw new Error('Redis client not initialized. ioredis is required.');
    }
    
    try {
      const envelope: MessageEnvelope = {
        ...message,
        timestamp_ms: message.timestamp_ms || Date.now(),
      };

      // XADD topic * field1 value1 field2 value2 ...
      // Use * for auto-generated message ID
      const msgId = await this.redis.xadd(
        topic,
        '*',
        'data',
        JSON.stringify(envelope)
      );

      return msgId as string;
    } catch (error: unknown) {
      console.error('[RedisStreamsAdapter] Publish error:', error);
      throw error;
    }
  }

  async subscribe(
    topic: string,
    handler: (msg: MessageEnvelope) => Promise<void>
  ): Promise<SubscriptionHandle> {
    const id = `sub-${Date.now()}-${Math.random()}`;

    // Create consumer group if it doesn't exist
    await this.ensureConsumerGroup(topic, this.consumerGroup);

    if (!this.redis) {
      throw new Error('Redis client not initialized. ioredis is required.');
    }
    
    // REUSE the main Redis connection instead of creating a new one
    // This prevents hitting Redis Cloud's max client limit
    // ioredis supports concurrent XREADGROUP calls on the same connection
    const subscriptionRedis = this.redis;

    const subscription: RedisSubscription = {
      id,
      topic,
      consumerGroup: this.consumerGroup,
      consumerName: `${this.consumerName}-${id}`,
      handler,
      redis: subscriptionRedis,
      running: true,
    };

    this.subscriptions.set(id, subscription);

    // Start consuming messages
    this.startConsumer(subscription);

    return {
      id,
      topic,
      unsubscribe: async () => {
        await this.unsubscribe(id);
      },
    };
  }

  private async ensureConsumerGroup(topic: string, groupName: string): Promise<void> {
    try {
      // Try to create consumer group starting from 0 (beginning of stream)
      await this.redis.xgroup('CREATE', topic, groupName, '0', 'MKSTREAM');
    } catch (error: unknown) {
      // BUSYGROUP means group already exists - that's fine
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('BUSYGROUP')) {
        // Group exists, continue
        return;
      }
      // Other errors might mean stream doesn't exist yet, try without MKSTREAM
      try {
        await this.redis.xgroup('CREATE', topic, groupName, '0');
      } catch (err2: unknown) {
        const err2Message = err2 instanceof Error ? err2.message : String(err2);
        if (err2Message.includes('BUSYGROUP')) {
          // Group exists, continue
          return;
        }
        // If stream doesn't exist, it will be created on first XADD
        // We can ignore this error
      }
    }
  }

  private async startConsumer(subscription: RedisSubscription): Promise<void> {
    const { topic, consumerGroup, consumerName, handler, redis } = subscription;

    const consume = async () => {
      while (subscription.running) {
        try {
          // XREADGROUP GROUP group consumer COUNT count BLOCK blockms STREAMS key [key ...] id [id ...]
          // Use '>' to read new messages, or '0' to read pending messages
          const results = await redis.xreadgroup(
            'GROUP',
            consumerGroup,
            consumerName,
            'COUNT',
            1,
            'BLOCK',
            1000, // Block for 1 second
            'STREAMS',
            topic,
            '>' // Read new messages
          ) as [string, [string, string[]][]][] | null;

          if (results && results.length > 0) {
            const [streamName, messages] = results[0];
            if (messages && messages.length > 0) {
              for (const messageEntry of messages) {
                const [msgId, fields] = messageEntry;
                try {
                  // Parse message - fields is [key1, value1, key2, value2, ...]
                  const dataIndex = fields.findIndex((f: string) => f === 'data');
                  if (dataIndex >= 0 && dataIndex + 1 < fields.length) {
                    const envelope = JSON.parse(fields[dataIndex + 1]) as MessageEnvelope;
                    await handler(envelope);
                    // Note: ACK is handled separately via ack() method
                  }
                } catch (error: unknown) {
                  console.error(`[RedisStreamsAdapter] Error processing message ${msgId}:`, error);
                  // Don't ack on error - message will be retried
                }
              }
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('max number of clients')) {
            // Max clients error - wait much longer and DON'T create new connections
            console.warn(`[RedisStreamsAdapter] Max clients reached, waiting 30s before retry...`);
            await new Promise((resolve) => setTimeout(resolve, 30000));
            // Check if subscription is still running before continuing
            if (!subscription.running) {
              break;
            }
            continue;
          }
          if (errorMessage.includes('Connection')) {
            // Connection error - wait and retry
            console.warn(`[RedisStreamsAdapter] Connection issue, retrying in 5s...`);
            await new Promise((resolve) => setTimeout(resolve, 5000));
            if (!subscription.running) {
              break;
            }
            continue;
          }
          console.error('[RedisStreamsAdapter] Consumer error:', error);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    };

    // Start consuming in background
    consume().catch((error: unknown) => {
      console.error('[RedisStreamsAdapter] Consumer loop error:', error);
    });
  }

  async ack(handle: SubscriptionHandle, msgId: string): Promise<void> {
    const subscription = this.subscriptions.get(handle.id);
    if (!subscription) {
      throw new Error(`Subscription ${handle.id} not found`);
    }

    try {
      // XACK topic group id [id ...]
      await subscription.redis.xack(
        subscription.topic,
        subscription.consumerGroup,
        msgId
      );
    } catch (error: unknown) {
      console.error('[RedisStreamsAdapter] ACK error:', error);
      throw error;
    }
  }

  private async unsubscribe(id: string): Promise<void> {
    const subscription = this.subscriptions.get(id);
    if (subscription) {
      subscription.running = false;
      // Don't quit the shared Redis connection - only stop the consumer loop
      // The connection is shared and will be closed in close()
      this.subscriptions.delete(id);
    }
  }

  async close(): Promise<void> {
    // Stop all subscriptions
    const unsubscribePromises = Array.from(this.subscriptions.keys()).map((id) =>
      this.unsubscribe(id)
    );
    await Promise.all(unsubscribePromises);

    // Decrement reference count
    const refCount = connectionRefCount.get(this.redisUrl) || 0;
    if (refCount > 1) {
      // Other adapters are using this connection, just decrement
      connectionRefCount.set(this.redisUrl, refCount - 1);
      console.info('[RedisStreamsAdapter] Keeping Redis connection open (other adapters using it)');
      return;
    }
    
    // We're the last user, safe to close
    if (this.redis) {
      try {
        await this.redis.quit();
        connectionCache.delete(this.redisUrl);
        connectionRefCount.delete(this.redisUrl);
        console.info('[RedisStreamsAdapter] Closed Redis connection:', this.redisUrl);
      } catch (error: unknown) {
        console.error('[RedisStreamsAdapter] Error closing connection:', error);
        // Force disconnect if quit fails
        try {
          this.redis.disconnect();
        } catch (e) {
          // Ignore
        }
        connectionCache.delete(this.redisUrl);
        connectionRefCount.delete(this.redisUrl);
      }
    }
  }
}


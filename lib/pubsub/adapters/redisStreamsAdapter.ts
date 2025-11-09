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
  firstRead: boolean; // Track if this is the first read for this subscription
  lastReadId: string; // Track last read message ID
}

// Singleton pattern: Reuse Redis connections per URL to prevent max clients error
const connectionCache = new Map<string, RedisInstance>();
const connectionRefCount = new Map<string, number>(); // Track how many adapters use each connection
const maxClientsErrorTime = new Map<string, number>(); // Track when max clients error occurred per URL
const MAX_CLIENTS_BACKOFF_MS = 60000; // Don't retry for 60 seconds after max clients error

// Cleanup dead connections periodically
setInterval(() => {
  const cacheEntries = Array.from(connectionCache.entries());
  for (const [url, conn] of cacheEntries) {
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
  
  // Clear max clients error flags after backoff period
  const now = Date.now();
  const errorEntries = Array.from(maxClientsErrorTime.entries());
  for (const [url, errorTime] of errorEntries) {
    if (now - errorTime > MAX_CLIENTS_BACKOFF_MS) {
      maxClientsErrorTime.delete(url);
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
    
    // Check if we recently hit max clients error - if so, don't try to connect
    const lastMaxClientsError = maxClientsErrorTime.get(url);
    const inBackoff = lastMaxClientsError && (Date.now() - lastMaxClientsError) < MAX_CLIENTS_BACKOFF_MS;
    
    if (inBackoff) {
      const waitTime = Math.ceil((MAX_CLIENTS_BACKOFF_MS - (Date.now() - lastMaxClientsError)) / 1000);
      console.warn(`[RedisStreamsAdapter] ⏸️  Max clients backoff active, waiting ${waitTime}s before retry: ${url}`);
      // Don't throw - just set redis to null and let operations fail gracefully
      // This prevents connection attempts during backoff
      this.redis = null;
      return; // Exit constructor early - connection will be created after backoff
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
        // Connection is dead, remove from cache
        console.warn('[RedisStreamsAdapter] Cached connection is dead, removing from cache:', url);
        connectionCache.delete(url);
        connectionRefCount.delete(url);
        try {
          cachedConnection?.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
        // Only create new connection if NOT in backoff
        if (!inBackoff) {
          this.redis = this.createNewConnection(url);
        } else {
          this.redis = null;
        }
      }
    } else {
      // No cached connection - only create new one if NOT in backoff
      if (!inBackoff) {
        this.redis = this.createNewConnection(url);
      } else {
        this.redis = null;
        return; // Exit early if in backoff and no cached connection
      }
    }

    // Only attach event handlers if we have a connection
    if (!this.redis) {
      return; // No connection available (backoff or other issue)
    }

    this.redis.on('error', (err: Error) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      // If max clients error, mark it and stop retrying
      if (errorMsg.includes('max number of clients')) {
        maxClientsErrorTime.set(url, Date.now());
        console.error('[RedisStreamsAdapter] ❌ Max clients reached - stopping connection attempts for 60s:', url);
        // DON'T close connection - keep it in cache but mark as unavailable
        // Closing and removing from cache causes new instances to create new connections
        // Instead, just mark the connection as unavailable and let operations fail gracefully
        // The connection will be reused when backoff expires
        // Don't log as regular error to reduce log spam
        return;
      }
      
      console.error('[RedisStreamsAdapter] Redis error:', errorMsg);
    });

    this.redis.on('connect', () => {
      console.info('[RedisStreamsAdapter] Connected to Redis:', url);
    });

    this.redis.on('close', () => {
      console.warn('[RedisStreamsAdapter] Redis connection closed:', url);
      // Only remove from cache if we're NOT in backoff period
      // During backoff, we want to keep the connection in cache to prevent new connections
      const lastMaxClientsError = maxClientsErrorTime.get(url);
      const inBackoff = lastMaxClientsError && (Date.now() - lastMaxClientsError) < MAX_CLIENTS_BACKOFF_MS;
      
      if (inBackoff) {
        console.info('[RedisStreamsAdapter] Connection closed during backoff, keeping in cache to prevent new connections:', url);
        return; // Don't remove from cache during backoff
      }
      
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
    // Check if we're in backoff period
    const lastMaxClientsError = maxClientsErrorTime.get(this.redisUrl);
    if (lastMaxClientsError && (Date.now() - lastMaxClientsError) < MAX_CLIENTS_BACKOFF_MS) {
      const waitTime = Math.ceil((MAX_CLIENTS_BACKOFF_MS - (Date.now() - lastMaxClientsError)) / 1000);
      throw new Error(`Redis max clients backoff active - waiting ${waitTime}s before retry`);
    }
    
    // Try to create connection if we don't have one (and not in backoff)
    if (!this.redis) {
      // Re-check backoff before creating connection
      if (lastMaxClientsError && (Date.now() - lastMaxClientsError) < MAX_CLIENTS_BACKOFF_MS) {
        const waitTime = Math.ceil((MAX_CLIENTS_BACKOFF_MS - (Date.now() - lastMaxClientsError)) / 1000);
        throw new Error(`Redis max clients backoff active - waiting ${waitTime}s before retry`);
      }
      // Create connection now
      if (connectionCache.has(this.redisUrl)) {
        this.redis = connectionCache.get(this.redisUrl);
        connectionRefCount.set(this.redisUrl, (connectionRefCount.get(this.redisUrl) || 0) + 1);
      } else {
        this.redis = this.createNewConnection(this.redisUrl);
      }
    }
    
    if (!this.redis) {
      throw new Error('Redis client not initialized. ioredis is required.');
    }
    
    try {
      const envelope: MessageEnvelope = {
        ...message,
        timestamp_ms: message.timestamp_ms || Date.now(),
      };

      // XADD topic MAXLEN ~ 1000 * field1 value1 field2 value2 ...
      // Use * for auto-generated message ID
      // MAXLEN ~ 1000: Keep approximately last 1000 messages per stream to prevent OOM
      // ~ means approximate trimming (faster, less precise)
      const msgId = await this.redis.xadd(
        topic,
        'MAXLEN',
        '~',
        '1000', // Keep last ~1000 messages per stream
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
    // Check if we're in backoff period
    const lastMaxClientsError = maxClientsErrorTime.get(this.redisUrl);
    if (lastMaxClientsError && (Date.now() - lastMaxClientsError) < MAX_CLIENTS_BACKOFF_MS) {
      const waitTime = Math.ceil((MAX_CLIENTS_BACKOFF_MS - (Date.now() - lastMaxClientsError)) / 1000);
      throw new Error(`Redis max clients backoff active - waiting ${waitTime}s before retry`);
    }
    
    const id = `sub-${Date.now()}-${Math.random()}`;

    // Try to create connection if we don't have one (and not in backoff)
    if (!this.redis) {
      // Re-check backoff before creating connection
      if (lastMaxClientsError && (Date.now() - lastMaxClientsError) < MAX_CLIENTS_BACKOFF_MS) {
        const waitTime = Math.ceil((MAX_CLIENTS_BACKOFF_MS - (Date.now() - lastMaxClientsError)) / 1000);
        throw new Error(`Redis max clients backoff active - waiting ${waitTime}s before retry`);
      }
      // Create connection now
      if (connectionCache.has(this.redisUrl)) {
        this.redis = connectionCache.get(this.redisUrl);
        connectionRefCount.set(this.redisUrl, (connectionRefCount.get(this.redisUrl) || 0) + 1);
      } else {
        this.redis = this.createNewConnection(this.redisUrl);
      }
    }

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
      firstRead: true, // Mark as first read to catch existing messages
      lastReadId: '0', // Start from beginning
    };

    this.subscriptions.set(id, subscription);

    console.info(`[RedisStreamsAdapter] ✅ Subscription created for topic: ${topic}, consumerGroup: ${this.consumerGroup}, consumerName: ${subscription.consumerName}`);

    // Start consuming messages
    this.startConsumer(subscription);
    
    console.info(`[RedisStreamsAdapter] 🚀 Consumer started for topic: ${topic}`);

    return {
      id,
      topic,
      unsubscribe: async () => {
        await this.unsubscribe(id);
      },
    };
  }

  private async ensureConsumerGroup(topic: string, groupName: string): Promise<void> {
    console.info(`[RedisStreamsAdapter] 🔧 Ensuring consumer group exists: ${groupName} for topic: ${topic}`);
    
    if (!this.redis) {
      console.error(`[RedisStreamsAdapter] ❌ CRITICAL: Redis client is null when ensuring consumer group for ${topic}`);
      throw new Error('Redis client not initialized');
    }
    
    try {
      // Try to create consumer group starting from 0 (beginning of stream)
      await this.redis.xgroup('CREATE', topic, groupName, '0', 'MKSTREAM');
      console.info(`[RedisStreamsAdapter] ✅ Created new consumer group ${groupName} for ${topic} from position 0`);
    } catch (error: unknown) {
      // BUSYGROUP means group already exists - reset its position to 0
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.info(`[RedisStreamsAdapter] ℹ️ Consumer group creation result for ${topic}: ${errorMessage}`);
      
      if (errorMessage.includes('BUSYGROUP')) {
        console.info(`[RedisStreamsAdapter] 🔄 Consumer group ${groupName} already exists for ${topic}, resetting position to 0...`);
        // Group exists - reset its read position to 0 to catch all messages
        try {
          await this.redis.xgroup('SETID', topic, groupName, '0');
          console.info(`[RedisStreamsAdapter] ✅ Reset existing consumer group ${groupName} for ${topic} to position 0`);
        } catch (setIdError: unknown) {
          const setIdErrorMessage = setIdError instanceof Error ? setIdError.message : String(setIdError);
          console.warn(`[RedisStreamsAdapter] ⚠️ Failed to reset consumer group position for ${topic}: ${setIdErrorMessage}`);
          // Continue anyway - we'll handle pending messages in startConsumer
        }
        return;
      }
      // Other errors might mean stream doesn't exist yet, try without MKSTREAM
      try {
        await this.redis.xgroup('CREATE', topic, groupName, '0');
        console.info(`[RedisStreamsAdapter] ✅ Created consumer group ${groupName} for ${topic} from position 0 (stream existed)`);
      } catch (err2: unknown) {
        const err2Message = err2 instanceof Error ? err2.message : String(err2);
        if (err2Message.includes('BUSYGROUP')) {
          // Group exists - reset its read position to 0
          try {
            await this.redis.xgroup('SETID', topic, groupName, '0');
            console.info(`[RedisStreamsAdapter] ✅ Reset existing consumer group ${groupName} for ${topic} to position 0`);
          } catch (setIdError2: unknown) {
            const setIdError2Message = setIdError2 instanceof Error ? setIdError2.message : String(setIdError2);
            console.warn(`[RedisStreamsAdapter] ⚠️ Failed to reset consumer group position for ${topic}: ${setIdError2Message}`);
          }
          return;
        }
        // If stream doesn't exist, it will be created on first XADD
        // We can ignore this error
        console.debug(`[RedisStreamsAdapter] Stream ${topic} doesn't exist yet, will be created on first publish`);
      }
    }
  }

  private async startConsumer(subscription: RedisSubscription): Promise<void> {
    const { topic, consumerGroup, consumerName, handler, redis } = subscription;

    console.info(`[RedisStreamsAdapter] 🔄 Starting consumer for topic: ${topic}, consumerGroup: ${consumerGroup}, consumerName: ${consumerName}`);

    const consume = async () => {
      // On first read, check for pending messages (delivered but not ACKed)
      // This handles the case where consumer group already exists
      if (subscription.firstRead) {
        try {
          // Check for pending messages (delivered but not ACKed) for this consumer group
          // XPENDING key group [start] [end] [count] [consumer]
          // First check all pending messages, then filter by consumer if needed
          const pending = await redis.xpending(topic, consumerGroup, '-', '+', 100);
          if (pending && Array.isArray(pending) && pending.length > 0) {
            console.info(`[RedisStreamsAdapter] Found ${pending.length} pending message(s) for ${topic} in consumer group ${consumerGroup}, processing them first`);
            // Process pending messages
            for (const pendingMsg of pending) {
              // pendingMsg format: [msgId, consumer, idleTime, deliveryCount]
              if (Array.isArray(pendingMsg) && pendingMsg.length >= 1) {
                const msgId = pendingMsg[0] as string;
                try {
                  // Claim the pending message (with 0 min idle time to claim immediately)
                  const claimed = await redis.xclaim(topic, consumerGroup, consumerName, 0, msgId) as [string, [string, string[]][]][] | null;
                  if (claimed && claimed.length > 0) {
                    const [streamName, messages] = claimed[0];
                    if (messages && messages.length > 0) {
                      for (const messageEntry of messages) {
                        const [claimedMsgId, fields] = messageEntry;
                        try {
                          const dataIndex = fields.findIndex((f: string) => f === 'data');
                          if (dataIndex >= 0 && dataIndex + 1 < fields.length) {
                            const envelope = JSON.parse(fields[dataIndex + 1]) as MessageEnvelope;
                            await handler(envelope);
                            await redis.xack(topic, consumerGroup, claimedMsgId);
                            subscription.lastReadId = claimedMsgId;
                            console.info(`[RedisStreamsAdapter] ✅ Processed pending message ${claimedMsgId} from ${topic}`);
                          }
                        } catch (error: unknown) {
                          console.error(`[RedisStreamsAdapter] Error processing pending message ${claimedMsgId}:`, error);
                        }
                      }
                    }
                  }
                } catch (claimError: unknown) {
                  console.warn(`[RedisStreamsAdapter] Failed to claim pending message ${msgId}:`, claimError);
                }
              }
            }
          }
        } catch (pendingError: unknown) {
          // If pending check fails (e.g., group doesn't exist or no pending), continue with normal read
          const errorMessage = pendingError instanceof Error ? pendingError.message : String(pendingError);
          if (!errorMessage.includes('NOGROUP') && !errorMessage.includes('no such key')) {
            console.warn(`[RedisStreamsAdapter] Failed to check pending messages for ${topic}:`, errorMessage);
          }
        }
      }

      while (subscription.running) {
        try {
          // Determine read position:
          // - First read: Use '0' to read from beginning (catch any existing messages)
          //   Note: With XREADGROUP, '0' reads messages that haven't been delivered to the group yet
          //   This works for both new and existing consumer groups
          // - Subsequent reads: Use '>' to read only new messages
          // - If we have a lastReadId, use it to continue from where we left off
          let readPosition: string;
          if (subscription.firstRead) {
            // First read: start from beginning to catch any existing messages
            // Using '0' with XREADGROUP will read all messages that haven't been delivered to this consumer group
            // This works even if consumer group exists - it reads undelivered messages from the beginning
            readPosition = '0';
            console.info(`[RedisStreamsAdapter] 🔍 First read for ${topic}, reading from beginning (position: 0) to catch existing undelivered messages`);
          } else if (subscription.lastReadId && subscription.lastReadId !== '0') {
            // Continue from last read position
            readPosition = subscription.lastReadId;
          } else {
            // Read new messages only
            readPosition = '>';
          }

          // XREADGROUP GROUP group consumer COUNT count BLOCK blockms STREAMS key [key ...] id [id ...]
          const results = await redis.xreadgroup(
            'GROUP',
            consumerGroup,
            consumerName,
            'COUNT',
            10, // Read up to 10 messages at a time for efficiency
            'BLOCK',
            1000, // Block for 1 second
            'STREAMS',
            topic,
            readPosition
          ) as [string, [string, string[]][]][] | null;

          if (results && results.length > 0) {
            const [streamName, messages] = results[0];
            if (messages && messages.length > 0) {
              // Mark that we've done at least one read
              if (subscription.firstRead) {
                subscription.firstRead = false;
                console.info(`[RedisStreamsAdapter] ✅ First read completed for ${topic}, found ${messages.length} message(s). Switching to '>' for new messages only.`);
              }

              let processedCount = 0;
              for (const messageEntry of messages) {
                const [msgId, fields] = messageEntry;
                try {
                  // Parse message - fields is [key1, value1, key2, value2, ...]
                  const dataIndex = fields.findIndex((f: string) => f === 'data');
                  if (dataIndex >= 0 && dataIndex + 1 < fields.length) {
                    const envelope = JSON.parse(fields[dataIndex + 1]) as MessageEnvelope;
                    await handler(envelope);
                    // Auto-ACK after successful handler execution to prevent redelivery
                    try {
                      await redis.xack(topic, consumerGroup, msgId);
                      processedCount++;
                      // Update last read ID to continue from here
                      subscription.lastReadId = msgId;
                    } catch (ackError: unknown) {
                      console.warn(`[RedisStreamsAdapter] Failed to ACK message ${msgId}:`, ackError);
                    }
                  }
                } catch (error: unknown) {
                  console.error(`[RedisStreamsAdapter] Error processing message ${msgId}:`, error);
                  // Don't ack on error - message will be retried
                }
              }

              if (processedCount > 0) {
                console.info(`[RedisStreamsAdapter] ✅ Processed ${processedCount} message(s) from ${topic}`);
              }
            } else {
              // No messages this time - if it was first read, switch to '>' for next time
              if (subscription.firstRead) {
                subscription.firstRead = false;
                console.info(`[RedisStreamsAdapter] First read for ${topic} found no existing messages. Switching to '>' for new messages only.`);
              }
            }
          } else {
            // No results - if it was first read, switch to '>' for next time
            if (subscription.firstRead) {
              subscription.firstRead = false;
              console.info(`[RedisStreamsAdapter] First read for ${topic} found no messages. Switching to '>' for new messages only.`);
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('max number of clients')) {
            // Max clients error - mark it and stop this consumer loop
            maxClientsErrorTime.set(topic, Date.now());
            console.error(`[RedisStreamsAdapter] ❌ Max clients reached - stopping consumer for ${topic}`);
            // Stop this consumer - it will be retried when backoff period expires
            subscription.running = false;
            break;
          }
          if (errorMessage.includes('Connection') || errorMessage.includes('max number of clients')) {
            // Check if we're in max clients backoff (check URL, not topic)
            const lastMaxClientsError = maxClientsErrorTime.get(this.redisUrl);
            if (lastMaxClientsError && (Date.now() - lastMaxClientsError) < MAX_CLIENTS_BACKOFF_MS) {
              // We're in backoff period, stop consumer completely
              const waitTime = Math.ceil((MAX_CLIENTS_BACKOFF_MS - (Date.now() - lastMaxClientsError)) / 1000);
              console.warn(`[RedisStreamsAdapter] ⏸️  In max clients backoff (${waitTime}s remaining), stopping consumer: ${topic}`);
              subscription.running = false;
              break; // Exit consumer loop
            }
            
            // If max clients error, mark it and stop
            if (errorMessage.includes('max number of clients')) {
              maxClientsErrorTime.set(this.redisUrl, Date.now());
              console.error(`[RedisStreamsAdapter] ❌ Max clients reached - stopping consumer: ${topic}`);
              subscription.running = false;
              break;
            }
            
            // Regular connection error (not max clients) - wait and retry
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

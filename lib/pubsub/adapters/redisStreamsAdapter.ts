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
const MAX_CONNECTION_CACHE_SIZE = 5; // Maximum number of Redis connections to cache (prevents memory leaks)

// Cleanup dead connections periodically
setInterval(() => {
  const cacheEntries = Array.from(connectionCache.entries());
  
  // CRITICAL FIX: Limit connection cache size to prevent memory leaks
  if (connectionCache.size > MAX_CONNECTION_CACHE_SIZE) {
    // Remove oldest connections (by status - remove dead ones first, then oldest ready ones)
    const sortedEntries = cacheEntries.sort((a, b) => {
      const aStatus = a[1]?.status || 'unknown';
      const bStatus = b[1]?.status || 'unknown';
      // Dead connections first, then by status
      if (aStatus !== 'ready' && bStatus === 'ready') return -1;
      if (aStatus === 'ready' && bStatus !== 'ready') return 1;
      return 0;
    });
    
    const toRemove = connectionCache.size - MAX_CONNECTION_CACHE_SIZE;
    for (let i = 0; i < toRemove; i++) {
      const [url, conn] = sortedEntries[i];
      console.warn('[RedisStreamsAdapter] Removing connection to enforce cache limit', {
        url: url.replace(/:[^:@]+@/, ':****@'),
        status: conn?.status,
        cacheSize: connectionCache.size,
        maxSize: MAX_CONNECTION_CACHE_SIZE,
      });
      connectionCache.delete(url);
      connectionRefCount.delete(url);
      try {
        conn?.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
  
  // Remove dead connections
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
  
  // CRITICAL FIX: Memory monitoring for Redis connections
  if (connectionCache.size > 0) {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    
    // Log warning if heap usage is high and we have many connections
    if (heapUsedMB > 150 && connectionCache.size >= 3) {
      console.warn('[RedisStreamsAdapter] ⚠️ High memory usage with Redis connections', {
        heapUsed: `${heapUsedMB}MB`,
        connectionCount: connectionCache.size,
        maxConnections: MAX_CONNECTION_CACHE_SIZE,
        note: 'Consider reducing connection count or increasing heap limit',
      });
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
      const errorCode = (err as any).code;
      
      // Handle EPIPE errors (connection closed unexpectedly)
      if (errorCode === 'EPIPE' || errorMsg.includes('EPIPE')) {
        console.warn('[RedisStreamsAdapter] ⚠️ Redis EPIPE error (connection closed) - cleaning up:', url);
        // Remove from cache and close connection to prevent memory leaks
        if (connectionCache.get(url) === this.redis) {
          connectionCache.delete(url);
          connectionRefCount.delete(url);
        }
        try {
          this.redis.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
        this.redis = null;
        return;
      }
      
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
    // CRITICAL FIX: Enforce connection cache limit before creating new connection
    if (connectionCache.size >= MAX_CONNECTION_CACHE_SIZE) {
      // Remove oldest dead connection first, then oldest ready connection
      const cacheEntries = Array.from(connectionCache.entries());
      const sortedEntries = cacheEntries.sort((a, b) => {
        const aStatus = a[1]?.status || 'unknown';
        const bStatus = b[1]?.status || 'unknown';
        if (aStatus !== 'ready' && bStatus === 'ready') return -1;
        if (aStatus === 'ready' && bStatus !== 'ready') return 1;
        return 0;
      });
      
      if (sortedEntries.length > 0) {
        const [oldUrl, oldConn] = sortedEntries[0];
        console.warn('[RedisStreamsAdapter] Connection cache at limit, removing oldest connection', {
          removedUrl: oldUrl.replace(/:[^:@]+@/, ':****@'),
          removedStatus: oldConn?.status,
          cacheSize: connectionCache.size,
          maxSize: MAX_CONNECTION_CACHE_SIZE,
        });
        connectionCache.delete(oldUrl);
        connectionRefCount.delete(oldUrl);
        try {
          oldConn?.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }
    }
    
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
    console.info(`[RedisStreamsAdapter] 📤 Publishing message to topic: ${topic}`, {
      topic,
      messageKeys: Object.keys(message),
      interaction_id: message.interaction_id,
      seq: message.seq,
    });
    
    // Check if we're in backoff period
    const lastMaxClientsError = maxClientsErrorTime.get(this.redisUrl);
    if (lastMaxClientsError && (Date.now() - lastMaxClientsError) < MAX_CLIENTS_BACKOFF_MS) {
      const waitTime = Math.ceil((MAX_CLIENTS_BACKOFF_MS - (Date.now() - lastMaxClientsError)) / 1000);
      console.error(`[RedisStreamsAdapter] ❌ Redis max clients backoff active - waiting ${waitTime}s before retry`);
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

      console.info(`[RedisStreamsAdapter] ✅ Successfully published message to ${topic}`, {
        topic,
        messageId: msgId,
        interaction_id: message.interaction_id,
        seq: message.seq,
      });

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
      // This ensures we catch all messages from the start if this is a new group
      await this.redis.xgroup('CREATE', topic, groupName, '0', 'MKSTREAM');
      console.info(`[RedisStreamsAdapter] ✅ Created new consumer group ${groupName} for ${topic} from position 0`);
    } catch (error: unknown) {
      // BUSYGROUP means group already exists - DON'T reset it (would cause duplicates)
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.info(`[RedisStreamsAdapter] ℹ️ Consumer group creation result for ${topic}: ${errorMessage}`);
      
      if (errorMessage.includes('BUSYGROUP')) {
        // CRITICAL FIX: Don't reset existing consumer groups - that causes duplicates!
        // The first read with '0' will catch any undelivered messages, then we switch to '>'
        console.info(`[RedisStreamsAdapter] ℹ️ Consumer group ${groupName} already exists for ${topic}. Will read undelivered messages on first read, then switch to new messages only.`);
        return;
      }
      // Other errors might mean stream doesn't exist yet, try without MKSTREAM
      try {
        await this.redis.xgroup('CREATE', topic, groupName, '0');
        console.info(`[RedisStreamsAdapter] ✅ Created consumer group ${groupName} for ${topic} from position 0 (stream existed)`);
      } catch (err2: unknown) {
        const err2Message = err2 instanceof Error ? err2.message : String(err2);
        if (err2Message.includes('BUSYGROUP')) {
          // Group exists - don't reset it, just continue
          console.info(`[RedisStreamsAdapter] ℹ️ Consumer group ${groupName} already exists for ${topic}. Will read undelivered messages on first read.`);
          return;
        }
        // If stream doesn't exist, it will be created on first XADD
        // We can ignore this error
        console.debug(`[RedisStreamsAdapter] Stream ${topic} doesn't exist yet, will be created on first publish`);
      }
    }
  }

  /**
   * Helper method to process a claimed message
   */
  private async processClaimedMessage(
    topic: string,
    consumerGroup: string,
    subscription: RedisSubscription,
    handler: (envelope: MessageEnvelope) => Promise<void>,
    redis: RedisInstance,
    msgId: string,
    fields: any[]
  ): Promise<void> {
    try {
      // Validate fields is an array
      if (!Array.isArray(fields)) {
        console.warn(`[RedisStreamsAdapter] ⚠️ Invalid fields format for ${msgId}: fields is not an array`, {
          msgId,
          fieldsType: typeof fields,
          fieldsValue: fields,
        });
        return;
      }
      
      // Parse message - fields is [key1, value1, key2, value2, ...]
      const dataIndex = fields.findIndex((f: string) => f === 'data');
      if (dataIndex >= 0 && dataIndex + 1 < fields.length) {
        const envelope = JSON.parse(fields[dataIndex + 1]) as MessageEnvelope;
        await handler(envelope);
        await redis.xack(topic, consumerGroup, msgId);
        subscription.lastReadId = msgId;
        console.info(`[RedisStreamsAdapter] ✅ Processed pending message ${msgId} from ${topic}`);
      } else {
        console.warn(`[RedisStreamsAdapter] ⚠️ No 'data' field found in pending message ${msgId}:`, {
          fields: fields.slice(0, 10), // Show first 10 fields
          fieldsLength: fields.length,
        });
      }
    } catch (error: unknown) {
      console.error(`[RedisStreamsAdapter] Error processing pending message ${msgId}:`, error);
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
                  // XCLAIM can return different formats:
                  // Format 1: [[streamName, [[msgId, [field, value, ...]]]]] (nested)
                  // Format 2: [[streamName, [field, value, ...]]] (flat array - use msgId from XPENDING)
                  const claimed = await redis.xclaim(topic, consumerGroup, consumerName, 0, msgId) as any;
                  
                  if (!claimed || !Array.isArray(claimed) || claimed.length === 0) {
                    // No messages claimed (might have been processed by another consumer)
                    console.debug(`[RedisStreamsAdapter] No messages claimed for ${msgId} (may have been processed)`);
                    continue;
                  }
                  
                  // Handle different response formats from XCLAIM
                  let streamName: string;
                  let messagesArray: any[];
                  
                  const firstEntry = claimed[0];
                  if (Array.isArray(firstEntry) && firstEntry.length >= 2) {
                    // Standard format: [streamName, messages]
                    [streamName, messagesArray] = firstEntry;
                  } else {
                    // Unexpected format - log and skip
                    console.warn(`[RedisStreamsAdapter] ⚠️ Unexpected XCLAIM response format for ${msgId}:`, {
                      claimedType: typeof claimed,
                      claimedLength: Array.isArray(claimed) ? claimed.length : 'N/A',
                      firstEntryType: typeof firstEntry,
                      firstEntryIsArray: Array.isArray(firstEntry),
                      firstEntryLength: Array.isArray(firstEntry) ? firstEntry.length : 'N/A',
                      sample: JSON.stringify(claimed).substring(0, 300),
                    });
                    continue;
                  }
                  
                  // Validate messagesArray is an array
                  if (!Array.isArray(messagesArray)) {
                    console.warn(`[RedisStreamsAdapter] ⚠️ XCLAIM returned non-array messages for ${msgId}:`, {
                      messagesType: typeof messagesArray,
                      messages: messagesArray,
                      claimed: JSON.stringify(claimed).substring(0, 300),
                    });
                    continue;
                  }
                  
                  if (messagesArray.length === 0) {
                    // No messages in the claimed response
                    continue;
                  }
                  
                  // CRITICAL FIX: Handle two possible formats:
                  // 1. Nested: [[msgId, [field, value, ...]]] - messagesArray contains tuples
                  // 2. Flat: [field, value, ...] - messagesArray IS the fields array
                  
                  // Check if first element is a tuple [msgId, fields] or just a field name
                  const firstElement = messagesArray[0];
                  const isNestedFormat = Array.isArray(firstElement) && 
                                        firstElement.length >= 2 && 
                                        typeof firstElement[0] === 'string' && 
                                        firstElement[0].includes('-'); // Redis ID format
                  
                  if (isNestedFormat) {
                    // Format 1: Nested array of [msgId, [field, value, ...]] tuples
                    for (let i = 0; i < messagesArray.length; i++) {
                      const messageEntry = messagesArray[i] as any;
                      
                      if (!Array.isArray(messageEntry) || messageEntry.length < 2) {
                        console.warn(`[RedisStreamsAdapter] ⚠️ Invalid nested messageEntry format for ${msgId}:`, {
                          index: i,
                          messageEntry,
                          messageEntryType: typeof messageEntry,
                          messageEntryLength: Array.isArray(messageEntry) ? messageEntry.length : 'N/A',
                        });
                        continue;
                      }
                      
                      const [claimedMsgId, fields] = messageEntry;
                      
                      if (typeof claimedMsgId !== 'string' || !Array.isArray(fields)) {
                        console.warn(`[RedisStreamsAdapter] ⚠️ Invalid nested messageEntry structure for ${msgId}:`, {
                          index: i,
                          claimedMsgId,
                          claimedMsgIdType: typeof claimedMsgId,
                          fieldsType: typeof fields,
                        });
                        continue;
                      }
                      
                      await this.processClaimedMessage(topic, consumerGroup, subscription, handler, redis, claimedMsgId, fields);
                    }
                  } else {
                    // Format 2: Flat array [field, value, field, value, ...]
                    // Use the msgId from XPENDING since it's not in the flat array
                    await this.processClaimedMessage(topic, consumerGroup, subscription, handler, redis, msgId, messagesArray);
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

      console.info(`[RedisStreamsAdapter] 🔁 Entering consumer loop for ${topic}, subscription.running: ${subscription.running}`);
      
      let loopIteration = 0;
      while (subscription.running) {
        loopIteration++;
        try {
          // Log every 10th iteration to confirm loop is running (every ~10 seconds)
          if (loopIteration % 10 === 0) {
            console.info(`[RedisStreamsAdapter] 🔄 Consumer loop iteration ${loopIteration} for ${topic}`, {
              topic,
              subscriptionRunning: subscription.running,
              firstRead: subscription.firstRead,
              lastReadId: subscription.lastReadId,
            });
          }
          
          // Determine read position:
          // CRITICAL FIX: Properly handle reading from beginning vs new messages
          // - First read: Use '0' to read ALL undelivered messages (messages that haven't been delivered to this consumer group)
          //   This catches messages published before subscription, even if consumer group already existed
          // - Subsequent reads: Use '>' to read only NEW messages (messages published after last read)
          //   CRITICAL: Do NOT use lastReadId - once a message is ACKed, reading from its ID returns nothing
          //   This causes the consumer to get stuck and never read new messages
          let readPosition: string;
          if (subscription.firstRead) {
            // First read: use '0' to catch ALL undelivered messages from the beginning
            // This works even if consumer group already exists - it reads all messages that haven't been
            // delivered to this consumer group, regardless of when they were published
            readPosition = '0';
            console.info(`[RedisStreamsAdapter] 🔍 First read for ${topic}, reading all undelivered messages (position: 0) to catch existing messages`);
          } else {
            // After first read, ALWAYS use '>' to read new messages only
            // Do NOT use lastReadId - that causes the consumer to get stuck
            // With Redis Streams consumer groups, '>' reads messages that haven't been delivered to this consumer
            readPosition = '>';
          }

          // Log read attempt (but not every time to avoid spam)
          if (subscription.firstRead || Math.random() < 0.01) { // Log 1% of reads after first read
            console.info(`[RedisStreamsAdapter] 📖 Attempting to read from ${topic}`, {
              topic,
              readPosition,
              isFirstRead: subscription.firstRead,
              consumerGroup,
              consumerName,
            });
          }

          // XREADGROUP GROUP group consumer COUNT count BLOCK blockms STREAMS key [key ...] id [id ...]
          const results = await redis.xreadgroup(
            'GROUP',
            consumerGroup,
            consumerName,
            'COUNT',
            10, // Read up to 10 messages at a time for efficiency
            'BLOCK',
            500, // Block for 500ms (reduced from 1000ms for faster response)
            'STREAMS',
            topic,
            readPosition
          ) as [string, [string, string[]][]][] | null;
          
          // Log read result
          if (subscription.firstRead || (results && results.length > 0 && results[0][1] && results[0][1].length > 0)) {
            console.info(`[RedisStreamsAdapter] 📥 Read result from ${topic}`, {
              topic,
              hasResults: !!results,
              messagesCount: results && results.length > 0 && results[0][1] ? results[0][1].length : 0,
              readPosition,
            });
          }

          if (results && results.length > 0) {
            const [streamName, messages] = results[0];
            const messagesArray = messages as any[]; // Type assertion for Redis response
            if (messagesArray && messagesArray.length > 0) {
              // Mark that we've done at least one read
              if (subscription.firstRead) {
                subscription.firstRead = false;
                console.info(`[RedisStreamsAdapter] ✅ First read completed for ${topic}, found ${messagesArray.length} message(s). Switching to '>' for new messages only.`);
              }

              let processedCount = 0;
              
              // DEBUG: Log message structure on first read to understand actual format
              if (subscription.firstRead && messagesArray.length > 0) {
                const firstMsg = messagesArray[0] as any;
                let firstMessageSample: string;
                if (typeof firstMsg === 'string') {
                  firstMessageSample = firstMsg.substring(0, 100);
                } else if (Array.isArray(firstMsg)) {
                  firstMessageSample = `[array: ${firstMsg.slice(0, 4).join(', ')}...]`;
                } else {
                  firstMessageSample = String(firstMsg).substring(0, 100);
                }
                console.debug(`[RedisStreamsAdapter] 🔍 Message structure analysis for ${topic}:`, {
                  messagesCount: messagesArray.length,
                  firstMessageType: typeof firstMsg,
                  firstMessageIsArray: Array.isArray(firstMsg),
                  firstMessage: firstMsg,
                  firstMessageLength: Array.isArray(firstMsg) ? firstMsg.length : 'N/A',
                  firstMessageSample,
                });
              }
              
              for (let i = 0; i < messagesArray.length; i++) {
                const messageEntry = messagesArray[i] as any;
                
                // CRITICAL FIX 1: Validate messageEntry is an array before destructuring
                if (!Array.isArray(messageEntry)) {
                  let sample: string;
                  if (typeof messageEntry === 'string') {
                    sample = messageEntry.substring(0, 100);
                  } else if (typeof messageEntry === 'object' && messageEntry !== null) {
                    sample = JSON.stringify(messageEntry).substring(0, 100);
                  } else {
                    sample = String(messageEntry).substring(0, 100);
                  }
                  const messagesSample = messagesArray.slice(0, 3).map((m: any) => {
                    if (typeof m === 'string') return m.substring(0, 50);
                    if (Array.isArray(m)) return `[array:${m.length}]`;
                    if (typeof m === 'object' && m !== null) return JSON.stringify(m).substring(0, 50);
                    return String(m).substring(0, 50);
                  });
                  console.error(`[RedisStreamsAdapter] ❌ Invalid messageEntry format (not array): expected [msgId, fields], got:`, {
                    index: i,
                    messageEntry,
                    messageEntryType: typeof messageEntry,
                    sample,
                    messagesSample,
                  });
                  continue; // Skip this message
                }
                
                // CRITICAL FIX 1b: Validate array has at least 2 elements (msgId and fields)
                if (messageEntry.length < 2) {
                  console.error(`[RedisStreamsAdapter] ❌ Invalid messageEntry format (too short): expected [msgId, fields], got array of length ${messageEntry.length}:`, {
                    index: i,
                    messageEntry,
                    messageEntryLength: messageEntry.length,
                    messageEntryContents: messageEntry,
                  });
                  continue; // Skip this message
                }
                
                const [msgId, fields] = messageEntry;
                
                // CRITICAL FIX 2: Validate msgId is a string (not a character from string destructuring)
                if (typeof msgId !== 'string' || msgId.length === 0) {
                  console.error(`[RedisStreamsAdapter] ❌ Invalid msgId format: expected non-empty string, got:`, {
                    index: i,
                    msgId,
                    msgIdType: typeof msgId,
                    msgIdLength: typeof msgId === 'string' ? msgId.length : 'N/A',
                    messageEntry,
                    messageEntryLength: messageEntry.length,
                    note: 'If msgId is a single character, messageEntry might be a destructured string instead of [msgId, fields]',
                  });
                  continue;
                }
                
                // CRITICAL FIX 2b: Validate msgId looks like a Redis message ID (timestamp-sequence format)
                // Redis message IDs are like "1763915155045-0" or "1763915155045-1"
                if (!/^\d+-\d+$/.test(msgId)) {
                  console.warn(`[RedisStreamsAdapter] ⚠️ msgId doesn't match Redis message ID format (timestamp-sequence):`, {
                    index: i,
                    msgId,
                    messageEntry,
                    note: 'This might indicate a malformed message structure',
                  });
                  // Don't skip - might still be valid, just log warning
                }
                
                try {
                  // Parse message - fields is [key1, value1, key2, value2, ...]
                  // CRITICAL FIX 3: Ensure fields is an array before calling findIndex
                  if (!Array.isArray(fields)) {
                    console.error(`[RedisStreamsAdapter] ❌ Invalid message format: fields is not an array`, {
                      index: i,
                      msgId,
                      fieldsType: typeof fields,
                      fieldsValue: fields,
                      fieldsLength: typeof fields === 'string' ? (fields as string).length : 'N/A',
                      messageEntry,
                      messageEntryLength: messageEntry.length,
                      messageEntryContents: messageEntry,
                      note: 'If fields is a single character, messageEntry might be a destructured string. Expected: [msgId, [field1, value1, field2, value2, ...]]',
                    });
                    continue; // Skip this message
                  }
                  
                  // CRITICAL FIX 3b: Validate fields array has even length (key-value pairs)
                  if (fields.length % 2 !== 0) {
                    console.warn(`[RedisStreamsAdapter] ⚠️ fields array has odd length (expected even for key-value pairs):`, {
                      index: i,
                      msgId,
                      fieldsLength: fields.length,
                      fields: fields.slice(0, 10), // Show first 10 elements
                      note: 'Redis Streams fields should be [key1, value1, key2, value2, ...]',
                    });
                    // Don't skip - might still be processable
                  }
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
    console.info(`[RedisStreamsAdapter] 🎬 Starting consumer loop for ${topic}...`);
    consume().catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[RedisStreamsAdapter] ❌ CRITICAL: Consumer loop error for ${topic}:`, {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
    console.info(`[RedisStreamsAdapter] ✅ Consumer loop started for ${topic}`);
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

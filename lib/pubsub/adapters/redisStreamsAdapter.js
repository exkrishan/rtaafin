"use strict";
/**
 * Redis Streams adapter for pub/sub
 * Uses XADD for publishing and XREADGROUP for consuming with ack semantics
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisStreamsAdapter = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
class RedisStreamsAdapter {
    constructor(config) {
        this.subscriptions = new Map();
        const url = config?.url || process.env.REDIS_URL || 'redis://localhost:6379';
        this.consumerGroup = config?.consumerGroup || process.env.REDIS_CONSUMER_GROUP || 'agent-assist';
        this.consumerName = config?.consumerName || process.env.REDIS_CONSUMER_NAME || `consumer-${process.pid}`;
        this.defaultRedisOptions = {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
        };
        this.redis = new ioredis_1.default(url, this.defaultRedisOptions);
        this.redis.on('error', (err) => {
            console.error('[RedisStreamsAdapter] Redis error:', err);
        });
        this.redis.on('connect', () => {
            console.info('[RedisStreamsAdapter] Connected to Redis:', url);
        });
    }
    async publish(topic, message) {
        try {
            const envelope = {
                ...message,
                timestamp_ms: message.timestamp_ms || Date.now(),
            };
            // XADD topic * field1 value1 field2 value2 ...
            // Use * for auto-generated message ID
            const msgId = await this.redis.xadd(topic, '*', 'data', JSON.stringify(envelope));
            return msgId;
        }
        catch (error) {
            console.error('[RedisStreamsAdapter] Publish error:', error);
            throw error;
        }
    }
    async subscribe(topic, handler) {
        const id = `sub-${Date.now()}-${Math.random()}`;
        // Create consumer group if it doesn't exist
        await this.ensureConsumerGroup(topic, this.consumerGroup);
        // Create a dedicated Redis connection for this subscription
        const subscriptionRedis = new ioredis_1.default(this.redis.options);
        const subscription = {
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
    async ensureConsumerGroup(topic, groupName) {
        try {
            // Try to create consumer group starting from 0 (beginning of stream)
            await this.redis.xgroup('CREATE', topic, groupName, '0', 'MKSTREAM');
        }
        catch (error) {
            // BUSYGROUP means group already exists - that's fine
            if (error.message && error.message.includes('BUSYGROUP')) {
                // Group exists, continue
                return;
            }
            // Other errors might mean stream doesn't exist yet, try without MKSTREAM
            try {
                await this.redis.xgroup('CREATE', topic, groupName, '0');
            }
            catch (err2) {
                if (err2.message && err2.message.includes('BUSYGROUP')) {
                    // Group exists, continue
                    return;
                }
                // If stream doesn't exist, it will be created on first XADD
                // We can ignore this error
            }
        }
    }
    async startConsumer(subscription) {
        const { topic, consumerGroup, consumerName, handler, redis } = subscription;
        const consume = async () => {
            while (subscription.running) {
                try {
                    // XREADGROUP GROUP group consumer COUNT count BLOCK blockms STREAMS key [key ...] id [id ...]
                    // Use '>' to read new messages, or '0' to read pending messages
                    const results = await redis.xreadgroup('GROUP', consumerGroup, consumerName, 'COUNT', 1, 'BLOCK', 1000, // Block for 1 second
                    'STREAMS', topic, '>' // Read new messages
                    );
                    if (results && results.length > 0) {
                        const [streamName, messages] = results[0];
                        if (messages && messages.length > 0) {
                            for (const messageEntry of messages) {
                                const [msgId, fields] = messageEntry;
                                try {
                                    // Parse message - fields is [key1, value1, key2, value2, ...]
                                    const dataIndex = fields.findIndex((f) => f === 'data');
                                    if (dataIndex >= 0 && dataIndex + 1 < fields.length) {
                                        const envelope = JSON.parse(fields[dataIndex + 1]);
                                        await handler(envelope);
                                        // Note: ACK is handled separately via ack() method
                                    }
                                }
                                catch (error) {
                                    console.error(`[RedisStreamsAdapter] Error processing message ${msgId}:`, error);
                                    // Don't ack on error - message will be retried
                                }
                            }
                        }
                    }
                }
                catch (error) {
                    if (error.message && error.message.includes('Connection')) {
                        // Connection error - wait and retry
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                        continue;
                    }
                    console.error('[RedisStreamsAdapter] Consumer error:', error);
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }
        };
        // Start consuming in background
        consume().catch((error) => {
            console.error('[RedisStreamsAdapter] Consumer loop error:', error);
        });
    }
    async ack(handle, msgId) {
        const subscription = this.subscriptions.get(handle.id);
        if (!subscription) {
            throw new Error(`Subscription ${handle.id} not found`);
        }
        try {
            // XACK topic group id [id ...]
            await subscription.redis.xack(subscription.topic, subscription.consumerGroup, msgId);
        }
        catch (error) {
            console.error('[RedisStreamsAdapter] ACK error:', error);
            throw error;
        }
    }
    async unsubscribe(id) {
        const subscription = this.subscriptions.get(id);
        if (subscription) {
            subscription.running = false;
            await subscription.redis.quit();
            this.subscriptions.delete(id);
        }
    }
    async close() {
        // Stop all subscriptions
        const unsubscribePromises = Array.from(this.subscriptions.keys()).map((id) => this.unsubscribe(id));
        await Promise.all(unsubscribePromises);
        // Close main Redis connection
        await this.redis.quit();
    }
}
exports.RedisStreamsAdapter = RedisStreamsAdapter;

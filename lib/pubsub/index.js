"use strict";
/**
 * Pub/Sub abstraction factory and main exports
 *
 * NOTE: Adapters are loaded dynamically to avoid build-time dependency issues.
 * This allows the module to be used even when optional dependencies (ioredis, kafkajs)
 * are not installed.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPubSubAdapter = createPubSubAdapter;
exports.createPubSubAdapterFromEnv = createPubSubAdapterFromEnv;
// Dynamic imports to avoid build-time dependency resolution
// These will be loaded only when needed at runtime
let RedisStreamsAdapter = null;
let KafkaAdapter = null;
let InMemoryAdapter = null;
// Lazy load adapters to avoid requiring optional dependencies at build time
function getRedisStreamsAdapter() {
    if (!RedisStreamsAdapter) {
        const adapterModule = require('./adapters/redisStreamsAdapter');
        RedisStreamsAdapter = adapterModule.RedisStreamsAdapter;
    }
    return RedisStreamsAdapter;
}
function getKafkaAdapter() {
    if (!KafkaAdapter) {
        const adapterModule = require('./adapters/kafkaAdapter');
        KafkaAdapter = adapterModule.KafkaAdapter;
    }
    return KafkaAdapter;
}
function getInMemoryAdapter() {
    if (!InMemoryAdapter) {
        const adapterModule = require('./adapters/inMemoryAdapter');
        InMemoryAdapter = adapterModule.InMemoryAdapter;
    }
    return InMemoryAdapter;
}
__exportStar(require("./types"), exports);
__exportStar(require("./topics"), exports);
/**
 * Create a pub/sub adapter based on configuration
 */
function createPubSubAdapter(config) {
    const adapterType = config?.adapter ||
        process.env.PUBSUB_ADAPTER ||
        'redis_streams';
    switch (adapterType) {
        case 'redis_streams':
            return new (getRedisStreamsAdapter())(config?.redis);
        case 'kafka':
            return new (getKafkaAdapter())(config?.kafka);
        case 'in_memory':
            return new (getInMemoryAdapter())();
        default:
            throw new Error(`Unknown pub/sub adapter: ${adapterType}`);
    }
}
/**
 * Create adapter from environment variables
 */
function createPubSubAdapterFromEnv() {
    const adapter = (process.env.PUBSUB_ADAPTER || 'redis_streams');
    // Validate adapter type
    if (!['redis_streams', 'kafka', 'in_memory'].includes(adapter)) {
        throw new Error(`Invalid PUBSUB_ADAPTER: ${adapter}. Must be one of: redis_streams, kafka, in_memory`);
    }
    // Validate required environment variables based on adapter
    if (adapter === 'redis_streams' && !process.env.REDIS_URL) {
        throw new Error('REDIS_URL is required when PUBSUB_ADAPTER=redis_streams');
    }
    if (adapter === 'kafka' && !process.env.KAFKA_BROKERS) {
        throw new Error('KAFKA_BROKERS is required when PUBSUB_ADAPTER=kafka');
    }
    const config = {
        adapter,
        redis: {
            url: process.env.REDIS_URL,
            consumerGroup: process.env.REDIS_CONSUMER_GROUP,
            consumerName: process.env.REDIS_CONSUMER_NAME,
        },
        kafka: {
            brokers: process.env.KAFKA_BROKERS?.split(',').filter(Boolean),
            clientId: process.env.KAFKA_CLIENT_ID,
            consumerGroup: process.env.KAFKA_CONSUMER_GROUP,
        },
    };
    try {
        return createPubSubAdapter(config);
    }
    catch (error) {
        throw new Error(`Failed to create pub/sub adapter: ${error.message}`);
    }
}

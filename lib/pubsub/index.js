"use strict";
/**
 * Pub/Sub abstraction factory and main exports
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
exports.InMemoryAdapter = exports.KafkaAdapter = exports.RedisStreamsAdapter = void 0;
exports.createPubSubAdapter = createPubSubAdapter;
exports.createPubSubAdapterFromEnv = createPubSubAdapterFromEnv;
const redisStreamsAdapter_1 = require("./adapters/redisStreamsAdapter");
const kafkaAdapter_1 = require("./adapters/kafkaAdapter");
const inMemoryAdapter_1 = require("./adapters/inMemoryAdapter");
__exportStar(require("./types"), exports);
__exportStar(require("./topics"), exports);
var redisStreamsAdapter_2 = require("./adapters/redisStreamsAdapter");
Object.defineProperty(exports, "RedisStreamsAdapter", { enumerable: true, get: function () { return redisStreamsAdapter_2.RedisStreamsAdapter; } });
var kafkaAdapter_2 = require("./adapters/kafkaAdapter");
Object.defineProperty(exports, "KafkaAdapter", { enumerable: true, get: function () { return kafkaAdapter_2.KafkaAdapter; } });
var inMemoryAdapter_2 = require("./adapters/inMemoryAdapter");
Object.defineProperty(exports, "InMemoryAdapter", { enumerable: true, get: function () { return inMemoryAdapter_2.InMemoryAdapter; } });
/**
 * Create a pub/sub adapter based on configuration
 */
function createPubSubAdapter(config) {
    const adapterType = config?.adapter ||
        process.env.PUBSUB_ADAPTER ||
        'redis_streams';
    switch (adapterType) {
        case 'redis_streams':
            return new redisStreamsAdapter_1.RedisStreamsAdapter(config?.redis);
        case 'kafka':
            return new kafkaAdapter_1.KafkaAdapter(config?.kafka);
        case 'in_memory':
            return new inMemoryAdapter_1.InMemoryAdapter();
        default:
            throw new Error(`Unknown pub/sub adapter: ${adapterType}`);
    }
}
/**
 * Create adapter from environment variables
 */
function createPubSubAdapterFromEnv() {
    const adapter = (process.env.PUBSUB_ADAPTER || 'redis_streams');
    const config = {
        adapter,
        redis: {
            url: process.env.REDIS_URL,
            consumerGroup: process.env.REDIS_CONSUMER_GROUP,
            consumerName: process.env.REDIS_CONSUMER_NAME,
        },
        kafka: {
            brokers: process.env.KAFKA_BROKERS?.split(','),
            clientId: process.env.KAFKA_CLIENT_ID,
            consumerGroup: process.env.KAFKA_CONSUMER_GROUP,
        },
    };
    return createPubSubAdapter(config);
}

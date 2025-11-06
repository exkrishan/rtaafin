/**
 * Pub/Sub abstraction factory and main exports
 * 
 * NOTE: Adapters are loaded dynamically to avoid build-time dependency issues.
 * This allows the module to be used even when optional dependencies (ioredis, kafkajs)
 * are not installed.
 */

import { PubSubAdapter, PubSubConfig } from './types';
// Dynamic imports to avoid build-time dependency resolution
// These will be loaded only when needed at runtime
let RedisStreamsAdapter: any = null;
let KafkaAdapter: any = null;
let InMemoryAdapter: any = null;

// Lazy load adapters to avoid requiring optional dependencies at build time
function getRedisStreamsAdapter() {
  if (!RedisStreamsAdapter) {
    RedisStreamsAdapter = require('./adapters/redisStreamsAdapter').RedisStreamsAdapter;
  }
  return RedisStreamsAdapter;
}

function getKafkaAdapter() {
  if (!KafkaAdapter) {
    KafkaAdapter = require('./adapters/kafkaAdapter').KafkaAdapter;
  }
  return KafkaAdapter;
}

function getInMemoryAdapter() {
  if (!InMemoryAdapter) {
    InMemoryAdapter = require('./adapters/inMemoryAdapter').InMemoryAdapter;
  }
  return InMemoryAdapter;
}

export * from './types';
export * from './topics';

// Export adapter classes (loaded dynamically)
export { RedisStreamsAdapter } from './adapters/redisStreamsAdapter';
export { KafkaAdapter } from './adapters/kafkaAdapter';
export { InMemoryAdapter } from './adapters/inMemoryAdapter';

/**
 * Create a pub/sub adapter based on configuration
 */
export function createPubSubAdapter(config?: PubSubConfig): PubSubAdapter {
  const adapterType = config?.adapter || 
    (process.env.PUBSUB_ADAPTER as 'redis_streams' | 'kafka' | 'in_memory') || 
    'redis_streams';

  switch (adapterType) {
    case 'redis_streams':
      return new RedisStreamsAdapter(config?.redis);

    case 'kafka':
      return new KafkaAdapter(config?.kafka);

    case 'in_memory':
      return new InMemoryAdapter();

    default:
      throw new Error(`Unknown pub/sub adapter: ${adapterType}`);
  }
}

/**
 * Create adapter from environment variables
 */
export function createPubSubAdapterFromEnv(): PubSubAdapter {
  const adapter = (process.env.PUBSUB_ADAPTER || 'redis_streams') as 
    'redis_streams' | 'kafka' | 'in_memory';

  const config: PubSubConfig = {
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


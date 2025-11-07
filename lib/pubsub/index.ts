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

export * from './types';
export * from './topics';

// Export adapter classes (loaded dynamically via getters)
// These are re-exported but will be loaded lazily via the getter functions
export type { RedisStreamsAdapter } from './adapters/redisStreamsAdapter';
export type { KafkaAdapter } from './adapters/kafkaAdapter';
export type { InMemoryAdapter } from './adapters/inMemoryAdapter';

/**
 * Create a pub/sub adapter based on configuration
 */
export function createPubSubAdapter(config?: PubSubConfig): PubSubAdapter {
  const adapterType = config?.adapter || 
    (process.env.PUBSUB_ADAPTER as 'redis_streams' | 'kafka' | 'in_memory') || 
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
export function createPubSubAdapterFromEnv(): PubSubAdapter {
  const adapter = (process.env.PUBSUB_ADAPTER || 'redis_streams') as 
    'redis_streams' | 'kafka' | 'in_memory';

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

  const config: PubSubConfig = {
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
  } catch (error: any) {
    throw new Error(`Failed to create pub/sub adapter: ${error.message}`);
  }
}


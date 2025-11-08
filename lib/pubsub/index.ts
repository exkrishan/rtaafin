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

// Singleton cache for adapters to prevent multiple instances
const adapterCache = new Map<string, PubSubAdapter>();

/**
 * Create adapter from environment variables
 * Returns a singleton instance per configuration to prevent multiple connections
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

  // Create cache key from config to ensure singleton per config
  const cacheKey = JSON.stringify({
    adapter,
    redis: {
      url: process.env.REDIS_URL,
      consumerGroup: process.env.REDIS_CONSUMER_GROUP,
      consumerName: process.env.REDIS_CONSUMER_NAME,
    },
    kafka: {
      brokers: process.env.KAFKA_BROKERS,
      clientId: process.env.KAFKA_CLIENT_ID,
      consumerGroup: process.env.KAFKA_CONSUMER_GROUP,
    },
  });

  // Return cached adapter if available
  if (adapterCache.has(cacheKey)) {
    const cached = adapterCache.get(cacheKey);
    if (cached) {
      console.info('[createPubSubAdapterFromEnv] Reusing cached adapter instance');
      return cached;
    }
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
    const instance = createPubSubAdapter(config);
    adapterCache.set(cacheKey, instance);
    console.info('[createPubSubAdapterFromEnv] Created new adapter instance (cached)');
    return instance;
  } catch (error: any) {
    throw new Error(`Failed to create pub/sub adapter: ${error.message}`);
  }
}


    if (cached) {
      console.info('[createPubSubAdapterFromEnv] Reusing cached adapter instance');
      return cached;
    }
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
    const instance = createPubSubAdapter(config);
    adapterCache.set(cacheKey, instance);
    console.info('[createPubSubAdapterFromEnv] Created new adapter instance (cached)');
    return instance;
  } catch (error: any) {
    throw new Error(`Failed to create pub/sub adapter: ${error.message}`);
  }
}


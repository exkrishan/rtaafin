# Pub/Sub Abstraction

A pluggable pub/sub abstraction for the Agent Assist platform, supporting multiple backends (Redis Streams, Kafka, in-memory) with a unified interface.

## Overview

This module provides a typed, adapter-based pub/sub system that allows services (ingestion, ASR, NLU, UI, archive) to communicate reliably and independently. The abstraction supports:

- **Redis Streams**: Recommended for dev/prod (with consumer groups and ack semantics)
- **Kafka**: For high-throughput, distributed scenarios
- **In-Memory**: For unit tests and local development

## Quick Start

### Installation

```bash
# Dependencies are already in the monorepo
cd lib/pubsub
npm install  # If needed
```

### Basic Usage

```typescript
import { createPubSubAdapterFromEnv, audioTopic } from '@/lib/pubsub';

// Create adapter (reads from env vars)
const adapter = createPubSubAdapterFromEnv();

// Publish a message
const topic = audioTopic({ tenantId: 'tenant-123' });
await adapter.publish(topic, {
  interaction_id: 'int-123',
  tenant_id: 'tenant-123',
  data: 'your-payload',
});

// Subscribe to messages
const handle = await adapter.subscribe(topic, async (msg) => {
  console.log('Received:', msg);
  // Process message...
  
  // ACK if using streams
  await adapter.ack(handle, msgId);
});

// Cleanup
await handle.unsubscribe();
await adapter.close();
```

## Adapter Selection

### Redis Streams (Recommended)

**When to use:**
- Development and production
- Need consumer groups and replay capability
- Moderate throughput requirements
- Want simple setup

**Configuration:**
```bash
export PUBSUB_ADAPTER=redis_streams
export REDIS_URL=redis://localhost:6379
export REDIS_CONSUMER_GROUP=agent-assist
export REDIS_CONSUMER_NAME=consumer-1
```

**Features:**
- ✅ Consumer groups for load balancing
- ✅ ACK semantics for reliable delivery
- ✅ Message replay (read pending messages)
- ✅ Simple setup (single Redis instance)

### Kafka

**When to use:**
- High-throughput scenarios
- Distributed, multi-region deployments
- Need partitioning and ordering guarantees
- Enterprise-scale requirements

**Configuration:**
```bash
export PUBSUB_ADAPTER=kafka
export KAFKA_BROKERS=localhost:9092,localhost:9093
export KAFKA_CLIENT_ID=agent-assist
export KAFKA_CONSUMER_GROUP=agent-assist
```

**Features:**
- ✅ High throughput
- ✅ Partitioning and ordering
- ✅ Distributed architecture
- ✅ Built-in replication

### In-Memory

**When to use:**
- Unit tests
- Local development (no infrastructure)
- Fast, isolated testing

**Configuration:**
```bash
export PUBSUB_ADAPTER=in_memory
```

**Features:**
- ✅ No external dependencies
- ✅ Fast and synchronous
- ✅ Perfect for testing

## Topic Conventions

### Audio Frames

```typescript
import { audioTopic } from '@/lib/pubsub/topics';

// Per-tenant topic
const topic = audioTopic({ tenantId: 'tenant-123' });
// Result: "audio.tenant-123"

// Shared stream (for POC)
const topic = audioTopic({ useStreams: true });
// Result: "audio_stream"
```

### Transcript Updates

```typescript
import { transcriptTopic } from '@/lib/pubsub/topics';

const topic = transcriptTopic('int-123');
// Result: "transcript.int-123"
```

### Intent Updates

```typescript
import { intentTopic } from '@/lib/pubsub/topics';

const topic = intentTopic('int-123');
// Result: "intent.int-123"
```

## Message Envelope

All messages are wrapped in a standard envelope:

```typescript
interface MessageEnvelope {
  trace_id?: string;        // Optional tracing ID
  interaction_id: string;   // Required: interaction identifier
  tenant_id: string;       // Required: tenant identifier
  timestamp_ms: number;     // Required: message timestamp
  [key: string]: any;      // Additional payload fields
}
```

## API Reference

### `createPubSubAdapter(config?)`

Create a pub/sub adapter from configuration or environment variables.

```typescript
// From environment
const adapter = createPubSubAdapterFromEnv();

// With explicit config
const adapter = createPubSubAdapter({
  adapter: 'redis_streams',
  redis: {
    url: 'redis://localhost:6379',
    consumerGroup: 'my-group',
  },
});
```

### `adapter.publish(topic, message)`

Publish a message to a topic. Returns message ID (for streams) or void.

```typescript
const msgId = await adapter.publish('my-topic', {
  interaction_id: 'int-123',
  tenant_id: 'tenant-abc',
  data: 'payload',
});
```

### `adapter.subscribe(topic, handler)`

Subscribe to a topic. Returns a subscription handle.

```typescript
const handle = await adapter.subscribe('my-topic', async (msg) => {
  console.log('Received:', msg);
  // Process message...
});
```

### `adapter.ack(handle, msgId)`

Acknowledge a message (for streams with ack semantics).

```typescript
await adapter.ack(handle, msgId);
```

### `adapter.close()`

Close the adapter and cleanup resources.

```typescript
await adapter.close();
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PUBSUB_ADAPTER` | Adapter type: `redis_streams`, `kafka`, `in_memory` | `redis_streams` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_CONSUMER_GROUP` | Consumer group name | `agent-assist` |
| `REDIS_CONSUMER_NAME` | Consumer name | `consumer-{pid}` |
| `KAFKA_BROKERS` | Kafka broker list (comma-separated) | `localhost:9092` |
| `KAFKA_CLIENT_ID` | Kafka client ID | `agent-assist-pubsub` |
| `KAFKA_CONSUMER_GROUP` | Kafka consumer group | `agent-assist` |

## Migration Guide

### Updating Ingestion Service

The ingestion service has been updated to use the new pub/sub abstraction. To switch adapters:

**Before (old Redis pub/sub):**
```typescript
// Old code used direct Redis publish
await redis.publish(channel, JSON.stringify(payload));
```

**After (new abstraction):**
```typescript
// New code uses pluggable adapter
import { createPubSubAdapterFromEnv } from '@/lib/pubsub';
const adapter = createPubSubAdapterFromEnv();
await adapter.publish(topic, payload);
```

**Configuration:**
```bash
# Use Redis Streams (default)
export PUBSUB_ADAPTER=redis_streams
export REDIS_URL=redis://localhost:6379

# Or use Kafka
export PUBSUB_ADAPTER=kafka
export KAFKA_BROKERS=localhost:9092
```

The ingestion service automatically uses the configured adapter via `PUBSUB_ADAPTER` environment variable.

## Testing

### Unit Tests

```bash
npm test
```

Tests use the in-memory adapter for fast, isolated testing.

### Integration Tests

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Run integration tests
npm test -- redisStreamsAdapter.test.ts
```

### Demo Script

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Run demo
REDIS_URL=redis://localhost:6379 ts-node scripts/pubsub_demo.ts
```

## Redis Streams Details

### Consumer Groups

Redis Streams uses consumer groups for load balancing and replay:

```typescript
// Create consumer group (automatically done by adapter)
// XGROUP CREATE stream group-name 0 MKSTREAM

// Read from group
// XREADGROUP GROUP group-name consumer-name COUNT 1 BLOCK 1000 STREAMS stream >

// ACK message
// XACK stream group-name msg-id
```

### Pending Messages

To read pending (unacked) messages:

```typescript
// The adapter handles this automatically, but you can also:
// XPENDING stream group-name
// XREADGROUP GROUP group-name consumer-name COUNT 1 STREAMS stream 0
```

## Kafka Details

### Consumer Groups

Kafka uses consumer groups for load balancing:

- Multiple consumers in same group share partitions
- Each message delivered to one consumer in group
- Automatic offset management

### Manual Commits

The adapter handles commits automatically. For manual commits, you'd need to extend the adapter.

## Best Practices

1. **Always ACK messages** after successful processing (for streams)
2. **Use structured logging** with trace_id for debugging
3. **Handle errors gracefully** - don't ack on error (allows replay)
4. **Close adapters** on shutdown for clean resource cleanup
5. **Use topic helpers** for consistent naming
6. **Test with in-memory adapter** for fast unit tests

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
redis-cli ping

# Check connection URL
echo $REDIS_URL
```

### Kafka Connection Issues

```bash
# Check Kafka brokers
nc -zv localhost 9092

# Check environment variables
echo $KAFKA_BROKERS
```

### Message Not Received

1. Check subscription is active
2. Verify topic name matches
3. Check consumer group (for streams)
4. Verify message was published (check Redis/Kafka directly)

## Performance Considerations

- **Redis Streams**: ~10K-50K messages/sec per instance
- **Kafka**: ~100K+ messages/sec (distributed)
- **In-Memory**: Unlimited (but not persistent)

## Security

- **Redis**: Use AUTH and TLS in production
- **Kafka**: Use SASL/SSL for authentication and encryption
- **JWT**: Validate tokens before publishing sensitive data

## License

ISC


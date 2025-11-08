# 🔐 ASR Worker Environment Variables

## Required Environment Variables

### ✅ **REDIS_URL** (Required)
- **Description:** Redis connection URL for pub/sub
- **Format:** `redis://[username]:[password]@[host]:[port]`
- **Example:** `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304`
- **Used by:** Redis Streams adapter for pub/sub messaging

### ✅ **PUBSUB_ADAPTER** (Required)
- **Description:** Pub/sub adapter type
- **Values:** `redis_streams` | `kafka` | `in_memory`
- **Default:** `redis_streams` (if not set, but should be explicit)
- **Example:** `redis_streams`
- **Used by:** Pub/sub abstraction layer

### ✅ **ASR_PROVIDER** (Required)
- **Description:** ASR (speech recognition) provider to use
- **Values:** `mock` | `deepgram` | `whisper`
- **Default:** `mock` (if not set)
- **Example:** `deepgram`
- **Used by:** ASR worker to select which provider to use

---

## Optional Environment Variables

### ⚠️ **DEEPGRAM_API_KEY** (Required if ASR_PROVIDER=deepgram)
- **Description:** Deepgram API key for speech recognition
- **Format:** String (API key from Deepgram dashboard)
- **Example:** `d65326fff430ad13ad6ad78acfe305a8d8c8245e`
- **Required when:** `ASR_PROVIDER=deepgram`
- **Used by:** Deepgram ASR provider

### ⚠️ **PORT** (Optional)
- **Description:** HTTP server port for metrics and health endpoints
- **Default:** `3001`
- **Example:** `3001` (or let Render auto-assign)
- **Note:** Render will auto-assign a port, but you can set it explicitly
- **Used by:** HTTP server for `/health` and `/metrics` endpoints

### ⚠️ **BUFFER_WINDOW_MS** (Optional)
- **Description:** Audio buffer window in milliseconds (200-500ms recommended)
- **Default:** `300`
- **Example:** `300`
- **Used by:** ASR worker to determine when to process buffered audio

### ⚠️ **REDIS_CONSUMER_GROUP** (Optional)
- **Description:** Redis Streams consumer group name
- **Default:** `asr-worker`
- **Example:** `asr-worker`
- **Used by:** Redis Streams adapter for consumer group management

### ⚠️ **REDIS_CONSUMER_NAME** (Optional)
- **Description:** Redis Streams consumer name (unique per instance)
- **Default:** `asr-worker-1`
- **Example:** `asr-worker-1` (or `asr-worker-2` for multiple instances)
- **Used by:** Redis Streams adapter for consumer identification

---

## Environment Variables for Kafka (if using Kafka adapter)

### ⚠️ **KAFKA_BROKERS** (Required if PUBSUB_ADAPTER=kafka)
- **Description:** Comma-separated list of Kafka broker URLs
- **Format:** `host1:port1,host2:port2`
- **Example:** `kafka1:9092,kafka2:9092`
- **Used by:** Kafka adapter

### ⚠️ **KAFKA_CLIENT_ID** (Optional, for Kafka)
- **Description:** Kafka client ID
- **Default:** `asr-worker`
- **Example:** `asr-worker`
- **Used by:** Kafka adapter

### ⚠️ **KAFKA_CONSUMER_GROUP** (Optional, for Kafka)
- **Description:** Kafka consumer group
- **Default:** `asr-worker`
- **Example:** `asr-worker`
- **Used by:** Kafka adapter

---

## 📋 Complete Environment Variable List for Render

### Minimum Required (for Redis Streams + Deepgram)

```bash
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
PUBSUB_ADAPTER=redis_streams
ASR_PROVIDER=deepgram
DEEPGRAM_API_KEY=d65326fff430ad13ad6ad78acfe305a8d8c8245e
```

### Recommended (with all optional settings)

```bash
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
PUBSUB_ADAPTER=redis_streams
ASR_PROVIDER=deepgram
DEEPGRAM_API_KEY=d65326fff430ad13ad6ad78acfe305a8d8c8245e
PORT=3001
BUFFER_WINDOW_MS=300
REDIS_CONSUMER_GROUP=asr-worker
REDIS_CONSUMER_NAME=asr-worker-1
```

### For Testing (Mock Provider)

```bash
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
PUBSUB_ADAPTER=redis_streams
ASR_PROVIDER=mock
# DEEPGRAM_API_KEY not needed for mock
```

---

## 🔍 How to Verify Environment Variables

### Check in Code

The ASR worker reads these variables in `services/asr-worker/src/index.ts`:

```typescript
const PORT = parseInt(process.env.PORT || '3001', 10);
const BUFFER_WINDOW_MS = parseInt(process.env.BUFFER_WINDOW_MS || '300', 10);
const ASR_PROVIDER = (process.env.ASR_PROVIDER || 'mock') as 'mock' | 'deepgram' | 'whisper';
```

The pub/sub adapter reads:
- `PUBSUB_ADAPTER` (from `lib/pubsub/index.ts`)
- `REDIS_URL` (from `lib/pubsub/adapters/redisStreamsAdapter.ts`)
- `REDIS_CONSUMER_GROUP` (from `lib/pubsub/adapters/redisStreamsAdapter.ts`)
- `REDIS_CONSUMER_NAME` (from `lib/pubsub/adapters/redisStreamsAdapter.ts`)

---

## ✅ Validation Checklist

Before deploying, ensure:

- [ ] `REDIS_URL` is set and valid
- [ ] `PUBSUB_ADAPTER` is set to `redis_streams`
- [ ] `ASR_PROVIDER` is set (`mock`, `deepgram`, or `whisper`)
- [ ] If `ASR_PROVIDER=deepgram`, `DEEPGRAM_API_KEY` is set
- [ ] All other variables are optional but recommended

---

## 🐛 Common Issues

### Issue: "Cannot connect to Redis"
- **Check:** `REDIS_URL` is correct and accessible
- **Check:** Redis credentials are valid

### Issue: "ASR provider not initialized"
- **Check:** `ASR_PROVIDER` is set correctly
- **Check:** If using Deepgram, `DEEPGRAM_API_KEY` is set

### Issue: "Pub/sub adapter not found"
- **Check:** `PUBSUB_ADAPTER` is set to `redis_streams`
- **Check:** `REDIS_URL` is set

---

## 📝 Quick Reference

| Variable | Required | Default | Used For |
|----------|----------|---------|----------|
| `REDIS_URL` | ✅ Yes | - | Redis connection |
| `PUBSUB_ADAPTER` | ✅ Yes | `redis_streams` | Pub/sub type |
| `ASR_PROVIDER` | ✅ Yes | `mock` | ASR provider |
| `DEEPGRAM_API_KEY` | ⚠️ If deepgram | - | Deepgram API |
| `PORT` | ⚠️ Optional | `3001` | HTTP server |
| `BUFFER_WINDOW_MS` | ⚠️ Optional | `300` | Audio buffering |
| `REDIS_CONSUMER_GROUP` | ⚠️ Optional | `asr-worker` | Redis consumer group |
| `REDIS_CONSUMER_NAME` | ⚠️ Optional | `asr-worker-1` | Redis consumer name |

---

**Next:** Use these environment variables when deploying the ASR worker on Render!

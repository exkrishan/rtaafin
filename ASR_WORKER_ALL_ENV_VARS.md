# 🔐 ASR Worker - Complete Environment Variables Reference

## Overview
This document lists **ALL** environment variables used by the ASR Worker service, organized by category and provider.

---

## ✅ REQUIRED Environment Variables (All Providers)

### Core Configuration

#### `ASR_PROVIDER`
**Purpose:** Select the ASR provider to use  
**Required:** Yes  
**Default:** `mock`  
**Options:** `mock` | `deepgram` | `elevenlabs` | `google` | `whisper`

```
ASR_PROVIDER=elevenlabs
```

---

#### `PUBSUB_ADAPTER`
**Purpose:** Pub/sub adapter type  
**Required:** Yes  
**Default:** `redis_streams`  
**Options:** `redis_streams` | `kafka` | `in_memory`

```
PUBSUB_ADAPTER=redis_streams
```

---

#### `REDIS_URL`
**Purpose:** Redis connection string (required when `PUBSUB_ADAPTER=redis_streams`)  
**Required:** Yes (for Redis)  
**Format:** `redis://default:password@host:port`

```
REDIS_URL=redis://default:password@redis-host:6379
```

---

#### `PORT`
**Purpose:** Server port  
**Required:** No (auto-set by Render/Platform)  
**Default:** `3001`

```
PORT=3001
```

---

## 🔧 Provider-Specific Environment Variables

### ElevenLabs Provider (`ASR_PROVIDER=elevenlabs`)

#### Required

##### `ELEVENLABS_API_KEY`
**Purpose:** ElevenLabs API key for Speech-to-Text  
**Required:** Yes (when `ASR_PROVIDER=elevenlabs`)  
**Format:** API key starting with `sk_`

```
ELEVENLABS_API_KEY=sk_your_api_key_here
```

#### Optional

##### `ELEVENLABS_MODEL`
**Purpose:** ElevenLabs model ID  
**Default:** `scribe_v2_realtime`  
**Required:** No

```
ELEVENLABS_MODEL=scribe_v2_realtime
```

##### `ELEVENLABS_LANGUAGE`
**Purpose:** Language code for transcription  
**Default:** `en`  
**Required:** No  
**Options:** `en`, `es`, `fr`, etc.

```
ELEVENLABS_LANGUAGE=en
```

##### `ELEVENLABS_VAD_SILENCE_THRESHOLD`
**Purpose:** Silence threshold before committing transcript (seconds)  
**Default:** `1.5`  
**Required:** No

```
ELEVENLABS_VAD_SILENCE_THRESHOLD=1.5
```

##### `ELEVENLABS_VAD_THRESHOLD`
**Purpose:** Voice Activity Detection sensitivity (0.0-1.0)  
**Default:** `0.4`  
**Required:** No

```
ELEVENLABS_VAD_THRESHOLD=0.4
```

##### `ELEVENLABS_MIN_SPEECH_DURATION_MS`
**Purpose:** Minimum speech duration to trigger VAD (milliseconds)  
**Default:** `100`  
**Required:** No

```
ELEVENLABS_MIN_SPEECH_DURATION_MS=100
```

##### `ELEVENLABS_MIN_SILENCE_DURATION_MS`
**Purpose:** Minimum silence duration to trigger VAD (milliseconds)  
**Default:** `100`  
**Required:** No

```
ELEVENLABS_MIN_SILENCE_DURATION_MS=100
```

---

### Deepgram Provider (`ASR_PROVIDER=deepgram`)

#### Required

##### `DEEPGRAM_API_KEY`
**Purpose:** Deepgram API key  
**Required:** Yes (when `ASR_PROVIDER=deepgram`)  
**Format:** API key string

```
DEEPGRAM_API_KEY=your_deepgram_api_key
```

#### Optional

##### `DG_MODEL` or `DEEPGRAM_MODEL`
**Purpose:** Deepgram model name  
**Default:** `nova-3`  
**Required:** No

```
DG_MODEL=nova-3
# or
DEEPGRAM_MODEL=nova-3
```

##### `DG_ENCODING` or `DEEPGRAM_ENCODING`
**Purpose:** Audio encoding format  
**Default:** `linear16`  
**Required:** No

```
DG_ENCODING=linear16
```

##### `DG_SAMPLE_RATE` or `DEEPGRAM_SAMPLE_RATE`
**Purpose:** Audio sample rate (Hz)  
**Default:** `8000` (forced for telephony)  
**Required:** No

```
DG_SAMPLE_RATE=8000
```

##### `DG_CHANNELS` or `DEEPGRAM_CHANNELS`
**Purpose:** Number of audio channels  
**Default:** `1` (mono)  
**Required:** No

```
DG_CHANNELS=1
```

##### `DG_SMART_FORMAT` or `DEEPGRAM_SMART_FORMAT`
**Purpose:** Enable smart formatting (punctuation, capitalization)  
**Default:** `true`  
**Required:** No

```
DG_SMART_FORMAT=true
```

##### `DG_DIARIZE` or `DEEPGRAM_DIARIZE`
**Purpose:** Enable speaker diarization  
**Default:** `false`  
**Required:** No

```
DG_DIARIZE=false
```

##### `DEEPGRAM_LANGUAGE`
**Purpose:** Language code for transcription  
**Default:** `en-US`  
**Required:** No

```
DEEPGRAM_LANGUAGE=en-US
```

##### `DEEPGRAM_INTERIM_RESULTS`
**Purpose:** Enable interim (partial) results  
**Default:** `true`  
**Required:** No

```
DEEPGRAM_INTERIM_RESULTS=true
```

##### `DEEPGRAM_MAX_RECONNECT_ATTEMPTS`
**Purpose:** Maximum reconnection attempts  
**Default:** `3`  
**Required:** No

```
DEEPGRAM_MAX_RECONNECT_ATTEMPTS=3
```

##### `DEEPGRAM_KEEPALIVE_INTERVAL_MS`
**Purpose:** KeepAlive ping interval (milliseconds)  
**Default:** `3000` (3 seconds)  
**Required:** No

```
DEEPGRAM_KEEPALIVE_INTERVAL_MS=3000
```

##### `DEEPGRAM_KEEPALIVE_ENABLED`
**Purpose:** Enable KeepAlive pings  
**Default:** `true`  
**Required:** No

```
DEEPGRAM_KEEPALIVE_ENABLED=true
```

---

### Google Cloud Speech Provider (`ASR_PROVIDER=google`)

#### Required (One of)

##### `GOOGLE_APPLICATION_CREDENTIALS`
**Purpose:** Path to Google Cloud service account key file  
**Required:** Yes (if not using `GOOGLE_CLOUD_PROJECT_ID`)  
**Format:** File path

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

##### `GOOGLE_CLOUD_PROJECT_ID`
**Purpose:** Google Cloud project ID (for Application Default Credentials)  
**Required:** Yes (if not using `GOOGLE_APPLICATION_CREDENTIALS`)

```
GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

#### Optional

##### `GOOGLE_SPEECH_LOCATION`
**Purpose:** Google Cloud region/location  
**Default:** `us`  
**Required:** No

```
GOOGLE_SPEECH_LOCATION=us
```

##### `GOOGLE_SPEECH_MODEL`
**Purpose:** Google Speech model  
**Default:** `latest_long`  
**Required:** No

```
GOOGLE_SPEECH_MODEL=latest_long
```

##### `GOOGLE_SPEECH_LANGUAGE_CODE`
**Purpose:** Language code for transcription  
**Default:** `en-US`  
**Required:** No

```
GOOGLE_SPEECH_LANGUAGE_CODE=en-US
```

---

### Whisper Local Provider (`ASR_PROVIDER=whisper`)

#### Optional

##### `WHISPER_PATH`
**Purpose:** Path to Whisper executable  
**Default:** `whisper`  
**Required:** No

```
WHISPER_PATH=whisper
```

##### `WHISPER_MODEL_PATH`
**Purpose:** Path to Whisper model file  
**Default:** (empty)  
**Required:** No

```
WHISPER_MODEL_PATH=/path/to/model.pt
```

---

## 🎛️ Audio Processing Configuration

### Chunk Sizing

##### `INITIAL_CHUNK_DURATION_MS`
**Purpose:** Duration of initial audio chunk (milliseconds)  
**Default:** `200`  
**Required:** No

```
INITIAL_CHUNK_DURATION_MS=200
```

##### `CONTINUOUS_CHUNK_DURATION_MS`
**Purpose:** Duration of continuous audio chunks (milliseconds)  
**Default:** `100`  
**Required:** No

```
CONTINUOUS_CHUNK_DURATION_MS=100
```

##### `MAX_CHUNK_DURATION_MS`
**Purpose:** Maximum chunk size (milliseconds)  
**Default:** `250`  
**Required:** No

```
MAX_CHUNK_DURATION_MS=250
```

##### `MIN_AUDIO_DURATION_MS`
**Purpose:** Minimum audio duration before processing (milliseconds)  
**Default:** `200`  
**Required:** No

```
MIN_AUDIO_DURATION_MS=200
```

##### `ASR_CHUNK_MIN_MS`
**Purpose:** Minimum chunk size for continuous streaming (milliseconds)  
**Default:** `100`  
**Required:** No

```
ASR_CHUNK_MIN_MS=100
```

### Buffer Management

##### `BUFFER_WINDOW_MS`
**Purpose:** Legacy buffer window (milliseconds)  
**Default:** `1000`  
**Required:** No

```
BUFFER_WINDOW_MS=1000
```

##### `STALE_BUFFER_TIMEOUT_MS`
**Purpose:** Timeout for stale buffers (milliseconds)  
**Default:** `5000` (5 seconds)  
**Required:** No

```
STALE_BUFFER_TIMEOUT_MS=5000
```

---

## 🔌 PubSub/Redis Configuration

### Redis Streams (when `PUBSUB_ADAPTER=redis_streams`)

##### `REDIS_CONSUMER_GROUP`
**Purpose:** Redis consumer group name  
**Default:** `agent-assist`  
**Required:** No

```
REDIS_CONSUMER_GROUP=agent-assist
```

##### `REDIS_CONSUMER_NAME`
**Purpose:** Redis consumer name  
**Default:** `consumer-{pid}` (auto-generated)  
**Required:** No

```
REDIS_CONSUMER_NAME=asr-worker-1
```

### Kafka (when `PUBSUB_ADAPTER=kafka`)

##### `KAFKA_BROKERS`
**Purpose:** Kafka broker list (comma-separated)  
**Required:** Yes (when using Kafka)

```
KAFKA_BROKERS=broker1:9092,broker2:9092
```

##### `KAFKA_CLIENT_ID`
**Purpose:** Kafka client ID  
**Default:** `agent-assist-pubsub`  
**Required:** No

```
KAFKA_CLIENT_ID=asr-worker
```

##### `KAFKA_CONSUMER_GROUP`
**Purpose:** Kafka consumer group  
**Default:** `agent-assist`  
**Required:** No

```
KAFKA_CONSUMER_GROUP=agent-assist
```

---

## 🔗 Exotel Bridge Configuration

##### `EXO_BRIDGE_ENABLED`
**Purpose:** Enable Exotel→Deepgram bridge feature  
**Default:** `false`  
**Required:** No

```
EXO_BRIDGE_ENABLED=true
```

**Note:** When enabled, requires `DEEPGRAM_API_KEY` to be set.

##### `EXO_IDLE_CLOSE_S`
**Purpose:** Idle timeout for Exotel connections (seconds)  
**Default:** `10`  
**Required:** No

```
EXO_IDLE_CLOSE_S=10
```

##### `EXO_EARLY_AUDIO_FILTER`
**Purpose:** Enable early audio filtering for Exotel  
**Default:** `true`  
**Required:** No

```
EXO_EARLY_AUDIO_FILTER=true
```

---

## 📋 Quick Reference by Provider

### ElevenLabs Setup (Minimum)
```bash
ASR_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=sk_...
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://...
```

### Deepgram Setup (Minimum)
```bash
ASR_PROVIDER=deepgram
DEEPGRAM_API_KEY=...
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://...
```

### Google Cloud Setup (Minimum)
```bash
ASR_PROVIDER=google
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
# OR
GOOGLE_CLOUD_PROJECT_ID=your-project-id
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://...
```

### Mock Provider (Testing)
```bash
ASR_PROVIDER=mock
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://...
```

---

## 🎯 Complete Checklist by Use Case

### Production Deployment (ElevenLabs)
- [ ] `ASR_PROVIDER=elevenlabs`
- [ ] `ELEVENLABS_API_KEY=sk_...`
- [ ] `PUBSUB_ADAPTER=redis_streams`
- [ ] `REDIS_URL=redis://...`
- [ ] `ELEVENLABS_MODEL=scribe_v2_realtime` (optional)
- [ ] `ELEVENLABS_LANGUAGE=en` (optional)
- [ ] `REDIS_CONSUMER_GROUP=agent-assist` (optional)

### Production Deployment (Deepgram)
- [ ] `ASR_PROVIDER=deepgram`
- [ ] `DEEPGRAM_API_KEY=...`
- [ ] `PUBSUB_ADAPTER=redis_streams`
- [ ] `REDIS_URL=redis://...`
- [ ] `DG_MODEL=nova-3` (optional)
- [ ] `DG_SAMPLE_RATE=8000` (optional)
- [ ] `REDIS_CONSUMER_GROUP=agent-assist` (optional)

### Production Deployment (Google)
- [ ] `ASR_PROVIDER=google`
- [ ] `GOOGLE_APPLICATION_CREDENTIALS=...` OR `GOOGLE_CLOUD_PROJECT_ID=...`
- [ ] `PUBSUB_ADAPTER=redis_streams`
- [ ] `REDIS_URL=redis://...`
- [ ] `GOOGLE_SPEECH_LOCATION=us` (optional)
- [ ] `GOOGLE_SPEECH_LANGUAGE_CODE=en-US` (optional)

### Exotel Bridge (Deepgram)
- [ ] `ASR_PROVIDER=deepgram`
- [ ] `DEEPGRAM_API_KEY=...`
- [ ] `EXO_BRIDGE_ENABLED=true`
- [ ] `PUBSUB_ADAPTER=redis_streams`
- [ ] `REDIS_URL=redis://...`
- [ ] `EXO_IDLE_CLOSE_S=10` (optional)
- [ ] `EXO_EARLY_AUDIO_FILTER=true` (optional)

---

## 🔍 Environment Variable Validation

The ASR Worker validates environment variables on startup:

### Validation Rules:
1. **`ASR_PROVIDER=deepgram`** → Requires `DEEPGRAM_API_KEY`
2. **`ASR_PROVIDER=elevenlabs`** → Requires `ELEVENLABS_API_KEY`
3. **`ASR_PROVIDER=google`** → Requires `GOOGLE_APPLICATION_CREDENTIALS` OR `GOOGLE_CLOUD_PROJECT_ID`
4. **`PUBSUB_ADAPTER=redis_streams`** → Requires `REDIS_URL`
5. **`PUBSUB_ADAPTER=kafka`** → Requires `KAFKA_BROKERS`
6. **`EXO_BRIDGE_ENABLED=true`** → Requires `DEEPGRAM_API_KEY`

### Error Messages:
- ❌ `DEEPGRAM_API_KEY is required when ASR_PROVIDER=deepgram`
- ❌ `ELEVENLABS_API_KEY is required when ASR_PROVIDER=elevenlabs`
- ❌ `REDIS_URL is required when PUBSUB_ADAPTER=redis_streams`
- ❌ `KAFKA_BROKERS is required when PUBSUB_ADAPTER=kafka`

---

## 📊 Default Values Summary

| Variable | Default | Provider |
|----------|---------|----------|
| `ASR_PROVIDER` | `mock` | All |
| `PORT` | `3001` | All |
| `PUBSUB_ADAPTER` | `redis_streams` | All |
| `ELEVENLABS_MODEL` | `scribe_v2_realtime` | ElevenLabs |
| `ELEVENLABS_LANGUAGE` | `en` | ElevenLabs |
| `ELEVENLABS_VAD_SILENCE_THRESHOLD` | `1.5` | ElevenLabs |
| `ELEVENLABS_VAD_THRESHOLD` | `0.4` | ElevenLabs |
| `DG_MODEL` | `nova-3` | Deepgram |
| `DG_ENCODING` | `linear16` | Deepgram |
| `DG_SAMPLE_RATE` | `8000` | Deepgram |
| `DG_CHANNELS` | `1` | Deepgram |
| `DG_SMART_FORMAT` | `true` | Deepgram |
| `DG_DIARIZE` | `false` | Deepgram |
| `DEEPGRAM_LANGUAGE` | `en-US` | Deepgram |
| `DEEPGRAM_INTERIM_RESULTS` | `true` | Deepgram |
| `GOOGLE_SPEECH_LOCATION` | `us` | Google |
| `GOOGLE_SPEECH_MODEL` | `latest_long` | Google |
| `GOOGLE_SPEECH_LANGUAGE_CODE` | `en-US` | Google |
| `INITIAL_CHUNK_DURATION_MS` | `200` | All |
| `CONTINUOUS_CHUNK_DURATION_MS` | `100` | All |
| `MAX_CHUNK_DURATION_MS` | `250` | All |
| `MIN_AUDIO_DURATION_MS` | `200` | All |
| `ASR_CHUNK_MIN_MS` | `100` | All |
| `BUFFER_WINDOW_MS` | `1000` | All |
| `STALE_BUFFER_TIMEOUT_MS` | `5000` | All |
| `REDIS_CONSUMER_GROUP` | `agent-assist` | Redis |
| `EXO_BRIDGE_ENABLED` | `false` | Exotel |
| `EXO_IDLE_CLOSE_S` | `10` | Exotel |
| `EXO_EARLY_AUDIO_FILTER` | `true` | Exotel |

---

## 🔐 Security Best Practices

1. **Never commit API keys** to git repositories
2. **Use environment variables** for all secrets
3. **Rotate API keys** periodically
4. **Monitor usage** in provider dashboards
5. **Set up alerts** for unusual usage patterns
6. **Use least privilege** API keys (only required permissions)
7. **Validate environment variables** before deployment

---

## 📚 Additional Resources

- [ElevenLabs Setup Guide](./services/asr-worker/docs/ELEVENLABS_SETUP.md)
- [Render Deployment Guide](./RENDER_ASR_WORKER_DEPLOYMENT.md)
- [Render ElevenLabs Env Vars](./RENDER_ASR_WORKER_ELEVENLABS_ENV_VARS.md)


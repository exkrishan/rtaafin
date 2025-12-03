# 🔐 Render Environment Variables - ASR Worker (ElevenLabs)

## Overview
This document lists all environment variables required to deploy the ASR Worker service on Render with ElevenLabs Speech-to-Text implementation.

---

## ✅ REQUIRED Environment Variables

### 1. ASR Provider Configuration

#### `ASR_PROVIDER`
**Purpose:** Select the ASR provider to use  
**Value:** `elevenlabs`  
**Required:** Yes

```
ASR_PROVIDER=elevenlabs
```

---

#### `ELEVENLABS_API_KEY`
**Purpose:** ElevenLabs API key for Speech-to-Text access  
**Required:** Yes  
**Format:** API key starting with `sk_`

```
ELEVENLABS_API_KEY=sk_your_api_key_here
```

**How to get:**
1. Go to [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
2. Create or copy an existing API key
3. Ensure the key has Speech-to-Text permissions

**⚠️ Critical:** Service will NOT start without this variable when `ASR_PROVIDER=elevenlabs`

---

### 2. PubSub/Redis Configuration

#### `PUBSUB_ADAPTER`
**Purpose:** Pub/sub adapter type  
**Value:** `redis_streams` (recommended for production)  
**Required:** Yes

```
PUBSUB_ADAPTER=redis_streams
```

**Options:**
- `redis_streams` - Production (recommended)
- `in_memory` - Testing only (doesn't work across processes)
- `kafka` - If using Kafka

---

#### `REDIS_URL`
**Purpose:** Redis connection string for pub/sub messaging  
**Required:** Yes (when `PUBSUB_ADAPTER=redis_streams`)

**Format:**
```
redis://default:password@host:port
# or
redis://:password@host:port
# or (Redis Cloud)
redis://default:password@redis-xxx.cxxx.us-east-1-3.ec2.redns.redis-cloud.com:12304
```

**Example:**
```
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
```

**How to get:**
- From your Redis provider dashboard
- From your local `.env.local` file: `grep REDIS_URL .env.local`

---

### 3. Server Configuration

#### `PORT`
**Purpose:** Server port  
**Value:** Automatically set by Render  
**Required:** No (Render sets this automatically)  
**Note:** Don't manually set this - Render provides it automatically

---

## 🔧 OPTIONAL Environment Variables

### ElevenLabs-Specific Configuration

#### `ELEVENLABS_MODEL`
**Purpose:** ElevenLabs model ID  
**Default:** `scribe_v2_realtime`  
**Required:** No

```
ELEVENLABS_MODEL=scribe_v2_realtime
```

**Available Models:**
- `scribe_v2_realtime` - Real-time streaming transcription (recommended)

---

#### `ELEVENLABS_LANGUAGE`
**Purpose:** Language code for transcription  
**Default:** `en`  
**Required:** No

```
ELEVENLABS_LANGUAGE=en
```

**Supported Languages:**
- `en` - English
- `es` - Spanish
- `fr` - French
- And many more (see ElevenLabs documentation)

---

#### `ELEVENLABS_VAD_SILENCE_THRESHOLD`
**Purpose:** How long to wait for silence before committing transcript (seconds)  
**Default:** `1.5`  
**Required:** No

```
ELEVENLABS_VAD_SILENCE_THRESHOLD=1.5
```

**Tuning:**
- Lower value = faster final transcripts (more responsive)
- Higher value = waits longer for silence (more complete sentences)

---

#### `ELEVENLABS_VAD_THRESHOLD`
**Purpose:** Voice Activity Detection sensitivity (0.0-1.0)  
**Default:** `0.4`  
**Required:** No

```
ELEVENLABS_VAD_THRESHOLD=0.4
```

**Tuning:**
- Higher value = more sensitive to speech (detects quieter speech)
- Lower value = less sensitive (only detects louder speech)

---

#### `ELEVENLABS_MIN_SPEECH_DURATION_MS`
**Purpose:** Minimum speech duration to trigger VAD (milliseconds)  
**Default:** `100`  
**Required:** No

```
ELEVENLABS_MIN_SPEECH_DURATION_MS=100
```

**Tuning:**
- Lower value = detects shorter speech segments
- Higher value = only detects longer speech segments

---

#### `ELEVENLABS_MIN_SILENCE_DURATION_MS`
**Purpose:** Minimum silence duration to trigger VAD (milliseconds)  
**Default:** `100`  
**Required:** No

```
ELEVENLABS_MIN_SILENCE_DURATION_MS=100
```

---

### Audio Processing Configuration

#### `INITIAL_CHUNK_DURATION_MS`
**Purpose:** Duration of initial audio chunk sent to ASR (milliseconds)  
**Default:** `200`  
**Required:** No

```
INITIAL_CHUNK_DURATION_MS=200
```

---

#### `CONTINUOUS_CHUNK_DURATION_MS`
**Purpose:** Duration of continuous audio chunks for streaming (milliseconds)  
**Default:** `100`  
**Required:** No

```
CONTINUOUS_CHUNK_DURATION_MS=100
```

---

#### `MAX_CHUNK_DURATION_MS`
**Purpose:** Maximum chunk size (milliseconds)  
**Default:** `250`  
**Required:** No

```
MAX_CHUNK_DURATION_MS=250
```

---

#### `MIN_AUDIO_DURATION_MS`
**Purpose:** Minimum audio duration before processing (milliseconds)  
**Default:** `200`  
**Required:** No

```
MIN_AUDIO_DURATION_MS=200
```

---

#### `ASR_CHUNK_MIN_MS`
**Purpose:** Minimum chunk size for continuous streaming (milliseconds)  
**Default:** `100`  
**Required:** No

```
ASR_CHUNK_MIN_MS=100
```

---

#### `BUFFER_WINDOW_MS`
**Purpose:** Legacy buffer window (milliseconds)  
**Default:** `1000`  
**Required:** No

```
BUFFER_WINDOW_MS=1000
```

---

#### `STALE_BUFFER_TIMEOUT_MS`
**Purpose:** Timeout for stale buffers - if no new audio arrives for this duration, buffer is cleaned up (milliseconds)  
**Default:** `5000` (5 seconds)  
**Required:** No

```
STALE_BUFFER_TIMEOUT_MS=5000
```

---

### Redis Consumer Configuration (Optional)

#### `REDIS_CONSUMER_GROUP`
**Purpose:** Redis consumer group name  
**Default:** `agent-assist`  
**Required:** No

```
REDIS_CONSUMER_GROUP=agent-assist
```

---

#### `REDIS_CONSUMER_NAME`
**Purpose:** Redis consumer name  
**Default:** `consumer-{pid}` (auto-generated)  
**Required:** No

```
REDIS_CONSUMER_NAME=asr-worker-1
```

---

### Exotel Bridge Configuration (Optional)

#### `EXO_BRIDGE_ENABLED`
**Purpose:** Enable Exotel→Deepgram bridge feature  
**Default:** `false`  
**Required:** No

```
EXO_BRIDGE_ENABLED=false
```

**Note:** Set to `true` only if you're using the Exotel bridge feature (requires Deepgram config)

---

## 📋 Complete Environment Variables Checklist

### Minimum Required (Service will start)
- [ ] `ASR_PROVIDER=elevenlabs`
- [ ] `ELEVENLABS_API_KEY=sk_...`
- [ ] `PUBSUB_ADAPTER=redis_streams`
- [ ] `REDIS_URL=redis://...`

### Recommended (Production)
- [ ] `ELEVENLABS_MODEL=scribe_v2_realtime` (default, but explicit is better)
- [ ] `ELEVENLABS_LANGUAGE=en` (or your target language)
- [ ] `REDIS_CONSUMER_GROUP=agent-assist` (or your group name)

### Optional (Performance Tuning)
- [ ] `ELEVENLABS_VAD_SILENCE_THRESHOLD=1.5`
- [ ] `ELEVENLABS_VAD_THRESHOLD=0.4`
- [ ] `ELEVENLABS_MIN_SPEECH_DURATION_MS=100`
- [ ] `ELEVENLABS_MIN_SILENCE_DURATION_MS=100`
- [ ] `INITIAL_CHUNK_DURATION_MS=200`
- [ ] `CONTINUOUS_CHUNK_DURATION_MS=100`
- [ ] `MAX_CHUNK_DURATION_MS=250`
- [ ] `MIN_AUDIO_DURATION_MS=200`
- [ ] `ASR_CHUNK_MIN_MS=100`
- [ ] `STALE_BUFFER_TIMEOUT_MS=5000`

---

## 🚀 Quick Setup for Render

### Step 1: Add Required Variables
In Render Dashboard → Your ASR Worker Service → Environment:

```
ASR_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=sk_your_actual_api_key_here
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://default:password@your-redis-host:port
```

### Step 2: Add Recommended Variables
```
ELEVENLABS_MODEL=scribe_v2_realtime
ELEVENLABS_LANGUAGE=en
REDIS_CONSUMER_GROUP=agent-assist
```

### Step 3: Deploy
Save and deploy. The service will:
1. Validate `ELEVENLABS_API_KEY` is set
2. Connect to Redis using `REDIS_URL`
3. Start listening for audio frames
4. Process audio through ElevenLabs
5. Publish transcripts back to Redis

---

## 🔍 Verification

After deployment, check the logs for:

### Success Indicators:
```
[ASRWorker] Starting ASR Worker...
[ASRWorker] Provider: elevenlabs
[ElevenLabsProvider] Initialized { model: 'scribe_v2_realtime', languageCode: 'en' }
[ASRWorker] Subscribed to audio topic
[ASRWorker] Health check endpoint available at /health
```

### Error Indicators:
```
❌ CRITICAL: ASR_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is not set!
❌ REDIS_URL is required when PUBSUB_ADAPTER=redis_streams
❌ Failed to create ASR provider: ELEVENLABS_API_KEY is required
```

---

## 📊 Health Check Endpoint

Once deployed, you can check service health:

```
GET https://your-service.onrender.com/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "asr-worker",
  "provider": "elevenlabs",
  "activeBuffers": 0,
  "subscriptions": 1,
  "exoBridgeEnabled": false
}
```

---

## 🐛 Troubleshooting

### Service Won't Start
1. **Check:** `ELEVENLABS_API_KEY` is set correctly
2. **Check:** `REDIS_URL` is valid and accessible
3. **Check:** `PUBSUB_ADAPTER=redis_streams` is set
4. **Check:** Logs for specific error messages

### No Transcripts Received
1. **Check:** Audio format is PCM16, 8kHz or 16kHz, mono
2. **Check:** Audio contains actual speech (not silence)
3. **Check:** VAD settings aren't too strict
4. **Check:** ElevenLabs API status

### Connection Errors
1. **Check:** API key is valid and has Speech-to-Text permissions
2. **Check:** Network connectivity to ElevenLabs API
3. **Check:** API key hasn't expired

---

## 📚 Additional Resources

- [ElevenLabs Setup Guide](../services/asr-worker/docs/ELEVENLABS_SETUP.md)
- [ElevenLabs Documentation](https://elevenlabs.io/docs)
- [Speech-to-Text API Reference](https://elevenlabs.io/docs/api-reference/speech-to-text)
- [Render Deployment Guide](./RENDER_ASR_WORKER_DEPLOYMENT.md)

---

## 🔐 Security Notes

1. **Never commit API keys** to git
2. **Use Render's environment variables** for secrets
3. **Rotate API keys** periodically
4. **Monitor usage** in ElevenLabs dashboard
5. **Set up alerts** for unusual usage patterns


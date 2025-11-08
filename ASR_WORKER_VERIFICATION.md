# 🔍 ASR Worker Verification Guide

## Step 1: Verify ASR Worker is Running

### Option A: Check Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Look for a service named:
   - `asr-worker`
   - `rtaa-asr-worker`
   - `asr`
3. Check service status:
   - ✅ **Live** = Running
   - ⚠️ **Building** = Currently deploying
   - ❌ **Failed** = Needs attention

### Option B: Check if Service Exists

If no ASR worker service exists, you need to deploy it.

---

## Step 2: Check ASR Worker Configuration

### Required Environment Variables

| Variable | Value | Required |
|----------|-------|----------|
| `REDIS_URL` | `redis://...` | ✅ Yes |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes |
| `ASR_PROVIDER` | `mock` \| `deepgram` \| `whisper` | ✅ Yes |
| `DEEPGRAM_API_KEY` | (if using deepgram) | ⚠️ If ASR_PROVIDER=deepgram |

### Verify in Render Dashboard

1. Go to ASR worker service
2. Click **"Environment"** tab
3. Verify all required variables are set

---

## Step 3: Check ASR Worker Logs

### Expected Startup Logs

```
[asr-worker] Starting ASR worker...
[asr-worker] ASR provider: mock (or deepgram/whisper)
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', ... }
[asr-worker] Subscribed to audio topic: audio_stream
[asr-worker] ✅ ASR worker ready
```

### Expected Runtime Logs

When audio frames are received:
```
[asr-worker] Received audio frame { interaction_id: '...', seq: 100 }
[asr-worker] Published transcript { type: 'partial', text: '...', ... }
[asr-worker] Published transcript { type: 'final', text: '...', ... }
```

---

## Step 4: Verify Redis Connection

### Check if ASR Worker Can Connect to Redis

Look for in logs:
- ✅ `[RedisStreamsAdapter] Connected to Redis: ...`
- ❌ `[RedisStreamsAdapter] Connection failed: ...`

---

## Step 5: Verify Audio Consumption

### Check if ASR Worker is Consuming Audio

1. Make a call from Exotel
2. Check ASR worker logs for:
   - `Received audio frame`
   - `Published transcript`

If you see these, ASR worker is consuming and processing!

---

## 🐛 Troubleshooting

### Issue: ASR Worker Not Deployed

**Solution:** Deploy ASR worker service on Render

1. Create new **Web Service** in Render
2. Configure:
   - **Name:** `rtaa-asr-worker`
   - **Root Directory:** `services/asr-worker`
   - **Build Command:** `cd ../.. && npm ci && cd services/asr-worker && npm run build`
   - **Start Command:** `npm run start`
   - **Environment:** `Node`

### Issue: ASR Worker Not Consuming

**Check:**
- Redis connection successful?
- Subscribed to correct topic (`audio_stream`)?
- Consumer group created?

**Look for in logs:**
- `Subscribed to audio topic: audio_stream`
- `Consumer group created: asr-worker`

### Issue: No Transcripts Generated

**Check:**
- ASR provider configured correctly?
- For Deepgram: API key valid?
- Audio frames being received?

**Look for in logs:**
- `ASR provider initialized: <provider>`
- `Received audio frame`
- `Published transcript`

---

## 📋 Quick Verification Commands

### Test ASR Worker Locally

```bash
cd services/asr-worker
REDIS_URL='redis://...' \
PUBSUB_ADAPTER=redis_streams \
ASR_PROVIDER=mock \
npm run start
```

### Check Redis Streams

```bash
# Connect to Redis
redis-cli -u <REDIS_URL>

# Check if audio_stream exists
XINFO STREAM audio_stream

# Check consumer groups
XINFO GROUPS audio_stream

# Check pending messages
XPENDING audio_stream asr-worker
```

---

## ✅ Success Indicators

- ✅ ASR worker service deployed and running
- ✅ Connected to Redis
- ✅ Subscribed to `audio_stream` topic
- ✅ Receiving audio frames
- ✅ Publishing transcripts
- ✅ No errors in logs

---

**Next:** Once ASR worker is verified, check if transcripts are being generated and published!


## Step 1: Verify ASR Worker is Running

### Option A: Check Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Look for a service named:
   - `asr-worker`
   - `rtaa-asr-worker`
   - `asr`
3. Check service status:
   - ✅ **Live** = Running
   - ⚠️ **Building** = Currently deploying
   - ❌ **Failed** = Needs attention

### Option B: Check if Service Exists

If no ASR worker service exists, you need to deploy it.

---

## Step 2: Check ASR Worker Configuration

### Required Environment Variables

| Variable | Value | Required |
|----------|-------|----------|
| `REDIS_URL` | `redis://...` | ✅ Yes |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes |
| `ASR_PROVIDER` | `mock` \| `deepgram` \| `whisper` | ✅ Yes |
| `DEEPGRAM_API_KEY` | (if using deepgram) | ⚠️ If ASR_PROVIDER=deepgram |

### Verify in Render Dashboard

1. Go to ASR worker service
2. Click **"Environment"** tab
3. Verify all required variables are set

---

## Step 3: Check ASR Worker Logs

### Expected Startup Logs

```
[asr-worker] Starting ASR worker...
[asr-worker] ASR provider: mock (or deepgram/whisper)
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', ... }
[asr-worker] Subscribed to audio topic: audio_stream
[asr-worker] ✅ ASR worker ready
```

### Expected Runtime Logs

When audio frames are received:
```
[asr-worker] Received audio frame { interaction_id: '...', seq: 100 }
[asr-worker] Published transcript { type: 'partial', text: '...', ... }
[asr-worker] Published transcript { type: 'final', text: '...', ... }
```

---

## Step 4: Verify Redis Connection

### Check if ASR Worker Can Connect to Redis

Look for in logs:
- ✅ `[RedisStreamsAdapter] Connected to Redis: ...`
- ❌ `[RedisStreamsAdapter] Connection failed: ...`

---

## Step 5: Verify Audio Consumption

### Check if ASR Worker is Consuming Audio

1. Make a call from Exotel
2. Check ASR worker logs for:
   - `Received audio frame`
   - `Published transcript`

If you see these, ASR worker is consuming and processing!

---

## 🐛 Troubleshooting

### Issue: ASR Worker Not Deployed

**Solution:** Deploy ASR worker service on Render

1. Create new **Web Service** in Render
2. Configure:
   - **Name:** `rtaa-asr-worker`
   - **Root Directory:** `services/asr-worker`
   - **Build Command:** `cd ../.. && npm ci && cd services/asr-worker && npm run build`
   - **Start Command:** `npm run start`
   - **Environment:** `Node`

### Issue: ASR Worker Not Consuming

**Check:**
- Redis connection successful?
- Subscribed to correct topic (`audio_stream`)?
- Consumer group created?

**Look for in logs:**
- `Subscribed to audio topic: audio_stream`
- `Consumer group created: asr-worker`

### Issue: No Transcripts Generated

**Check:**
- ASR provider configured correctly?
- For Deepgram: API key valid?
- Audio frames being received?

**Look for in logs:**
- `ASR provider initialized: <provider>`
- `Received audio frame`
- `Published transcript`

---

## 📋 Quick Verification Commands

### Test ASR Worker Locally

```bash
cd services/asr-worker
REDIS_URL='redis://...' \
PUBSUB_ADAPTER=redis_streams \
ASR_PROVIDER=mock \
npm run start
```

### Check Redis Streams

```bash
# Connect to Redis
redis-cli -u <REDIS_URL>

# Check if audio_stream exists
XINFO STREAM audio_stream

# Check consumer groups
XINFO GROUPS audio_stream

# Check pending messages
XPENDING audio_stream asr-worker
```

---

## ✅ Success Indicators

- ✅ ASR worker service deployed and running
- ✅ Connected to Redis
- ✅ Subscribed to `audio_stream` topic
- ✅ Receiving audio frames
- ✅ Publishing transcripts
- ✅ No errors in logs

---

**Next:** Once ASR worker is verified, check if transcripts are being generated and published!


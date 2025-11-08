# 🚀 ASR Worker Deployment on Render

## Quick Checklist

### ✅ Prerequisites
- [x] ASR worker code exists (`services/asr-worker/`)
- [x] Build configuration ready (`package.json`, `tsconfig.json`)
- [x] Environment variables identified

### ⏭️ Next Steps
1. **Check if ASR worker is already deployed on Render**
2. **If not, deploy it using the configuration below**

---

## 📋 Render Service Configuration

### Service Type
**Web Service** (not Static Site)

### Basic Settings

| Field | Value |
|-------|-------|
| **Name** | `rtaa-asr-worker` |
| **Root Directory** | `services/asr-worker` |
| **Environment** | `Node` |
| **Region** | (Choose closest to your Redis) |
| **Branch** | `main` |

### Build & Start Commands

| Field | Value |
|-------|-------|
| **Build Command** | `cd ../.. && npm ci && cd services/asr-worker && npm run build` |
| **Start Command** | `npm run start` |

### Health Check

| Field | Value |
|-------|-------|
| **Health Check Path** | `/health` |

---

## 🔐 Environment Variables

Add these in Render Dashboard → ASR Worker Service → Environment:

| Variable | Value | Required |
|----------|-------|----------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` | ✅ Yes |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes |
| `ASR_PROVIDER` | `deepgram` (or `mock` for testing) | ✅ Yes |
| `DEEPGRAM_API_KEY` | `d65326fff430ad13ad6ad78acfe305a8d8c8245e` | ⚠️ If ASR_PROVIDER=deepgram |
| `PORT` | (Auto-set by Render, or `3001` for local) | ⚠️ Optional |
| `BUFFER_WINDOW_MS` | `300` | ⚠️ Optional |
| `REDIS_CONSUMER_GROUP` | `asr-worker` | ⚠️ Optional |
| `REDIS_CONSUMER_NAME` | `asr-worker-1` | ⚠️ Optional |

---

## 📊 Expected Logs After Deployment

### Startup Logs
```
[ASRWorker] Initialized { provider: 'deepgram', bufferWindowMs: 300, port: 10000 }
[ASRWorker] Using ASR provider: deepgram
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', topic: 'audio_stream', useStreams: true }
[ASRWorker] Subscribing to audio topic: audio_stream
[ASRWorker] Server listening on port 10000
[ASRWorker] Metrics: http://localhost:10000/metrics
[ASRWorker] Health: http://localhost:10000/health
```

### Runtime Logs (When Audio is Received)
```
[ASRWorker] Published partial transcript { interaction_id: '...', text: '...', seq: 1 }
[ASRWorker] Published final transcript { interaction_id: '...', text: '...', seq: 2 }
```

---

## ✅ Verification Steps

### 1. Check Service Status
- Go to Render Dashboard
- Find `rtaa-asr-worker` service
- Status should be: **Live** ✅

### 2. Check Health Endpoint
```bash
curl https://<your-asr-worker-url>.onrender.com/health
```
Expected response:
```json
{"status":"ok","service":"asr-worker"}
```

### 3. Check Logs
- Click on ASR worker service → **Logs** tab
- Look for:
  - ✅ `Subscribing to audio topic: audio_stream`
  - ✅ `Server listening on port ...`
  - ✅ `Connected to Redis: ...`

### 4. Test End-to-End
1. Make a call from Exotel
2. Check ingestion service logs (should see audio published)
3. Check ASR worker logs (should see transcripts generated)

---

## 🐛 Troubleshooting

### Issue: Build Fails

**Error:** `Cannot find module '@rtaa/pubsub'`

**Solution:** Ensure build command runs from repo root:
```
cd ../.. && npm ci && cd services/asr-worker && npm run build
```

### Issue: Service Won't Start

**Error:** `Cannot find module 'dist/index.js'`

**Solution:** Check `tsconfig.json` has correct `outDir: "./dist"`

### Issue: Not Consuming Audio

**Check:**
- Redis connection successful?
- Subscribed to `audio_stream` topic?
- Consumer group created?

**Look for in logs:**
- `Connected to Redis: ...`
- `Subscribing to audio topic: audio_stream`
- `Consumer group created: asr-worker`

### Issue: No Transcripts Generated

**Check:**
- ASR provider configured correctly?
- For Deepgram: API key valid?
- Audio frames being received?

**Look for in logs:**
- `ASR provider initialized: <provider>`
- `Published transcript` messages

---

## 📝 Quick Reference

### Service URL Format
```
https://<service-name>.onrender.com
```

### Health Check
```
GET /health
```

### Metrics Endpoint
```
GET /metrics
```

---

## 🎯 Success Criteria

- ✅ ASR worker service deployed and running
- ✅ Connected to Redis
- ✅ Subscribed to `audio_stream` topic
- ✅ Health endpoint returns `200 OK`
- ✅ Logs show subscription successful
- ✅ Receiving audio frames (when call is active)
- ✅ Publishing transcripts (when processing)

---

**Next:** Once ASR worker is verified, check if transcripts are being generated and published to transcript topics!


## Quick Checklist

### ✅ Prerequisites
- [x] ASR worker code exists (`services/asr-worker/`)
- [x] Build configuration ready (`package.json`, `tsconfig.json`)
- [x] Environment variables identified

### ⏭️ Next Steps
1. **Check if ASR worker is already deployed on Render**
2. **If not, deploy it using the configuration below**

---

## 📋 Render Service Configuration

### Service Type
**Web Service** (not Static Site)

### Basic Settings

| Field | Value |
|-------|-------|
| **Name** | `rtaa-asr-worker` |
| **Root Directory** | `services/asr-worker` |
| **Environment** | `Node` |
| **Region** | (Choose closest to your Redis) |
| **Branch** | `main` |

### Build & Start Commands

| Field | Value |
|-------|-------|
| **Build Command** | `cd ../.. && npm ci && cd services/asr-worker && npm run build` |
| **Start Command** | `npm run start` |

### Health Check

| Field | Value |
|-------|-------|
| **Health Check Path** | `/health` |

---

## 🔐 Environment Variables

Add these in Render Dashboard → ASR Worker Service → Environment:

| Variable | Value | Required |
|----------|-------|----------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` | ✅ Yes |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes |
| `ASR_PROVIDER` | `deepgram` (or `mock` for testing) | ✅ Yes |
| `DEEPGRAM_API_KEY` | `d65326fff430ad13ad6ad78acfe305a8d8c8245e` | ⚠️ If ASR_PROVIDER=deepgram |
| `PORT` | (Auto-set by Render, or `3001` for local) | ⚠️ Optional |
| `BUFFER_WINDOW_MS` | `300` | ⚠️ Optional |
| `REDIS_CONSUMER_GROUP` | `asr-worker` | ⚠️ Optional |
| `REDIS_CONSUMER_NAME` | `asr-worker-1` | ⚠️ Optional |

---

## 📊 Expected Logs After Deployment

### Startup Logs
```
[ASRWorker] Initialized { provider: 'deepgram', bufferWindowMs: 300, port: 10000 }
[ASRWorker] Using ASR provider: deepgram
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', topic: 'audio_stream', useStreams: true }
[ASRWorker] Subscribing to audio topic: audio_stream
[ASRWorker] Server listening on port 10000
[ASRWorker] Metrics: http://localhost:10000/metrics
[ASRWorker] Health: http://localhost:10000/health
```

### Runtime Logs (When Audio is Received)
```
[ASRWorker] Published partial transcript { interaction_id: '...', text: '...', seq: 1 }
[ASRWorker] Published final transcript { interaction_id: '...', text: '...', seq: 2 }
```

---

## ✅ Verification Steps

### 1. Check Service Status
- Go to Render Dashboard
- Find `rtaa-asr-worker` service
- Status should be: **Live** ✅

### 2. Check Health Endpoint
```bash
curl https://<your-asr-worker-url>.onrender.com/health
```
Expected response:
```json
{"status":"ok","service":"asr-worker"}
```

### 3. Check Logs
- Click on ASR worker service → **Logs** tab
- Look for:
  - ✅ `Subscribing to audio topic: audio_stream`
  - ✅ `Server listening on port ...`
  - ✅ `Connected to Redis: ...`

### 4. Test End-to-End
1. Make a call from Exotel
2. Check ingestion service logs (should see audio published)
3. Check ASR worker logs (should see transcripts generated)

---

## 🐛 Troubleshooting

### Issue: Build Fails

**Error:** `Cannot find module '@rtaa/pubsub'`

**Solution:** Ensure build command runs from repo root:
```
cd ../.. && npm ci && cd services/asr-worker && npm run build
```

### Issue: Service Won't Start

**Error:** `Cannot find module 'dist/index.js'`

**Solution:** Check `tsconfig.json` has correct `outDir: "./dist"`

### Issue: Not Consuming Audio

**Check:**
- Redis connection successful?
- Subscribed to `audio_stream` topic?
- Consumer group created?

**Look for in logs:**
- `Connected to Redis: ...`
- `Subscribing to audio topic: audio_stream`
- `Consumer group created: asr-worker`

### Issue: No Transcripts Generated

**Check:**
- ASR provider configured correctly?
- For Deepgram: API key valid?
- Audio frames being received?

**Look for in logs:**
- `ASR provider initialized: <provider>`
- `Published transcript` messages

---

## 📝 Quick Reference

### Service URL Format
```
https://<service-name>.onrender.com
```

### Health Check
```
GET /health
```

### Metrics Endpoint
```
GET /metrics
```

---

## 🎯 Success Criteria

- ✅ ASR worker service deployed and running
- ✅ Connected to Redis
- ✅ Subscribed to `audio_stream` topic
- ✅ Health endpoint returns `200 OK`
- ✅ Logs show subscription successful
- ✅ Receiving audio frames (when call is active)
- ✅ Publishing transcripts (when processing)

---

**Next:** Once ASR worker is verified, check if transcripts are being generated and published to transcript topics!


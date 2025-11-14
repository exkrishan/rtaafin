# 🚀 ASR Worker Deployment on Render (ElevenLabs)

## Quick Deployment Guide

This guide will help you deploy the ASR worker on Render with ElevenLabs as the ASR provider.

---

## 📋 Step 1: Create New Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository: `exkrishan/rtaa-fin`
4. Select the repository

---

## ⚙️ Step 2: Configure Service Settings

### Basic Settings

| Field | Value |
|-------|-------|
| **Name** | `rtaa-asr-worker` |
| **Service Type** | `Web Service` |
| **Language** | `Node` |
| **Branch** | `main` (or your feature branch) |
| **Region** | Choose closest to your Redis (e.g., `Singapore (Southeast Asia)`) |
| **Instance Type** | `Free` (for testing) or `Starter` ($7/month) for production |

### Build Configuration

| Field | Value |
|-------|-------|
| **Root Directory** | `services/asr-worker` ⚠️ **CRITICAL** |
| **Build Command** | `cd ../.. && npm ci && cd services/asr-worker && npm run build` |
| **Start Command** | `npm run start` |

### Health Check (Advanced Settings)

| Field | Value |
|-------|-------|
| **Health Check Path** | `/health` |

---

## 🔐 Step 3: Add Environment Variables

Click **"Environment"** tab and add these variables:

### Required Variables

| Variable Name | Value | Notes |
|---------------|-------|-------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` | Same Redis as Ingest Service |
| `PUBSUB_ADAPTER` | `redis_streams` | Required |
| `ASR_PROVIDER` | `elevenlabs` | **ElevenLabs provider** |
| `ELEVENLABS_API_KEY` | `sk_d687c22a3dbf04db3097f3791abcd39abba69058fe835e8b` | Your ElevenLabs API key |

### Optional Variables

| Variable Name | Value | Default |
|---------------|-------|---------|
| `PORT` | (Leave empty - Render auto-assigns) | Auto |
| `BUFFER_WINDOW_MS` | `300` | 300 |
| `REDIS_CONSUMER_GROUP` | `asr-worker` | asr-worker |
| `REDIS_CONSUMER_NAME` | `asr-worker-1` | asr-worker-1 |
| `ELEVENLABS_PREFERRED_SAMPLE_RATE` | `16000` | 16000 (optimal) |
| `EXO_BRIDGE_ENABLED` | (Not required for ElevenLabs) | Only needed for Deepgram |

---

## 🚀 Step 4: Deploy

1. Review all settings
2. Click **"Create Web Service"**
3. Wait for build to complete (usually 2-5 minutes)

---

## ✅ Step 5: Verify Deployment

### Check Build Logs

Look for:
```
✅ Compiled lib/pubsub
✅ Build successful: dist/index.js exists
```

### Check Runtime Logs

After deployment, look for:
```
[ASRWorker] Initialized { provider: 'elevenlabs', bufferWindowMs: 300, port: 10000 }
[ASRWorker] Using ASR provider: elevenlabs
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', topic: 'audio_stream', useStreams: true }
[ASRWorker] 🔔 Subscribing to audio topic: audio_stream
[ASRWorker] ✅ Successfully subscribed to audio topic: audio_stream
```

### Test Health Endpoint

```bash
curl https://rtaa-asr-worker.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "asr-worker",
  "provider": "elevenlabs",
  "activeBuffers": 0,
  "subscriptions": 2,
  "exoBridgeEnabled": true
}
```

### Test Metrics Endpoint

```bash
curl https://rtaa-asr-worker.onrender.com/metrics
```

Should return Prometheus metrics.

---

## 🔍 Step 6: Verify Redis Connection

Check logs for:
- ✅ `Pub/Sub adapter initialized`
- ✅ `Successfully subscribed to audio topic: audio_stream`

If you see errors about Redis connection:
1. Verify `REDIS_URL` is correct
2. Check Redis is accessible from Render's network
3. Verify Redis credentials are correct

---

## 🎯 Step 7: Test with Real Call

Once deployed, you can:

1. **Test with Exotel:**
   - Configure Exotel to use Render Ingest Service
   - Make a test call
   - Check ASR Worker logs for transcript generation

2. **Test with Simulation:**
   ```bash
   REDIS_URL="..." ELEVENLABS_API_KEY="..." \
   npx tsx scripts/test-exotel-e2e.ts
   ```

---

## 📊 Monitoring

### Health Check
```
GET https://rtaa-asr-worker.onrender.com/health
```

### Metrics
```
GET https://rtaa-asr-worker.onrender.com/metrics
```

### Logs
- View in Render Dashboard → Service → Logs
- Look for:
  - `[ASRWorker] 📨 Message received from Redis`
  - `[ElevenLabsProvider] ✅ Connection opened`
  - `[ASRWorker] Published transcript`

---

## 🐛 Troubleshooting

### Build Fails

**Error:** `Service Root Directory "/opt/render/project/src/services/asr-worker" is missing.`

**Fix:** Ensure Root Directory is set to: `services/asr-worker`

**Error:** `Cannot find module '@rtaa/pubsub'`

**Fix:** Ensure Build Command is: `cd ../.. && npm ci && cd services/asr-worker && npm run build`

### Service Won't Start

**Error:** `REDIS_URL is required`

**Fix:** Add `REDIS_URL` environment variable

**Error:** `ELEVENLABS_API_KEY is required when ASR_PROVIDER=elevenlabs`

**Fix:** Add `ELEVENLABS_API_KEY` environment variable

### No Transcripts

1. **Check ASR Worker is receiving audio:**
   - Look for: `[ASRWorker] 📨 Message received from Redis`
   - If missing, check Redis connection

2. **Check ElevenLabs connection:**
   - Look for: `[ElevenLabsProvider] ✅ Connection opened`
   - If missing, check API key and account subscription

3. **Check transcripts are published:**
   - Look for: `[ASRWorker] Published transcript`
   - If missing, check ElevenLabs is returning transcripts

---

## 📝 Quick Reference

### Service URL
```
https://rtaa-asr-worker.onrender.com
```

### Health Endpoint
```
GET /health
```

### Metrics Endpoint
```
GET /metrics
```

### Environment Variables Summary
```
REDIS_URL=redis://...
PUBSUB_ADAPTER=redis_streams
ASR_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=sk_...
```

---

## ✅ Success Criteria

- ✅ Service builds successfully
- ✅ Health endpoint returns `200 OK`
- ✅ Logs show successful Redis connection
- ✅ Logs show subscription to `audio_stream`
- ✅ Service is ready to process audio

---

## 🎉 Next Steps

Once deployed:

1. **Update E2E test** to use Render ASR Worker URL
2. **Test with Exotel** real calls
3. **Monitor logs** for transcript generation
4. **Verify end-to-end flow** works

---

## 📚 Related Documentation

- `EXOTEL_E2E_TEST_GUIDE.md` - End-to-end testing guide
- `services/asr-worker/docs/ELEVENLABS_SETUP.md` - ElevenLabs setup details
- `RENDER_ASR_WORKER_DEPLOYMENT.md` - General deployment guide (Deepgram)




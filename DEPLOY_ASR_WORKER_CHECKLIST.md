# ✅ ASR Worker Deployment Checklist (ElevenLabs)

Follow this checklist step-by-step to deploy the ASR worker on Render.

---

## 📋 Pre-Deployment Checklist

- [ ] GitHub repository is connected to Render
- [ ] You have access to Render dashboard
- [ ] ElevenLabs API key is ready: `sk_d687c22a3dbf04db3097f3791abcd39abba69058fe835e8b`
- [ ] Redis URL is ready: `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304`

---

## 🚀 Deployment Steps

### Step 1: Create New Web Service

- [ ] Go to [Render Dashboard](https://dashboard.render.com)
- [ ] Click **"New +"** → **"Web Service"**
- [ ] Select repository: `exkrishan/rtaa-fin`
- [ ] Click **"Connect"**

### Step 2: Configure Basic Settings

Fill in these fields:

- [ ] **Name:** `rtaa-asr-worker`
- [ ] **Region:** Choose closest to Redis (e.g., `Singapore (Southeast Asia)`)
- [ ] **Branch:** `main` (or your feature branch)
- [ ] **Instance Type:** `Free` (for testing) or `Starter` (for production)

### Step 3: Configure Build Settings

**⚠️ CRITICAL: These settings must be exact**

- [ ] **Root Directory:** `services/asr-worker`
- [ ] **Build Command:** `cd ../.. && npm ci && cd services/asr-worker && npm run build`
- [ ] **Start Command:** `npm run start`

### Step 4: Configure Health Check

- [ ] Scroll to **"Advanced"** section
- [ ] **Health Check Path:** `/health`

### Step 5: Add Environment Variables

Click **"Environment"** tab and add:

**Required Variables:**

- [ ] `REDIS_URL` = `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304`
- [ ] `PUBSUB_ADAPTER` = `redis_streams`
- [ ] `ASR_PROVIDER` = `elevenlabs`
- [ ] `ELEVENLABS_API_KEY` = `sk_d687c22a3dbf04db3097f3791abcd39abba69058fe835e8b`

**Optional Variables (recommended):**

- [ ] `EXO_BRIDGE_ENABLED` = `true`
- [ ] `BUFFER_WINDOW_MS` = `300`
- [ ] `REDIS_CONSUMER_GROUP` = `asr-worker`
- [ ] `REDIS_CONSUMER_NAME` = `asr-worker-1`

### Step 6: Deploy

- [ ] Review all settings
- [ ] Click **"Create Web Service"**
- [ ] Wait for build to start (usually starts immediately)

---

## ✅ Post-Deployment Verification

### Build Verification

- [ ] Build completes successfully (check logs)
- [ ] Look for: `✅ Build successful: dist/index.js exists`
- [ ] No build errors

### Runtime Verification

Check logs for:

- [ ] `[ASRWorker] Initialized { provider: 'elevenlabs', ... }`
- [ ] `[ASRWorker] Using ASR provider: elevenlabs`
- [ ] `[pubsub] ✅ Pub/Sub adapter initialized`
- [ ] `[ASRWorker] ✅ Successfully subscribed to audio topic: audio_stream`

### Health Check

- [ ] Run: `curl https://rtaa-asr-worker.onrender.com/health`
- [ ] Response includes: `"provider": "elevenlabs"`
- [ ] Response includes: `"status": "ok"`

### Service URL

- [ ] Note the service URL: `https://rtaa-asr-worker.onrender.com`
- [ ] Save this URL for testing

---

## 🧪 Test After Deployment

### Quick Test

```bash
# Test health endpoint
curl https://rtaa-asr-worker.onrender.com/health

# Test metrics endpoint
curl https://rtaa-asr-worker.onrender.com/metrics
```

### Full E2E Test

Once deployed, update the E2E test to use the Render ASR Worker:

```bash
REDIS_URL="..." \
ELEVENLABS_API_KEY="..." \
ASR_WORKER_URL="https://rtaa-asr-worker.onrender.com" \
npx tsx scripts/test-exotel-e2e.ts
```

---

## 🐛 Common Issues & Fixes

### Issue: Build Fails - "Root Directory missing"

**Fix:** Ensure Root Directory is exactly: `services/asr-worker`

### Issue: Build Fails - "Cannot find module '@rtaa/pubsub'"

**Fix:** Ensure Build Command is exactly: `cd ../.. && npm ci && cd services/asr-worker && npm run build`

### Issue: Service Won't Start - "REDIS_URL is required"

**Fix:** Add `REDIS_URL` environment variable

### Issue: Service Won't Start - "ELEVENLABS_API_KEY is required"

**Fix:** Add `ELEVENLABS_API_KEY` environment variable

### Issue: No Logs Showing Subscription

**Fix:** 
1. Check Redis URL is correct
2. Verify Redis is accessible
3. Check logs for connection errors

---

## 📝 Notes

- **Service URL Format:** `https://<service-name>.onrender.com`
- **Health Endpoint:** `/health`
- **Metrics Endpoint:** `/metrics`
- **Logs:** Available in Render Dashboard → Service → Logs

---

## 🎯 Next Steps After Deployment

1. ✅ Verify service is healthy
2. ✅ Test with E2E test script
3. ✅ Configure Exotel to use Render Ingest Service
4. ✅ Make a test call from Exotel
5. ✅ Verify transcripts are generated

---

## 📚 Reference

- Full deployment guide: `RENDER_ASR_WORKER_ELEVENLABS_DEPLOYMENT.md`
- E2E testing: `EXOTEL_E2E_TEST_GUIDE.md`
- ElevenLabs setup: `services/asr-worker/docs/ELEVENLABS_SETUP.md`




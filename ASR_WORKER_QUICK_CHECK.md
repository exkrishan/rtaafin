# ⚡ ASR Worker Quick Check

## 🎯 Goal
Verify if ASR worker is running and consuming audio from Redis Streams.

---

## Step 1: Check Render Dashboard

1. **Go to:** https://dashboard.render.com
2. **Look for service:** `asr-worker` or `rtaa-asr-worker`
3. **Check status:**
   - ✅ **Live** = Running (good!)
   - ⚠️ **Building** = Currently deploying
   - ❌ **Not Found** = Needs deployment

---

## Step 2: If Service Exists - Check Logs

1. Click on ASR worker service
2. Go to **"Logs"** tab
3. Look for these messages:

### ✅ Success Indicators:
```
[ASRWorker] Initialized { provider: 'deepgram', ... }
[ASRWorker] Subscribing to audio topic: audio_stream
[ASRWorker] Server listening on port ...
[RedisStreamsAdapter] Connected to Redis: ...
```

### ⚠️ If you see errors:
- `Cannot find module '@rtaa/pubsub'` → Build issue
- `Connection failed` → Redis connection issue
- `Consumer group error` → Redis Streams issue

---

## Step 3: Test Health Endpoint

If service is deployed, test health:

```bash
curl https://<your-asr-worker-url>.onrender.com/health
```

**Expected:** `{"status":"ok","service":"asr-worker"}`

---

## Step 4: If Service Does NOT Exist

### Deploy ASR Worker on Render

1. **Create New Web Service**
2. **Configure:**
   - **Name:** `rtaa-asr-worker`
   - **Root Directory:** `services/asr-worker`
   - **Build Command:** `cd ../.. && npm ci && cd services/asr-worker && npm run build`
   - **Start Command:** `npm run start`
   - **Health Check Path:** `/health`

3. **Add Environment Variables:**
   ```
   REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
   PUBSUB_ADAPTER=redis_streams
   ASR_PROVIDER=deepgram
   DEEPGRAM_API_KEY=d65326fff430ad13ad6ad78acfe305a8d8c8245e
   ```

4. **Deploy and wait for build to complete**

---

## Step 5: Verify End-to-End Flow

1. **Make a call from Exotel**
2. **Check Ingestion Service logs:**
   - Should see: `Published binary audio frame`
3. **Check ASR Worker logs:**
   - Should see: `Published transcript`

If both show up, the complete flow is working! 🎉

---

## 🐛 Common Issues

### Issue: ASR Worker Not Receiving Audio

**Check:**
- Is Redis connection successful?
- Is it subscribed to `audio_stream`?
- Are audio frames being published to Redis?

**Debug:**
```bash
# Check Redis Streams (if you have redis-cli access)
XINFO STREAM audio_stream
XINFO GROUPS audio_stream
```

### Issue: No Transcripts Generated

**Check:**
- ASR provider configured correctly?
- Deepgram API key valid?
- Audio frames being received?

**Look for in logs:**
- `Received audio frame`
- `Published transcript`

---

## ✅ Success Checklist

- [ ] ASR worker service exists on Render
- [ ] Service status is "Live"
- [ ] Health endpoint returns `200 OK`
- [ ] Logs show "Subscribed to audio topic: audio_stream"
- [ ] Logs show "Connected to Redis"
- [ ] When call is active, logs show "Published transcript"

---

**Next:** Once ASR worker is verified, we'll check if transcripts are being generated and published!


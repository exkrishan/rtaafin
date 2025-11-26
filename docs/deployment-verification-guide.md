# 🔍 Deployment Verification Guide - Exotel → Deepgram Bridge

This guide helps you verify that your `ingest` and `asr-worker` services are deployed correctly on Render with the Exotel bridge feature enabled.

## 📋 Prerequisites

1. Both services deployed on Render
2. Services configured with `feat/exotel-deepgram-bridge` branch
3. Environment variables configured (see deployment guide)

## 🔗 Finding Your Service URLs

### Step 1: Get Service URLs from Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your services:
   - **Ingest Service** (e.g., `rtaa-ingest`)
   - **ASR Worker Service** (e.g., `rtaa-asr-worker`)
3. Copy the service URLs (e.g., `https://rtaa-ingest.onrender.com`)

### Step 2: Update URLs in Verification Script

Edit the script or pass URLs as arguments:

```bash
# Option 1: Pass URLs as arguments
tsx scripts/verify-deployment.ts https://your-ingest-service.onrender.com https://your-asr-worker.onrender.com

# Option 2: Set environment variables
INGEST_URL=https://your-ingest-service.onrender.com \
ASR_WORKER_URL=https://your-asr-worker.onrender.com \
tsx scripts/verify-deployment.ts
```

## ✅ Verification Steps

### 1. Health Endpoint Checks

#### Ingest Service
```bash
curl https://your-ingest-service.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "ingest",
  "exotelBridge": "enabled",
  "exotelMetrics": {
    "framesIn": 0,
    "bytesIn": 0,
    "bufferDrops": 0,
    "publishFailures": 0,
    "bufferDepth": 0,
    "activeBuffers": 0
  }
}
```

**Key Checks:**
- ✅ `status: "ok"`
- ✅ `exotelBridge: "enabled"`

#### ASR Worker Service
```bash
curl https://your-asr-worker.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "asr-worker",
  "asrProvider": "deepgram",
  "deepgramMetrics": {
    "connectionsActive": 0,
    "totalAudioChunksSent": 0,
    "totalTranscriptsReceived": 0
  }
}
```

**Key Checks:**
- ✅ `status: "ok"`
- ✅ `asrProvider: "deepgram"`

### 2. Log Verification

Check Render service logs for these messages:

#### Ingest Service Logs
Look for:
```
[exotel] Exotel→Deepgram bridge: ENABLED
[server] Configuration: { exoBridgeEnabled: true, ... }
```

#### ASR Worker Service Logs
Look for:
```
[ASRWorker] Using ASR provider: deepgram
[ASRWorker] Exotel→Deepgram bridge: ENABLED
```

### 3. WebSocket Connection Test

#### Using wscat (if installed)
```bash
wscat -c wss://your-ingest-service.onrender.com/v1/ingest
```

**Expected:**
- Connection should establish (no immediate error)
- For Exotel bridge, JWT is not required

#### Using curl (test connection)
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://your-ingest-service.onrender.com/v1/ingest
```

**Expected:**
- HTTP 101 Switching Protocols (success)
- Or HTTP 400/401 if authentication required (but Exotel bridge should accept without JWT)

## 🚀 Automated Verification

### Run the Verification Script

```bash
# Using default URLs (rtaa-ingest, rtaa-asr-worker)
tsx scripts/verify-deployment.ts

# Using custom URLs
tsx scripts/verify-deployment.ts \
  https://your-ingest-service.onrender.com \
  https://your-asr-worker.onrender.com
```

**Script Output:**
```
🔍 Verifying Deployment Status

Ingest Service: https://your-ingest-service.onrender.com
ASR Worker Service: https://your-asr-worker.onrender.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 Test 1: Ingest Service Health Check
────────────────────────────────────────────────────────────────────────
✅ Ingest service is healthy
   Status: ok
   Service: ingest
   ✅ Exotel Bridge: ENABLED
   📊 Exotel Metrics: { ... }

🎤 Test 2: ASR Worker Service Health Check
────────────────────────────────────────────────────────────────────────
✅ ASR Worker service is healthy
   Status: ok
   Service: asr-worker
   ✅ ASR Provider: DEEPGRAM
   📊 Deepgram Metrics: { ... }

🔌 Test 3: WebSocket Connection Test
────────────────────────────────────────────────────────────────────────
   WebSocket URL: wss://your-ingest-service.onrender.com/v1/ingest
   ⚠️  Manual test required: Use wscat or WebSocket client
   Command: wscat -c wss://your-ingest-service.onrender.com/v1/ingest

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ingest Service:     ✅ Healthy
ASR Worker Service: ✅ Healthy
Exotel Bridge:       ✅ Enabled
Deepgram Provider:   ✅ Enabled

✅ All checks passed! Deployment is ready.
```

## ⚠️ Troubleshooting

### Issue: Health endpoint returns 404

**Possible Causes:**
- Service not deployed
- Wrong URL
- Health check path not configured

**Solution:**
1. Check Render dashboard for service status
2. Verify service URL is correct
3. Check health check path is set to `/health` in Render settings

### Issue: Exotel Bridge shows "disabled"

**Possible Causes:**
- `EXO_BRIDGE_ENABLED` not set to `true`
- Environment variable not saved
- Service not restarted after env var change

**Solution:**
1. Go to Render Dashboard → Service → Environment
2. Verify `EXO_BRIDGE_ENABLED=true` is set
3. Save and redeploy service

### Issue: ASR Provider not "deepgram"

**Possible Causes:**
- `ASR_PROVIDER` not set to `deepgram`
- `DEEPGRAM_API_KEY` not set
- Service not restarted

**Solution:**
1. Check `ASR_PROVIDER=deepgram` in environment variables
2. Verify `DEEPGRAM_API_KEY` is set
3. Redeploy service

### Issue: WebSocket connection fails

**Possible Causes:**
- Service not running
- Wrong WebSocket URL
- Network/firewall issues

**Solution:**
1. Verify service is running in Render dashboard
2. Check WebSocket URL format: `wss://<service-url>/v1/ingest`
3. Test with `wscat` or browser WebSocket client

## 📝 Checklist

Before considering deployment complete:

- [ ] Ingest service health endpoint returns `200 OK`
- [ ] Ingest service shows `exotelBridge: "enabled"` in health response
- [ ] ASR Worker service health endpoint returns `200 OK`
- [ ] ASR Worker service shows `asrProvider: "deepgram"` in health response
- [ ] Ingest service logs show `[exotel] Exotel→Deepgram bridge: ENABLED`
- [ ] ASR Worker logs show `[ASRWorker] Using ASR provider: deepgram`
- [ ] WebSocket connection to `/v1/ingest` can be established
- [ ] Both services use the same `REDIS_URL`
- [ ] Both services use `PUBSUB_ADAPTER=redis_streams`

## 🎯 Next Steps

After verification:

1. ✅ Configure Exotel Stream Applet to point to your ingest service
2. ✅ Test end-to-end flow: Exotel → Ingest → ASR Worker → Transcripts
3. ✅ Monitor logs for audio frames and transcripts
4. ✅ Check metrics in health endpoints

---

**Last Updated:** 2025-01-09






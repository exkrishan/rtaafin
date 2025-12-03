# 🔍 Deployment Diagnostic Report

**Date:** 2025-01-09  
**Services Checked:**
- Ingest Service: `https://rtaa-ingest-service.onrender.com`
- ASR Worker Service: `https://rtaa-asr-service.onrender.com`

## ❌ Current Status

### Ingest Service
- **Status:** ❌ 503 Service Unavailable
- **Health Endpoint:** `https://rtaa-ingest-service.onrender.com/health`
- **Response Time:** ~0.22s

### ASR Worker Service
- **Status:** ❌ 503 Service Unavailable
- **Health Endpoint:** `https://rtaa-asr-service.onrender.com/health`
- **Response Time:** ~0.30s

## 🔍 What 503 Service Unavailable Means

A **503 Service Unavailable** error typically indicates:

1. **Service is still starting up** (most common)
   - Render services can take 1-3 minutes to start
   - First deployment may take longer

2. **Service crashed during startup**
   - Check Render logs for startup errors
   - Common causes: missing env vars, build failures, runtime errors

3. **Health check is failing**
   - Health check path not configured correctly
   - Service not responding on health endpoint

4. **Service is in a failed state**
   - Previous deployment failed
   - Service needs manual restart

## ✅ Action Items - Check Render Dashboard

### Step 1: Check Service Status

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your services:
   - `rtaa-ingest-service`
   - `rtaa-asr-service`
3. Check the status indicator:
   - 🟢 **Green** = Running (may still be starting)
   - 🟡 **Yellow** = Starting/Deploying
   - 🔴 **Red** = Failed/Crashed

### Step 2: Check Service Logs

For each service, check the **Logs** tab:

#### Ingest Service - Look for:
```
✅ Good signs:
- [server] Server listening on port...
- [exotel] Exotel→Deepgram bridge: ENABLED
- [server] Configuration: { exoBridgeEnabled: true, ... }

❌ Error signs:
- Error: Cannot find module...
- Error: JWT_PUBLIC_KEY not configured
- Error: REDIS_URL is required
- FATAL ERROR: ...
```

#### ASR Worker Service - Look for:
```
✅ Good signs:
- [ASRWorker] Using ASR provider: deepgram
- [ASRWorker] Exotel→Deepgram bridge: ENABLED
- [ASRWorker] Service started successfully

❌ Error signs:
- Error: DEEPGRAM_API_KEY is required
- Error: REDIS_URL is required
- Error: Cannot connect to Redis
- FATAL ERROR: ...
```

### Step 3: Verify Environment Variables

Check that these are set in Render Dashboard → Environment:

#### Ingest Service Required:
- [ ] `EXO_BRIDGE_ENABLED=true`
- [ ] `REDIS_URL=<your-redis-url>`
- [ ] `PUBSUB_ADAPTER=redis_streams`
- [ ] `JWT_PUBLIC_KEY=<your-jwt-key>` (or `SUPPORT_EXOTEL=true`)

#### ASR Worker Service Required:
- [ ] `EXO_BRIDGE_ENABLED=true`
- [ ] `ASR_PROVIDER=deepgram`
- [ ] `DEEPGRAM_API_KEY=<your-deepgram-key>`
- [ ] `REDIS_URL=<your-redis-url>` (same as ingest)
- [ ] `PUBSUB_ADAPTER=redis_streams` (same as ingest)

### Step 4: Check Build Status

1. Go to **Events** tab in Render dashboard
2. Check if build completed successfully
3. Look for build errors:
   - TypeScript compilation errors
   - Missing dependencies
   - Build timeout

### Step 5: Verify Branch Configuration

1. Go to **Settings** → **Build & Deploy**
2. Verify **Branch** is set to: `feat/exotel-deepgram-bridge`
3. If not, update and redeploy

## 🔧 Common Fixes

### Fix 1: Service Still Starting
**Wait 2-3 minutes** after deployment, then check again.

### Fix 2: Missing Environment Variables
1. Go to Render Dashboard → Service → Environment
2. Add missing variables
3. Click **Save Changes**
4. Service will auto-redeploy

### Fix 3: Health Check Path Not Set
1. Go to **Settings** → **Health Check Path**
2. Set to:
   - Ingest: `/health`
   - ASR Worker: `/health`
3. Save and redeploy

### Fix 4: Service Crashed
1. Check logs for error messages
2. Fix the issue (missing env var, code error, etc.)
3. Click **Manual Deploy** → **Deploy latest commit**

### Fix 5: Build Failed
1. Check **Events** tab for build errors
2. Fix code issues
3. Push to branch
4. Render will auto-redeploy

## 📋 Verification Checklist

After fixing issues, verify:

- [ ] Service status is **Green** (Running) in Render dashboard
- [ ] Logs show successful startup messages
- [ ] Health endpoint returns `200 OK`:
  ```bash
  curl https://rtaa-ingest-service.onrender.com/health
  curl https://rtaa-asr-service.onrender.com/health
  ```
- [ ] Health response shows:
  - Ingest: `"exotelBridge": "enabled"`
  - ASR Worker: `"asrProvider": "deepgram"`
- [ ] WebSocket connection works:
  ```bash
  wscat -c wss://rtaa-ingest-service.onrender.com/v1/ingest
  ```

## 🚀 Next Steps

1. **Check Render Dashboard** for service status and logs
2. **Fix any errors** found in logs
3. **Wait 2-3 minutes** if services are still starting
4. **Re-run verification** once services are healthy:
   ```bash
   npx tsx scripts/verify-deployment.ts \
     https://rtaa-ingest-service.onrender.com \
     https://rtaa-asr-service.onrender.com
   ```

## 📞 Need Help?

If services are still failing after checking the above:

1. **Share Render logs** (copy from Logs tab)
2. **Share environment variable names** (not values) to verify they're set
3. **Check service status** in Render dashboard (Green/Yellow/Red)

---

**Last Updated:** 2025-01-09






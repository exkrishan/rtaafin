# 🚀 Deployment Instructions - Real-Time Agent Assist Features

## ✅ Changes Pushed

**Branch:** `feat/exotel-deepgram-bridge`  
**Commit:** `40e2e85`  
**Status:** ✅ Pushed to remote

---

## 📦 Services to Deploy

### 1. **Frontend Service** (Next.js)
**URL:** `https://frontend-8jdd.onrender.com`

**Changes:**
- ✅ New API routes: `/api/calls/end`, `/api/calls/active`, `/api/calls/[interactionId]/transcript`, `/api/calls/[interactionId]/disposition`
- ✅ New service: `lib/call-registry.ts`
- ✅ Enhanced components: `AgentAssistPanelV2.tsx`, `AutoDispositionModal.tsx`
- ✅ Auto-discovery: `app/test-agent-assist/page.tsx`
- ✅ Enhanced logging in `lib/transcript-consumer.ts` and `app/api/calls/ingest-transcript/route.ts`

**Deployment:**
- If auto-deploy is enabled, Render will automatically deploy
- Otherwise, manually trigger deployment from Render dashboard

**Verify After Deployment:**
```bash
# Health check
curl https://frontend-8jdd.onrender.com/api/health

# Test new endpoints
curl https://frontend-8jdd.onrender.com/api/calls/active
```

---

### 2. **ASR Worker Service**
**URL:** `https://rtaa-asr-worker.onrender.com`

**Changes:**
- ✅ Empty transcript filtering in `services/asr-worker/src/index.ts`
- ✅ Prevents publishing empty transcripts to reduce noise

**Deployment:**
- If auto-deploy is enabled, Render will automatically deploy
- Otherwise, manually trigger deployment from Render dashboard

**Verify After Deployment:**
```bash
# Health check
curl https://rtaa-asr-worker.onrender.com/health

# Check logs for empty transcript filtering
# Should see: "[ASRWorker] ⏭️ Skipping empty transcript (not publishing)"
```

---

### 3. **Ingest Service**
**URL:** `https://rtaa-ingest.onrender.com`

**Changes:**
- ✅ Call registration in `services/ingest/src/exotel-handler.ts`
- ✅ Registers calls in call registry on start event
- ✅ Marks calls as ended on stop event

**Deployment:**
- If auto-deploy is enabled, Render will automatically deploy
- Otherwise, manually trigger deployment from Render dashboard

**Verify After Deployment:**
```bash
# Health check
curl https://rtaa-ingest.onrender.com/health

# Check logs for call registration
# Should see: "[exotel] ✅ Call registered in call registry"
```

---

## 🔄 Manual Deployment Steps (if auto-deploy is disabled)

### For Each Service:

1. **Go to Render Dashboard**
   - Navigate to [Render Dashboard](https://dashboard.render.com)
   - Find the service (Frontend, ASR Worker, or Ingest)

2. **Trigger Manual Deploy**
   - Click on the service
   - Go to **"Manual Deploy"** tab
   - Select branch: `feat/exotel-deepgram-bridge`
   - Click **"Deploy latest commit"**

3. **Monitor Deployment**
   - Watch build logs for any errors
   - Verify build completes successfully
   - Check service health after deployment

---

## ✅ Post-Deployment Verification

### 1. Frontend Service
```bash
# Health check
curl https://frontend-8jdd.onrender.com/api/health

# Test active calls API
curl https://frontend-8jdd.onrender.com/api/calls/active

# Expected response:
# {
#   "ok": true,
#   "calls": [...],
#   "latestCall": "...",
#   "count": 0
# }
```

### 2. ASR Worker
```bash
# Health check
curl https://rtaa-asr-worker.onrender.com/health

# Check logs for empty transcript filtering
# Should see messages like:
# "[ASRWorker] ⏭️ Skipping empty transcript (not publishing)"
```

### 3. Ingest Service
```bash
# Health check
curl https://rtaa-ingest.onrender.com/health

# Check logs for call registration
# Should see messages like:
# "[exotel] ✅ Call registered in call registry"
```

### 4. End-to-End Test
1. Make an Exotel call
2. Verify transcripts appear in UI at `https://frontend-8jdd.onrender.com/test-agent-assist`
3. Verify intent detection works (check for KB articles)
4. End the call
5. Verify disposition modal auto-opens
6. Verify disposition can be saved

---

## 🔍 Monitoring & Logs

### Check Service Logs on Render:
1. Go to Render Dashboard
2. Click on the service
3. Go to **"Logs"** tab
4. Look for:
   - **Frontend**: `[CallRegistry]`, `[ingest-transcript]`, `[realtime]`
   - **ASR Worker**: `[ASRWorker] ⏭️ Skipping empty transcript`
   - **Ingest**: `[exotel] ✅ Call registered in call registry`

### Expected Log Messages:

**Frontend:**
```
[CallRegistry] ✅ Registered call
[ingest-transcript] Detecting intent for seq: ...
[realtime] ✅ Broadcast transcript_line
```

**ASR Worker:**
```
[ASRWorker] ⏭️ Skipping empty transcript (not publishing)
[ASRWorker] ✅ Published partial transcript
```

**Ingest:**
```
[exotel] ✅ Call registered in call registry
[exotel] ✅ Call marked as ended in registry
```

---

## 🐛 Troubleshooting

### If Services Don't Auto-Deploy:
1. Check Render dashboard for service settings
2. Verify branch is set to `feat/exotel-deepgram-bridge`
3. Verify auto-deploy is enabled
4. Manually trigger deployment if needed

### If Build Fails:
1. Check build logs in Render dashboard
2. Verify all dependencies are installed
3. Check for TypeScript errors
4. Verify environment variables are set

### If Services Don't Start:
1. Check service logs for errors
2. Verify environment variables are correct
3. Check health endpoint responses
4. Verify Redis connection (if applicable)

---

## 📋 Deployment Checklist

- [ ] Changes committed and pushed to `feat/exotel-deepgram-bridge`
- [ ] Frontend service deployed (or auto-deploy triggered)
- [ ] ASR Worker service deployed (or auto-deploy triggered)
- [ ] Ingest service deployed (or auto-deploy triggered)
- [ ] All services health checks passing
- [ ] Frontend `/api/calls/active` endpoint working
- [ ] Test Exotel call end-to-end
- [ ] Verify transcripts appear in UI
- [ ] Verify intent detection works
- [ ] Verify KB articles appear
- [ ] Verify disposition generation on call end
- [ ] Verify disposition can be saved

---

## 🎯 Next Steps After Deployment

1. **Test with Real Exotel Call**
   - Make a test call
   - Verify all features work end-to-end
   - Check logs for any errors

2. **Monitor Performance**
   - Check response times
   - Monitor error rates
   - Verify Redis connection stability

3. **Update Documentation**
   - Document any issues found
   - Update deployment guides if needed

---

**Deployment Date:** 2025-01-23  
**Branch:** `feat/exotel-deepgram-bridge`  
**Commit:** `40e2e85`


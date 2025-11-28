# 🔧 URGENT FIX: Deploy 300ms ElevenLabs Fix to Render ASR Service

## 🚨 Problem

Your Render ASR Worker is running **OLD CODE** (20ms chunks) instead of the **300ms fix** (commit `0afa67c`).

**Evidence:**
- GCS logs show: `buffered-chunk-007562-20ms.wav` (should be `300ms`)
- ElevenLabs error: `only 0.02s of uncommitted audio. You need at least 0.3s`
- The fix exists in the repository but is not deployed

## ✅ Root Cause

The 300ms fix is on branch: **`feat/exotel-deepgram-bridge`**

Your Render service is likely deploying from: **`main`** or **wrong branch**

## 🔧 Solution: Update Render Branch Configuration

### Step 1: Check Current Branch in Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your **ASR Worker service** (e.g., `rtaa-asr-worker` or similar)
3. Click on the service
4. Go to **Settings** tab
5. Look for **Branch** field under **Build & Deploy**
6. Note what branch it's currently using

### Step 2: Change Branch to `feat/exotel-deepgram-bridge`

1. In **Settings** → **Build & Deploy**
2. Find **Branch** field
3. Change from current value to: **`feat/exotel-deepgram-bridge`**
4. Click **Save Changes**

### Step 3: Force Redeploy with Clean Build

**Option A: Clear Build Cache (Recommended)**

1. Go to **Manual Deploy** section
2. Click **Clear build cache & deploy**
3. Wait for deployment to complete (~3-5 minutes)

**Option B: Trigger Manual Deploy**

1. Go to **Manual Deploy** section
2. Click **Deploy latest commit**
3. Wait for deployment to complete

## 🔍 Verification Steps

### 1. Check Build Logs

After redeployment, verify the build includes the fix:

```bash
# Should show in build logs:
✅ Compiled lib/pubsub
✅ Build successful: dist/index.js exists
```

### 2. Check Runtime Logs

Look for these log entries to confirm 300ms fix is active:

**✅ GOOD SIGNS (Fix is Active):**
```
[ASRWorker] Using ASR provider: elevenlabs
[ElevenLabsProvider] ✅ Connection opened
[ElevenLabsProvider] ✅ Session started
```

**❌ BAD SIGNS (Still Old Code):**
```
message_type: 'commit_throttled'
error: 'only 0.02s of uncommitted audio'
```

### 3. Check GCS Audio Files

After a test call, check GCS bucket:

**✅ GOOD:** `buffered-chunk-XXXXX-300ms.wav`
**❌ BAD:** `buffered-chunk-XXXXX-20ms.wav`

### 4. Monitor Transcription

**✅ GOOD SIGNS:**
```
[ElevenLabsProvider] ✅ WebSocket connection opened
[ElevenLabsProvider] 🔍 RAW WebSocket message received
messageType: 'COMMITTED_TRANSCRIPT'
[ASRWorker] ✅ Published final transcript
```

**❌ BAD SIGNS:**
```
Unknown message type: { message_type: 'commit_throttled' }
[ASRWorker] ⏭️ Skipping empty transcript
WebSocket closed: reason="commit_throttled"
```

## 🎯 Expected Behavior After Fix

1. **Audio chunks:** 300ms duration (not 20ms)
2. **No commit_throttled errors**
3. **ElevenLabs accepts commits:** Sees `COMMITTED_TRANSCRIPT` events
4. **Actual transcripts:** Non-empty text in logs
5. **GCS files:** Named `buffered-chunk-XXXXX-300ms.wav`

## 🐛 Troubleshooting

### Issue: Build Fails After Branch Change

**Error:** `Cannot find module '@rtaa/pubsub'`

**Fix:**
1. Verify **Build Command** is: 
   ```bash
   cd ../.. && npm ci && cd services/asr-worker && npm run build
   ```
2. Verify **Root Directory** is: `services/asr-worker`

### Issue: Still Getting commit_throttled After Redeploy

**Possible Causes:**
1. Build cache not cleared → Try **Clear build cache & deploy**
2. Wrong branch still deployed → Verify branch in Settings
3. Deployment didn't restart service → Try **Restart**

**Verification Command:**
```bash
curl https://YOUR-SERVICE.onrender.com/health
```

Check the response for provider details.

### Issue: Can't Find ASR Worker Service

**Check:**
1. Service might be named differently (e.g., `rtaa-11labs`, `asr-worker-elevenlabs`)
2. Check all services in your Render account
3. Look for service with **Environment Variable:** `ASR_PROVIDER=elevenlabs`

## 📋 Quick Checklist

- [ ] Found ASR Worker service in Render Dashboard
- [ ] Current branch noted (was: ____________)
- [ ] Changed branch to: `feat/exotel-deepgram-bridge`
- [ ] Saved changes
- [ ] Clicked "Clear build cache & deploy"
- [ ] Build completed successfully (checked logs)
- [ ] Service started successfully (checked logs)
- [ ] Verified `ASR_PROVIDER=elevenlabs` in logs
- [ ] Made test call
- [ ] Checked for `300ms` in GCS file names (not `20ms`)
- [ ] Checked for `COMMITTED_TRANSCRIPT` in logs (not `commit_throttled`)
- [ ] Verified actual transcript text appears in logs

## 🚀 Alternative: Deploy as New Service

If changing branch doesn't work, create a fresh service:

### Quick Deploy Steps

1. **Render Dashboard** → **New +** → **Web Service**
2. **Repository:** Select your GitHub repo
3. **Name:** `rtaa-asr-elevenlabs`
4. **Branch:** `feat/exotel-deepgram-bridge` ⚠️ **CRITICAL**
5. **Root Directory:** `services/asr-worker`
6. **Build Command:** `cd ../.. && npm ci && cd services/asr-worker && npm run build`
7. **Start Command:** `npm run start`
8. **Environment Variables:**
   ```
   REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
   PUBSUB_ADAPTER=redis_streams
   ASR_PROVIDER=elevenlabs
   ELEVENLABS_API_KEY=sk_d687c22a3dbf04db3097f3791abcd39abba69058fe835e8b
   ```
9. **Deploy** and verify

## 📞 Need Help?

1. Check logs in Render Dashboard
2. Verify branch name: `feat/exotel-deepgram-bridge`
3. Verify commit `0afa67c` exists on that branch
4. Check GCS file names after test call

---

## 🎉 Success Indicators

After successful deployment, you should see:

1. ✅ GCS files: `buffered-chunk-XXXXX-300ms.wav`
2. ✅ Logs: `COMMITTED_TRANSCRIPT` events
3. ✅ No `commit_throttled` errors
4. ✅ Actual transcript text in logs
5. ✅ ElevenLabs connection stays open (no premature closures)

---

**Last Updated:** November 27, 2025
**Fix Commit:** `0afa67c` - "fix: Update ElevenLabs chunk requirements to meet VAD commit threshold"
**Target Branch:** `feat/exotel-deepgram-bridge`


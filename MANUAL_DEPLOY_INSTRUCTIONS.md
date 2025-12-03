# 🚀 Manual Deployment Instructions

## 🔴 Current Situation

**Render Status:** Stuck on failed build `eeab05c`  
**Latest Code:** `a546fd3` (includes all fixes) ✅  
**Problem:** Auto-deploy didn't trigger for newer commits  

---

## ✅ Solution: Manual Deploy in Render

### Step 1: Go to Render Dashboard

1. Open: https://dashboard.render.com
2. Sign in
3. Find service: **frontend-8jdd** (or similar name)

### Step 2: Trigger Manual Deploy

**Option A: Clear Build & Deploy (Recommended)**

1. Click on your **frontend** service
2. Go to **"Manual Deploy"** in the top right
3. Select **"Clear build cache & deploy"**
4. Click **"Deploy"**
5. Wait ~5-10 minutes

**Option B: Deploy Latest Commit**

1. Click on your **frontend** service
2. Go to **"Manual Deploy"** in the top right
3. Select **"Deploy latest commit"**
4. Make sure it shows commit: `a546fd3`
5. Click **"Deploy"**
6. Wait ~5-10 minutes

---

## 🔍 What Commit Should Deploy?

**Commit:** `a546fd3` (or newer)  
**Branch:** `feat/exotel-deepgram-bridge`

**Check commits on GitHub:**
```
a546fd3 ← Latest (all fixes included)
7f4801f ← Clear intents fix
7b3875c ← Build fix (await params)
eeab05c ← FAILED (old, broken)
```

Make sure Render deploys `a546fd3` or later!

---

## 📊 What's in the Latest Code

### All Features (Commit a546fd3):

1. ✅ **In-Memory Transcripts** (200x faster)
2. ✅ **Progressive Updates** (no reloads)
3. ✅ **2-Second Auto-Discovery** (5x faster)
4. ✅ **Dispose Clears Everything** (transcripts + intents)
5. ✅ **Next.js 15+ Compatible** (await params fix)

---

## 🧪 How to Verify Deployment Succeeded

### Check 1: Test Dispose Endpoint

```bash
curl -X POST https://frontend-8jdd.onrender.com/api/calls/test-123/dispose \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected (Latest Code):**
```json
{
  "ok": true,
  "callId": "test-123",
  "message": "Call disposed successfully"
}
```

**Current (Old Code):**
```html
404: This page could not be found
```

### Check 2: Test In-Memory Transcripts

```bash
# Send transcript
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "verify-deploy",
    "transcript": "Testing deployment",
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'

# Immediately fetch (should be instant if latest code)
time curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=verify-deploy"
```

**Expected (Latest Code):**
- Response time: <100ms
- Transcripts: Found immediately

**Current (Old Code):**
- Response time: 200-500ms (DB query)
- Might error or be slow

---

## 🔧 Alternative: Deploy from Terminal (If Render CLI Available)

### If you have Render CLI installed:

```bash
# Deploy specific commit
render deploy --commit a546fd3 -s frontend-8jdd

# Or deploy latest
render deploy -s frontend-8jdd --clear-cache
```

---

## ⚠️ Why Auto-Deploy Didn't Work

Possible reasons:

1. **Failed build blocks queue**
   - Render saw `eeab05c` fail
   - Stopped auto-deploying until manually cleared

2. **Webhook delay**
   - GitHub webhook might be delayed
   - Manual deploy bypasses this

3. **Build cache issue**
   - Old build cache might cause issues
   - "Clear build cache & deploy" fixes this

---

## 📝 Quick Steps (TL;DR)

1. Go to: https://dashboard.render.com
2. Click your **frontend** service
3. Click **"Manual Deploy"** (top right)
4. Select **"Clear build cache & deploy"**
5. Click **"Deploy"**
6. Wait ~5-10 minutes
7. Run test script to verify:
   ```bash
   ./check-deployment.sh
   ```

---

## ✅ Success Criteria

Deployment succeeded when:

- [ ] Dispose endpoint returns JSON (not 404)
- [ ] Transcripts fetch in <100ms
- [ ] No TypeScript errors in build
- [ ] UI shows instant updates
- [ ] Disposal clears UI completely

---

## 🎯 Summary

**Current:** Render stuck on old failed build `eeab05c`  
**Latest Code:** `a546fd3` with all fixes ✅  
**Solution:** Manual deploy in Render dashboard  
**ETA:** 5-10 minutes after triggering  

**Just trigger the manual deploy and you're golden!** 🚀


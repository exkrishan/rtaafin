# 🚀 Render Deployment Guide - Demo & Live UIs

**Branch:** `demo/live-agent-assist/auto-20250109`  
**Status:** ✅ Ready for Deployment

---

## 📋 Overview

This guide covers deploying the **Demo** and **Live** Agent Assist UIs to Render.

### Routes Available:
- **Demo UI:** `https://your-service.onrender.com/demo`
- **Live UI:** `https://your-service.onrender.com/live`

---

## 🔧 Render Service Configuration

### If Updating Existing Frontend Service:

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your **Frontend service** (e.g., `rtaa-frontend`)
3. Go to **Settings** → **Build & Deploy**
4. Update **Branch** to: `demo/live-agent-assist/auto-20250109`
5. Click **Save Changes**
6. Render will automatically deploy the new branch

### If Creating New Service:

1. Go to Render Dashboard → **"New +"** → **"Web Service"**
2. Connect repository: `exkrishan/rtaafin`
3. Select branch: `demo/live-agent-assist/auto-20250109`

### Service Settings:

| Setting | Value |
|---------|-------|
| **Name** | `rtaa-frontend` (or your existing frontend service name) |
| **Environment** | `Node` |
| **Region** | Your preferred region |
| **Branch** | `demo/live-agent-assist/auto-20250109` ⚠️ **IMPORTANT** |
| **Root Directory** | `/` (repo root) |
| **Auto-Deploy** | `Yes` |

### Build & Start Commands:

| Setting | Value |
|---------|-------|
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm run start` |
| **Node Version** | `20.x` |

### Health Check:

| Setting | Value |
|---------|-------|
| **Health Check Path** | `/api/health` ⚠️ **REQUIRED** |
| **Health Check Interval** | `30 seconds` (default) |

---

## 🔐 Environment Variables

Add/Update these in Render Dashboard → **Environment**:

### Required for Demo UI (Works Immediately):

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### Required for Live UI (Real-time Transcripts):

```
REDIS_URL=<your-redis-url>
GEMINI_API_KEY=<your-gemini-api-key>
LLM_PROVIDER=gemini
LLM_API_KEY=<same-as-gemini-api-key>
```

### Optional:

```
NEXT_PUBLIC_BASE_URL=https://your-service.onrender.com
PUBSUB_ADAPTER=redis_streams
```

**Note:** 
- Demo UI will work with just Supabase credentials
- Live UI requires Redis and Gemini API keys for real-time transcripts
- If Live UI credentials are missing, a banner will show what's needed

---

## 📝 Step-by-Step Deployment

### Option 1: Update Existing Service (Recommended)

1. **Go to Render Dashboard**
   - Navigate to your existing frontend service

2. **Update Branch**
   - Settings → Build & Deploy
   - Change **Branch** to: `demo/live-agent-assist/auto-20250109`
   - Click **Save Changes**

3. **Verify Environment Variables**
   - Go to **Environment** tab
   - Ensure all required variables are set (see above)

4. **Deploy**
   - Render will automatically trigger a new deployment
   - Watch build logs to verify success

5. **Test**
   - Demo UI: `https://your-service.onrender.com/demo`
   - Live UI: `https://your-service.onrender.com/live`

### Option 2: Create New Service

1. **Create New Web Service**
   - Render Dashboard → "New +" → "Web Service"
   - Connect: `exkrishan/rtaafin`
   - Branch: `demo/live-agent-assist/auto-20250109`

2. **Configure Settings**
   - Use values from "Service Settings" table above

3. **Add Environment Variables**
   - Use values from "Environment Variables" section above

4. **Deploy**
   - Click **Create Web Service**
   - Wait for build to complete

---

## ✅ Verification

### After Deployment:

1. **Check Health Endpoint:**
   ```bash
   curl https://your-service.onrender.com/api/health
   ```
   Should return: `{"status":"ok"}`

2. **Test Demo UI:**
   - Visit: `https://your-service.onrender.com/demo`
   - Click "▶ Start Call"
   - Verify transcript playback works
   - Verify disposition modal opens at end
   - Verify "Export JSON" button works

3. **Test Live UI:**
   - Visit: `https://your-service.onrender.com/live`
   - Check for environment variable banner (if credentials missing)
   - Enter an interaction ID from ASR Worker logs
   - Verify transcripts appear in real-time

---

## 🔍 Troubleshooting

### Build Fails

**Error:** "Cannot find module '@rtaa/pubsub'"
- **Fix:** Ensure build command includes `npm ci` (installs workspace dependencies)

**Error:** TypeScript compilation errors
- **Fix:** Check build logs for specific errors, ensure Node 20.x is used

### Demo UI Not Loading

**Issue:** Transcript not loading
- **Fix:** Check browser console for errors, verify `/demo_playback.json` is accessible

**Issue:** Disposition modal not opening
- **Fix:** Check that `/api/calls/summary` endpoint is working

### Live UI Not Working

**Issue:** "Missing Environment Variables" banner
- **Fix:** Add required env vars in Render Dashboard → Environment

**Issue:** No transcripts appearing
- **Fix:** 
  1. Verify Redis connection (check `REDIS_URL`)
  2. Verify ASR Worker is publishing to `transcript.{interactionId}` topics
  3. Check browser console for subscription errors
  4. Verify `/api/transcripts/subscribe` endpoint is accessible

---

## 📊 URLs After Deployment

Once deployed, your URLs will be:

```
DEMO_URL: https://your-service.onrender.com/demo
LIVE_URL: https://your-service.onrender.com/live
```

Replace `your-service.onrender.com` with your actual Render service URL.

---

## 🎯 Quick Reference

| Item | Value |
|------|-------|
| **Branch** | `demo/live-agent-assist/auto-20250109` |
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm run start` |
| **Health Check** | `/api/health` |
| **Demo Route** | `/demo` |
| **Live Route** | `/live` |

---

**Last Updated:** 2025-01-09  
**Status:** ✅ Ready for Deployment


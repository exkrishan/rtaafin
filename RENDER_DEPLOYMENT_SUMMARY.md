# 🚀 Render Deployment Summary - Demo & Live UIs

**Branch:** `demo/live-agent-assist/auto-20250109`  
**Date:** 2025-01-09

---

## ⚠️ IMPORTANT CLARIFICATION

**Both Demo and Live UIs are in the SAME frontend service.**

- **Demo UI** = Route `/demo` in your frontend service
- **Live UI** = Route `/live` in your frontend service
- **Same Service** = One Next.js frontend service hosts both routes

**You do NOT need separate services.** Just update your existing frontend service to use the new branch.

---

## 🎯 Frontend Service to Deploy

### Service Name:
**`rtaa-frontend`** (or whatever your existing frontend service is named)

### Service Type:
**Web Service** (Node.js)

### What Gets Deployed:
- **Demo UI:** Available at `https://rtaa-frontend.onrender.com/demo`
- **Live UI:** Available at `https://rtaa-frontend.onrender.com/live`
- **Both routes** in the same Next.js application

---

## 🔐 Environment Variables Found in Codebase

### Redis Configuration (Found in RENDER_ENV_VALUES.md):
```
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
PUBSUB_ADAPTER=redis_streams
```

### JWT Public Key (Found in RENDER_ENV_VALUES.md):
```
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Yuy5TNziNEXIX2Vei1l
mKtqgfevXkUdMfVhDxEXEMNrwX4uU3cye4zpiW2XueBs0wiAUwaF/oGswA7L51Km
ebcDtVr9yMG2Dl/wMIhH55ZzOC1dweb+N5qY8u6H02FpStZou8KUCmQlf1tzvK4Y
sMehFTPXhGzLopA8oPbnQRkoRvL27Dn+QfLxYgnakex7F12XMI56cLcfhSSE+gQ7
z3mbYeIiBTwl9AufxslUy0aobBmKPqaAMq9vPPtkbGUwmyOVVOHuuK2Jq/wjr26z
tzyWjUNznSwHZmP0ISd4+SXJvrSHqJx/M3eTEaOokZH71TlbsHCyDbR8uXkD+uez
LQIDAQAB
-----END PUBLIC KEY-----
```

### Deepgram API Key (Found in RENDER_ASR_WORKER_FORM_VALUES.md):
```
DEEPGRAM_API_KEY=d65326fff430ad13ad6ad78acfe305a8d8c8245e
```

### Missing Values (Need to Check Your Render Dashboard):
- `NEXT_PUBLIC_SUPABASE_URL` - Check your existing frontend service env vars
- `SUPABASE_SERVICE_ROLE_KEY` - Check your existing frontend service env vars
- `GEMINI_API_KEY` - Check your existing frontend service env vars (if set)
- `LLM_API_KEY` - Check your existing frontend service env vars (if set)
- `LLM_PROVIDER` - Check your existing frontend service env vars (if set)

---

## 📋 Deployment Steps

### Step 1: Identify Your Frontend Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Look for your **frontend service** (likely named `rtaa-frontend` or similar)
3. Note the service name and URL

### Step 2: Update Branch

1. Click on your **frontend service**
2. Go to **Settings** → **Build & Deploy**
3. Change **Branch** from `main` to: `demo/live-agent-assist/auto-20250109`
4. Click **Save Changes**
5. Render will automatically deploy

### Step 3: Verify Environment Variables

Go to **Environment** tab and ensure these are set:

#### Required for Demo UI:
- `NEXT_PUBLIC_SUPABASE_URL` ✅ (should already exist)
- `SUPABASE_SERVICE_ROLE_KEY` ✅ (should already exist)

#### Required for Live UI (Real-time):
- `REDIS_URL` ✅ (use value from above)
- `GEMINI_API_KEY` ⚠️ (check if exists, add if missing)
- `LLM_PROVIDER=gemini` ⚠️ (add if missing)
- `LLM_API_KEY` ⚠️ (same as GEMINI_API_KEY if using Gemini)

#### Optional:
- `PUBSUB_ADAPTER=redis_streams` (for transcript consumer)
- `NEXT_PUBLIC_BASE_URL` (your frontend URL, e.g., `https://rtaa-frontend.onrender.com`)

### Step 4: Wait for Deployment

1. Monitor build logs
2. Wait for status to show **"Live"**
3. Test both routes:
   - Demo: `https://your-frontend-url.onrender.com/demo`
   - Live: `https://your-frontend-url.onrender.com/live`

---

## 🔍 How to Find Existing Environment Variables

### Option 1: Check Render Dashboard
1. Go to your frontend service
2. Click **Environment** tab
3. View all existing variables

### Option 2: Check Local .env.local (if you have it)
```bash
# If you have .env.local locally, check:
cat .env.local | grep -E "SUPABASE|GEMINI|LLM"
```

### Option 3: Check Service Logs
1. Go to Render Dashboard → Frontend service → **Logs**
2. Look for startup logs that might show env var status

---

## ✅ After Deployment

### Demo UI:
- **URL:** `https://rtaa-frontend.onrender.com/demo`
- **Status:** Works immediately with Supabase credentials
- **Features:** Deterministic playback, export JSON, disposition modal

### Live UI:
- **URL:** `https://rtaa-frontend.onrender.com/live`
- **Status:** 
  - If env vars missing → Shows banner with required variables
  - If env vars set → Connects to real-time transcripts from ASR Worker

---

## 📊 Service Architecture

```
┌─────────────────────────────────────────┐
│     Frontend Service (rtaa-frontend)    │
│                                         │
│  Routes:                                 │
│  - /demo  → Demo UI (playback)          │
│  - /live  → Live UI (real-time)         │
│  - /dashboard                           │
│  - /test-transcripts                    │
│                                         │
│  Environment:                           │
│  - NEXT_PUBLIC_SUPABASE_URL             │
│  - SUPABASE_SERVICE_ROLE_KEY           │
│  - REDIS_URL (for Live UI)              │
│  - GEMINI_API_KEY (for Live UI)         │
└─────────────────────────────────────────┘
```

**Note:** Both `/demo` and `/live` are in the same Next.js app, same service, same deployment.

---

## 🎯 Summary

1. **One Service:** `rtaa-frontend` (or your existing frontend service name)
2. **Two Routes:** `/demo` and `/live` (both in same service)
3. **Update Branch:** Change to `demo/live-agent-assist/auto-20250109`
4. **Environment Variables:** Use existing values + add Redis/Gemini if needed for Live UI

---

**Last Updated:** 2025-01-09


# 🚨 Fix 502 Error - Wrong Service Issue

## Problem

You're seeing **502 Bad Gateway** errors because you're accessing the demo page on the **INGEST service** instead of the **FRONTEND service**.

**Current URL (WRONG):**
```
https://ingest-1-96p6.onrender.com/demo
```

**Why it fails:**
- Ingest service = WebSocket server only (no Next.js API routes)
- Frontend service = Next.js app (has `/api/calls/ingest-transcript`)

---

## ✅ Solution

### Option 1: Use Frontend Service (If You Have One)

1. **Find your frontend service in Render Dashboard**
2. **Copy its URL** (e.g., `https://rtaa-frontend.onrender.com`)
3. **Access demo at:** `https://rtaa-frontend.onrender.com/demo`

### Option 2: Create Frontend Service (If You Don't Have One)

1. **Go to Render Dashboard**
2. **Click "New +" → "Web Service"**
3. **Connect repository:** `exkrishan/rtaafin`
4. **Select branch:** `demo/live-agent-assist/auto-20250109`

**Service Configuration:**
- **Name:** `rtaa-frontend`
- **Environment:** `Node`
- **Root Directory:** `/` (repo root)
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm run start`
- **Node Version:** `20.x`
- **Health Check Path:** `/api/health`

**Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
REDIS_URL=<your-redis-url>
GEMINI_API_KEY=<your-gemini-api-key>
```

5. **Save and wait for deployment** (~5-10 minutes)
6. **Access demo at:** `https://rtaa-frontend.onrender.com/demo`

---

## 🔍 How to Verify

### Check Service Type

**Ingest Service:**
- ✅ Has `/health` endpoint
- ✅ Has `/v1/ingest` WebSocket endpoint
- ❌ Does NOT have `/api/calls/ingest-transcript`
- ❌ Does NOT have Next.js routes

**Frontend Service:**
- ✅ Has `/api/health` endpoint
- ✅ Has `/api/calls/ingest-transcript` endpoint
- ✅ Has `/demo` page
- ✅ Has `/live` page
- ✅ Has all Next.js routes

### Test URLs

**Ingest Service (WebSocket only):**
```bash
curl https://ingest-1-96p6.onrender.com/health
# ✅ Should work: {"status":"ok","service":"ingest"}

curl https://ingest-1-96p6.onrender.com/api/calls/ingest-transcript
# ❌ Should fail: 404 or 502
```

**Frontend Service (Next.js):**
```bash
curl https://rtaa-frontend.onrender.com/api/health
# ✅ Should work: {"status":"ok"}

curl https://rtaa-frontend.onrender.com/api/calls/ingest-transcript
# ✅ Should work (with POST): 200 OK
```

---

## 📊 Service Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│  Ingest Service     │         │  Frontend Service   │
│  (WebSocket)        │         │  (Next.js)          │
│                     │         │                     │
│  - /health          │         │  - /api/health      │
│  - /v1/ingest (WS)  │         │  - /api/calls/*     │
│                     │         │  - /demo            │
│  ❌ No Next.js      │         │  - /live            │
│  ❌ No API routes    │         │  - /dashboard       │
└─────────────────────┘         └─────────────────────┘
```

**Demo page MUST be on Frontend Service, NOT Ingest Service!**

---

## 🎯 Summary

1. **Current Issue:** Using `ingest-1-96p6.onrender.com/demo` (wrong service)
2. **Solution:** Use your frontend service URL instead
3. **If no frontend service:** Create one using the steps above
4. **After fix:** Transcripts will work because API routes exist

---

**Last Updated:** 2025-01-09


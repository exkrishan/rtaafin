# 🚀 Frontend Service - Complete Deployment Guide

## 📋 Overview

This guide provides **complete step-by-step instructions** to deploy the RTAA Agent Assist frontend service to Render with all required configurations.

**Service Type:** Next.js Web Application  
**Deployment Platform:** Render  
**Branch:** `feat/exotel-deepgram-bridge`

---

## 🎯 What Gets Deployed

The frontend service includes:

### Pages & Routes
- **`/demo`** - Full Agent Assist interface with real-time transcripts
- **`/live`** - Live agent assist interface
- **`/dashboard`** - Dashboard view with transcript and customer info
- **`/`** - Home page

### API Routes
- **`/api/health`** - Health check endpoint (REQUIRED for Render)
- **`/api/calls/ingest-transcript`** - Transcript ingestion
- **`/api/calls/intent`** - Intent detection
- **`/api/calls/summary`** - Call summaries
- **`/api/kb/search`** - KB article search
- **`/api/transcripts/*`** - Transcript management endpoints

---

## 📋 Prerequisites

1. ✅ **Render Account** - [Sign up](https://render.com) (free tier works)
2. ✅ **GitHub Repository** - Code must be in GitHub/GitLab/Bitbucket
3. ✅ **Supabase Project** - For database features (optional but recommended)
4. ✅ **LLM API Key** - OpenAI or Gemini for intent detection (optional but recommended)
5. ✅ **Redis URL** - For real-time transcript streaming (optional but recommended)

---

## 🚀 Step 1: Create Web Service on Render

### 1.1 Navigate to Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**

### 1.2 Connect Repository

1. **Connect your Git provider** (GitHub/GitLab/Bitbucket)
2. **Select repository:** `exkrishan/rtaafin` (or your repo)
3. **Select branch:** `feat/exotel-deepgram-bridge`

### 1.3 Configure Service Settings

#### Basic Settings

| Setting | Value |
|---------|-------|
| **Name** | `rtaa-frontend` (or your preferred name) |
| **Environment** | `Node` |
| **Region** | Choose closest to your users (e.g., `Oregon (US West)`, `Singapore (Southeast Asia)`) |
| **Branch** | `feat/exotel-deepgram-bridge` |
| **Root Directory** | `/` (leave empty or set to `/`) |

#### Build & Deploy Settings

| Setting | Value |
|---------|-------|
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm run start` |
| **Node Version** | `20` (or latest LTS) |

#### Advanced Settings

| Setting | Value |
|---------|-------|
| **Health Check Path** | `/api/health` ⚠️ **REQUIRED** |
| **Auto-Deploy** | `Yes` (recommended) |
| **Plan** | `Free` (or your preferred plan) |

---

## 🔐 Step 2: Configure Environment Variables

Click **"Environment"** tab in Render Dashboard and add these variables:

### ✅ Required Environment Variables

#### 1. Supabase Configuration (REQUIRED for database features)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**How to get:**
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Keep secret!

#### 2. LLM Configuration (REQUIRED for intent detection and summaries)

```bash
LLM_API_KEY=your-llm-api-key-here
LLM_PROVIDER=openai  # or 'gemini'
```

**For OpenAI:**
```bash
LLM_API_KEY=sk-...
LLM_PROVIDER=openai
```

**For Gemini:**
```bash
LLM_API_KEY=AIzaSy...
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-1.5-flash  # Optional, defaults to gemini-1.5-flash
```

#### 3. Node Environment

```bash
NODE_ENV=production
```

### ⚠️ Recommended Environment Variables (for real-time transcripts)

#### Redis Configuration (for real-time transcript streaming)

```bash
REDIS_URL=redis://default:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT
PUBSUB_ADAPTER=redis_streams
```

**Example (from your existing setup):**
```bash
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
PUBSUB_ADAPTER=redis_streams
```

**⚠️ IMPORTANT:** Use the **SAME** `REDIS_URL` as your other services (`rtaa-ingest`, `rtaa-asr-worker`) so they can communicate!

#### Frontend Base URL (for API calls)

```bash
NEXT_PUBLIC_BASE_URL=https://rtaa-frontend.onrender.com
```

Replace `rtaa-frontend` with your actual service name.

### ❌ Optional Environment Variables

```bash
# Service name (for health check)
SERVICE_NAME=frontend

# Admin key (for admin pages)
NEXT_PUBLIC_ADMIN_KEY=your-admin-key-here

# S3 Configuration (if using S3 for ingest)
S3_BUCKET=your-bucket-name
S3_INGEST_PREFIX=ingest/
S3_REGION=us-east-1
```

---

## 🏗️ Step 3: Deploy

1. **Review all settings** to ensure they're correct
2. Click **"Create Web Service"**
3. Render will:
   - Clone your repository
   - Install dependencies (`npm ci`)
   - Build the Next.js app (`npm run build`)
   - Start the service (`npm run start`)
4. **Wait for deployment** (usually 3-5 minutes)

---

## ✅ Step 4: Verify Deployment

### 4.1 Check Service Status

1. In Render Dashboard, check service status:
   - ✅ **"Live"** = Successfully deployed
   - ❌ **"Failed"** = Check logs for errors

### 4.2 Test Health Endpoint

```bash
curl https://your-service-name.onrender.com/api/health
```

**Expected response:**
```json
{"status":"ok","service":"frontend"}
```

### 4.3 Test Demo Page

Open in browser:
```
https://your-service-name.onrender.com/demo
```

**You should see:**
- ✅ Agent Assist interface loads
- ✅ "Start Call" button is visible
- ✅ Transcript panel on left
- ✅ Agent Assist panel on right

### 4.4 Test Other Routes

- **Dashboard:** `https://your-service-name.onrender.com/dashboard`
- **Live:** `https://your-service-name.onrender.com/live`
- **Health:** `https://your-service-name.onrender.com/api/health`

---

## 🧪 Step 5: Test Features

### 5.1 Test Transcript Ingestion

1. Go to `/demo` page
2. Click **"Start Call"** button
3. Transcript should start appearing in real-time (if Redis is configured)
4. KB articles should appear in Agent Assist panel
5. Intent detection should work automatically

### 5.2 Verify Features

- [ ] Transcript lines appear in real-time
- [ ] KB articles surface based on conversation
- [ ] Intent detection shows correct intent
- [ ] Auto-disposition modal opens at end of call
- [ ] Health endpoint returns 200 OK

---

## 🔍 Troubleshooting

### Issue 1: Build Fails

**Error:** `npm ci` fails  
**Solution:**
- Check `package-lock.json` is committed to git
- Verify Node version is 20.x
- Check build logs for specific errors

**Error:** TypeScript errors  
**Solution:**
- Fix TypeScript errors locally first
- Run `npm run build` locally to verify
- Commit fixes and redeploy

### Issue 2: Service Fails to Start

**Error:** `Missing NEXT_PUBLIC_SUPABASE_URL`  
**Solution:**
- Verify environment variables are set correctly
- Check for typos in variable names
- Ensure `NEXT_PUBLIC_` prefix for client-side variables
- **Redeploy** after adding environment variables

**Error:** Health check fails  
**Solution:**
- Verify Health Check Path is set to `/api/health` in Render settings
- Check `/api/health` route exists and returns 200
- Check service logs for errors
- Wait a few minutes for service to fully start

### Issue 3: Demo Page Doesn't Load

**Error:** Blank page or 404  
**Solution:**
- Check browser console for errors
- Verify `/demo` route exists (`app/demo/page.tsx`)
- Check service logs for runtime errors
- Verify all environment variables are set

**Error:** API calls fail  
**Solution:**
- Check Supabase credentials are correct
- Verify Supabase tables exist
- Check service logs for API errors
- Verify `NEXT_PUBLIC_SUPABASE_URL` is set correctly

### Issue 4: KB Articles Don't Appear

**Error:** No KB articles in Agent Assist panel  
**Solution:**
- Verify `LLM_API_KEY` is set correctly
- Check `LLM_PROVIDER` is set (`openai` or `gemini`)
- Check `/api/kb/search` endpoint works
- Check service logs for intent detection errors

### Issue 5: No Real-Time Transcripts

**Error:** Transcripts don't appear in real-time  
**Solution:**
- Verify `REDIS_URL` is set correctly
- Verify `PUBSUB_ADAPTER=redis_streams` is set
- Check that `REDIS_URL` matches your other services
- Check service logs for Redis connection errors
- Verify ASR worker is publishing transcripts to Redis

---

## 📊 Service URLs Reference

After deployment, your service will be available at:

| Page/Endpoint | URL |
|---------------|-----|
| **Main URL** | `https://your-service-name.onrender.com` |
| **Demo Page** | `https://your-service-name.onrender.com/demo` |
| **Live Page** | `https://your-service-name.onrender.com/live` |
| **Dashboard** | `https://your-service-name.onrender.com/dashboard` |
| **Health Check** | `https://your-service-name.onrender.com/api/health` |

---

## 🔄 Updating the Service

### Manual Deploy

1. Go to Render Dashboard → Your Service
2. Click **"Manual Deploy"** → **"Deploy latest commit"**

### Auto-Deploy (Recommended)

- Service auto-deploys on every push to the configured branch
- No manual action needed
- Check deployment logs in Render Dashboard

---

## 📝 Environment Variables Quick Reference

### Required Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Supabase service role key | `eyJhbGc...` |
| `LLM_API_KEY` | ✅ Yes | LLM API key | `sk-...` or `AIza...` |
| `LLM_PROVIDER` | ✅ Yes | LLM provider | `openai` or `gemini` |
| `NODE_ENV` | ⚠️ Recommended | Node environment | `production` |

### Recommended Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `REDIS_URL` | ⚠️ Recommended | Redis connection URL | `redis://default:...@...` |
| `PUBSUB_ADAPTER` | ⚠️ Recommended | Pub/sub adapter | `redis_streams` |
| `NEXT_PUBLIC_BASE_URL` | ⚠️ Recommended | Frontend base URL | `https://rtaa-frontend.onrender.com` |

### Optional Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SERVICE_NAME` | ❌ Optional | Service name for health check | `frontend` |
| `GEMINI_MODEL` | ❌ Optional | Gemini model name | `gemini-1.5-flash` |
| `NEXT_PUBLIC_ADMIN_KEY` | ❌ Optional | Admin key for admin pages | `your-admin-key` |

---

## 🎉 Success Checklist

After deployment, verify:

- [ ] Service is **"Live"** on Render
- [ ] Health check returns `200 OK` at `/api/health`
- [ ] Demo page loads at `/demo`
- [ ] "Start Call" button works
- [ ] Transcript appears in real-time (if Redis configured)
- [ ] KB articles appear in Agent Assist panel
- [ ] Intent detection works
- [ ] Auto-disposition modal opens at end of call
- [ ] All environment variables are set correctly

---

## 🔗 Integration with Other Services

### Service Communication Flow

```
Exotel → Ingest Service → Redis → ASR Worker → Redis → Frontend
```

### Required Services

1. **Ingest Service** (`rtaa-ingest`)
   - WebSocket endpoint: `wss://rtaa-ingest.onrender.com/v1/ingest`
   - Must have: `SUPPORT_EXOTEL=true`, `REDIS_URL`, `PUBSUB_ADAPTER=redis_streams`

2. **ASR Worker** (`rtaa-asr-worker`)
   - Must have: `ASR_PROVIDER=elevenlabs` (or `deepgram`), `REDIS_URL`, `PUBSUB_ADAPTER=redis_streams`
   - Must use **SAME** `REDIS_URL` as other services

3. **Frontend** (`rtaa-frontend`) ← **You're deploying this**
   - Must have: `REDIS_URL`, `PUBSUB_ADAPTER=redis_streams`
   - Must use **SAME** `REDIS_URL` as other services

**⚠️ CRITICAL:** All services **MUST** use the **SAME** `REDIS_URL` to communicate!

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
- [Supabase Documentation](https://supabase.com/docs)
- [Frontend Deployment Guide](./FRONTEND_RENDER_DEPLOYMENT.md)
- [Render Quick Reference](./RENDER_FRONTEND_QUICK_REFERENCE.md)

---

## 🆘 Need Help?

### Check Service Logs

1. Go to Render Dashboard → Your Service → **Logs** tab
2. Look for error messages
3. Check for connection errors
4. Verify environment variables are loaded

### Verify Environment Variables

1. Go to Render Dashboard → Your Service → **Environment** tab
2. Verify all required variables are set
3. Check for typos in variable names
4. Ensure values are correct

### Test Locally First

Before deploying to Render, test locally:

```bash
# Set environment variables
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export LLM_API_KEY=...
export LLM_PROVIDER=openai

# Build and start
npm ci
npm run build
npm run start
```

Then test at `http://localhost:3000/demo`

---

**🎉 Your frontend is now ready to deploy! Follow the steps above and you'll have a live frontend service in minutes!**


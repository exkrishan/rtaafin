# 🚀 Frontend Service - Render Deployment Guide

## Overview

This guide provides step-by-step instructions to deploy the RTAA Agent Assist frontend to Render with a public URL.

## 🎯 What We're Deploying

The frontend includes:
- **Demo Page** (`/demo`) - Full Agent Assist interface with:
  - Real-time transcript display
  - KB article recommendations
  - Intent detection
  - Auto-disposition modal
  - Call controls (start/stop/pause/resume)
- **Dashboard** (`/dashboard`) - Dashboard view with transcript and customer info
- **Test Pages** - Various testing interfaces
- **API Routes** - Backend API endpoints for transcript ingestion, KB search, disposition, etc.

---

## 📋 Prerequisites

1. ✅ Render account (free tier works)
2. ✅ Supabase project with database tables configured
3. ✅ LLM API key (OpenAI, Gemini, etc.) for intent detection and summaries
4. ✅ Git repository access (GitHub/GitLab/Bitbucket)

---

## 🚀 Step 1: Create New Web Service on Render

### 1.1 Navigate to Render Dashboard
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**

### 1.2 Connect Repository
1. Connect your Git repository (GitHub/GitLab/Bitbucket)
2. Select the repository: `rtaafin`
3. Select branch: `feat/exotel-deepgram-bridge` (or your main branch)

### 1.3 Configure Service Settings

**Basic Settings:**
- **Name:** `rtaa-frontend` (or your preferred name)
- **Environment:** `Node`
- **Region:** Choose closest to your users (e.g., `Oregon (US West)`)
- **Branch:** `feat/exotel-deepgram-bridge` (or your main branch)
- **Root Directory:** `/` (leave empty or set to `/`)

**Build & Deploy:**
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm run start`

**Advanced Settings:**
- **Node Version:** `20` (or latest LTS)
- **Health Check Path:** `/api/health` ⚠️ **REQUIRED**
- **Auto-Deploy:** `Yes` (recommended)

---

## 🔐 Step 2: Configure Environment Variables

Click **"Environment"** tab and add these variables:

### Required Environment Variables

```bash
# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# LLM Configuration (REQUIRED for intent detection and summaries)
LLM_API_KEY=your-llm-api-key-here
LLM_PROVIDER=openai  # or 'gemini'
GEMINI_MODEL=gemini-1.5-flash  # if using Gemini

# Node Environment
NODE_ENV=production

# Service Name (optional, for health check)
SERVICE_NAME=frontend
```

### Optional Environment Variables

```bash
# Admin Configuration (for admin pages)
NEXT_PUBLIC_ADMIN_KEY=your-admin-key-here

# S3 Configuration (if using S3 for ingest)
S3_BUCKET=your-bucket-name
S3_INGEST_PREFIX=ingest/
S3_REGION=us-east-1

# TLS Configuration (only for dev/testing with corporate proxies)
# DO NOT SET IN PRODUCTION
# ALLOW_INSECURE_TLS=false
```

### How to Get Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep secret!)

---

## 🏗️ Step 3: Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Install dependencies (`npm ci`)
   - Build the Next.js app (`npm run build`)
   - Start the service (`npm run start`)
3. Wait for deployment to complete (usually 3-5 minutes)

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

Expected response:
```json
{"status":"ok","service":"frontend"}
```

### 4.3 Test Demo Page
Open in browser:
```
https://your-service-name.onrender.com/demo
```

You should see:
- ✅ Agent Assist interface loads
- ✅ "Start Call" button is visible
- ✅ Transcript panel on left
- ✅ Agent Assist panel on right

---

## 🧪 Step 5: Test the Demo

### 5.1 Start a Demo Call
1. Click **"Start Call"** button
2. Transcript should start appearing in real-time
3. KB articles should appear in Agent Assist panel
4. Intent detection should work automatically

### 5.2 Verify Features
- ✅ Transcript lines appear in real-time
- ✅ KB articles surface based on conversation
- ✅ Intent detection shows correct intent
- ✅ Auto-disposition modal opens at end of call

---

## 🔍 Troubleshooting

### Issue: Build Fails

**Error:** `npm ci` fails
**Solution:**
- Check `package-lock.json` is committed
- Verify Node version is 20.x
- Check build logs for specific errors

**Error:** TypeScript errors
**Solution:**
- Fix TypeScript errors locally first
- Run `npm run build` locally to verify
- Commit fixes and redeploy

### Issue: Service Fails to Start

**Error:** `Missing NEXT_PUBLIC_SUPABASE_URL`
**Solution:**
- Verify environment variables are set correctly
- Check for typos in variable names
- Ensure `NEXT_PUBLIC_` prefix for client-side variables

**Error:** Health check fails
**Solution:**
- Verify Health Check Path is set to `/api/health`
- Check `/api/health` route exists and returns 200
- Check service logs for errors

### Issue: Demo Page Doesn't Load

**Error:** Blank page or 404
**Solution:**
- Check browser console for errors
- Verify `/demo` route exists (`app/demo/page.tsx`)
- Check service logs for runtime errors

**Error:** API calls fail
**Solution:**
- Check Supabase credentials are correct
- Verify Supabase tables exist
- Check service logs for API errors

### Issue: KB Articles Don't Appear

**Error:** No KB articles in Agent Assist panel
**Solution:**
- Verify `LLM_API_KEY` is set correctly
- Check `/api/kb/search` endpoint works
- Check service logs for intent detection errors

---

## 📊 Service URLs

After deployment, your service will be available at:
- **Main URL:** `https://your-service-name.onrender.com`
- **Demo Page:** `https://your-service-name.onrender.com/demo`
- **Dashboard:** `https://your-service-name.onrender.com/dashboard`
- **Health Check:** `https://your-service-name.onrender.com/api/health`

---

## 🔄 Updating the Service

### Manual Deploy
1. Go to Render Dashboard → Your Service
2. Click **"Manual Deploy"** → **"Deploy latest commit"**

### Auto-Deploy (Recommended)
- Service auto-deploys on every push to the configured branch
- No manual action needed

---

## 📝 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Supabase service role key | `eyJhbGc...` |
| `LLM_API_KEY` | ✅ Yes | LLM API key for intent/summaries | `sk-...` or `AIza...` |
| `LLM_PROVIDER` | ⚠️ Recommended | LLM provider | `openai` or `gemini` |
| `GEMINI_MODEL` | ⚠️ If Gemini | Gemini model name | `gemini-1.5-flash` |
| `NODE_ENV` | ⚠️ Recommended | Node environment | `production` |
| `SERVICE_NAME` | ❌ Optional | Service name for health check | `frontend` |
| `NEXT_PUBLIC_ADMIN_KEY` | ❌ Optional | Admin key for admin pages | `your-admin-key` |

---

## 🎉 Success Checklist

- [ ] Service is "Live" on Render
- [ ] Health check returns `200 OK`
- [ ] Demo page loads at `/demo`
- [ ] "Start Call" button works
- [ ] Transcript appears in real-time
- [ ] KB articles appear in Agent Assist panel
- [ ] Intent detection works
- [ ] Auto-disposition modal opens at end of call

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
- [Supabase Documentation](https://supabase.com/docs)

---

**🎉 Your frontend is now live! Share the demo URL with your team!**


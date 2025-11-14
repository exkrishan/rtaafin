# ✅ Frontend Deployment Checklist

## 🚀 Quick Deployment Steps

### Step 1: Create Service on Render

- [ ] Go to [Render Dashboard](https://dashboard.render.com)
- [ ] Click **"New +"** → **"Web Service"**
- [ ] Connect repository: `exkrishan/rtaafin`
- [ ] Select branch: `feat/exotel-deepgram-bridge`

### Step 2: Configure Service Settings

- [ ] **Name:** `rtaa-frontend`
- [ ] **Environment:** `Node`
- [ ] **Region:** Choose closest to users
- [ ] **Root Directory:** `/` (empty)
- [ ] **Build Command:** `npm ci && npm run build`
- [ ] **Start Command:** `npm run start`
- [ ] **Node Version:** `20`
- [ ] **Health Check Path:** `/api/health` ⚠️ **REQUIRED**

### Step 3: Add Environment Variables

#### Required Variables

- [ ] `NEXT_PUBLIC_SUPABASE_URL` = `https://your-project.supabase.co`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = `eyJhbGc...`
- [ ] `LLM_API_KEY` = `sk-...` or `AIza...`
- [ ] `LLM_PROVIDER` = `openai` or `gemini`
- [ ] `NODE_ENV` = `production`

#### Recommended Variables (for real-time transcripts)

- [ ] `REDIS_URL` = `redis://default:...@...` (SAME as other services)
- [ ] `PUBSUB_ADAPTER` = `redis_streams`
- [ ] `NEXT_PUBLIC_BASE_URL` = `https://rtaa-frontend.onrender.com`

### Step 4: Deploy

- [ ] Click **"Create Web Service"**
- [ ] Wait for deployment (3-5 minutes)
- [ ] Check service status is **"Live"**

### Step 5: Verify Deployment

- [ ] Health check: `curl https://your-service.onrender.com/api/health`
- [ ] Demo page: `https://your-service.onrender.com/demo`
- [ ] Check logs for errors
- [ ] Test "Start Call" button
- [ ] Verify transcripts appear (if Redis configured)

---

## 🔐 Environment Variables Quick Copy

### Minimum Required (for basic functionality)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
LLM_API_KEY=your-llm-api-key
LLM_PROVIDER=openai
NODE_ENV=production
```

### Full Configuration (with real-time transcripts)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
LLM_API_KEY=your-llm-api-key
LLM_PROVIDER=openai
NODE_ENV=production
REDIS_URL=redis://default:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT
PUBSUB_ADAPTER=redis_streams
NEXT_PUBLIC_BASE_URL=https://rtaa-frontend.onrender.com
```

---

## 🎯 Service URLs After Deployment

- **Main:** `https://your-service-name.onrender.com`
- **Demo:** `https://your-service-name.onrender.com/demo`
- **Live:** `https://your-service-name.onrender.com/live`
- **Health:** `https://your-service-name.onrender.com/api/health`

---

## ⚠️ Critical Notes

1. **Health Check Path:** MUST be set to `/api/health` in Render settings
2. **Redis URL:** MUST be the SAME as your other services (`rtaa-ingest`, `rtaa-asr-worker`)
3. **Environment Variables:** Must be set BEFORE first deployment
4. **Node Version:** Use Node 20.x (LTS)

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Build fails | Check `package-lock.json` is committed, verify Node 20.x |
| Health check fails | Set Health Check Path to `/api/health` |
| Blank page | Check browser console, verify env vars are set |
| No transcripts | Verify `REDIS_URL` matches other services |
| KB articles missing | Verify `LLM_API_KEY` is set correctly |

---

**📖 Full Guide:** See [FRONTEND_DEPLOYMENT_COMPLETE_GUIDE.md](./FRONTEND_DEPLOYMENT_COMPLETE_GUIDE.md)


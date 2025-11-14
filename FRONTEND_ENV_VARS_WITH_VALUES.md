# 🔐 Frontend Service - Environment Variables with Values

## ✅ Required Environment Variables

### 1. Supabase Configuration (REQUIRED)

**⚠️ You need to get these from your Supabase dashboard:**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**How to get:**
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

---

### 2. LLM Configuration (REQUIRED)

**⚠️ You need to provide your LLM API key:**

**Option A: OpenAI**
```bash
LLM_API_KEY=sk-...your-openai-api-key...
LLM_PROVIDER=openai
```

**Option B: Gemini (Recommended)**
```bash
LLM_API_KEY=AIzaSy...your-gemini-api-key...
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-1.5-flash
```

**How to get:**
- **OpenAI:** [OpenAI API Keys](https://platform.openai.com/api-keys)
- **Gemini:** [Google AI Studio](https://aistudio.google.com/app/apikey)

---

### 3. Node Environment (REQUIRED)

```bash
NODE_ENV=production
```

---

## ⚠️ Recommended Environment Variables (for real-time transcripts)

### 4. Redis Configuration (SAME as your other services!)

**✅ Actual value from your existing setup:**

```bash
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
PUBSUB_ADAPTER=redis_streams
```

**⚠️ CRITICAL:** This must be the **SAME** `REDIS_URL` as your:
- `rtaa-ingest` service
- `rtaa-asr-worker` service

---

### 5. Frontend Base URL (Recommended)

```bash
NEXT_PUBLIC_BASE_URL=https://rtaa-frontend.onrender.com
```

**Note:** Replace `rtaa-frontend` with your actual service name after deployment.

---

## 📋 Complete Environment Variables List

### Copy-Paste Ready (Fill in your values)

```bash
# Supabase (REQUIRED - Get from Supabase Dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# LLM (REQUIRED - Get from OpenAI or Google AI Studio)
LLM_API_KEY=your-llm-api-key-here
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-1.5-flash

# Node Environment
NODE_ENV=production

# Redis (SAME as other services - Already configured)
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
PUBSUB_ADAPTER=redis_streams

# Frontend URL (Update after deployment)
NEXT_PUBLIC_BASE_URL=https://rtaa-frontend.onrender.com
```

---

## 🎯 Quick Setup Checklist

### Values You Have ✅

- [x] `REDIS_URL` = `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304`
- [x] `PUBSUB_ADAPTER` = `redis_streams`
- [x] `NODE_ENV` = `production`

### Values You Need to Provide ⚠️

- [ ] `NEXT_PUBLIC_SUPABASE_URL` = Get from [Supabase Dashboard](https://app.supabase.com) → Settings → API
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = Get from [Supabase Dashboard](https://app.supabase.com) → Settings → API
- [ ] `LLM_API_KEY` = Get from [OpenAI](https://platform.openai.com/api-keys) or [Google AI Studio](https://aistudio.google.com/app/apikey)
- [ ] `LLM_PROVIDER` = `openai` or `gemini`
- [ ] `NEXT_PUBLIC_BASE_URL` = Update after deployment with your actual service URL

---

## 📝 How to Add in Render

1. Go to **Render Dashboard** → Your Service → **Environment** tab
2. Click **"Add Environment Variable"**
3. Add each variable:
   - **Key:** `NEXT_PUBLIC_SUPABASE_URL`
   - **Value:** (paste your Supabase URL)
   - Click **"Save Changes"**
4. Repeat for all variables
5. **Redeploy** the service (or it will auto-deploy)

---

## 🔍 Verify Values Are Set

After adding all variables, check in Render Dashboard:

1. Go to **Environment** tab
2. Verify all variables are listed:
   - ✅ `NEXT_PUBLIC_SUPABASE_URL`
   - ✅ `SUPABASE_SERVICE_ROLE_KEY`
   - ✅ `LLM_API_KEY`
   - ✅ `LLM_PROVIDER`
   - ✅ `NODE_ENV`
   - ✅ `REDIS_URL`
   - ✅ `PUBSUB_ADAPTER`
   - ✅ `NEXT_PUBLIC_BASE_URL` (optional, update after deployment)

---

## ⚠️ Important Notes

1. **Supabase Keys:** Keep `SUPABASE_SERVICE_ROLE_KEY` secret - it has admin access
2. **LLM API Key:** Keep your `LLM_API_KEY` secret
3. **Redis URL:** Must match your other services exactly
4. **Base URL:** Update `NEXT_PUBLIC_BASE_URL` after deployment with your actual service URL

---

## 🆘 Need Help Getting Values?

### Supabase
- [Supabase Dashboard](https://app.supabase.com)
- Go to: **Settings** → **API**
- Copy **Project URL** and **service_role key**

### LLM API Keys
- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Gemini:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

---

**✅ Once you have all values, add them to Render and deploy!**


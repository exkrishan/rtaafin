# Setup Credentials Guide

## 🔑 Credentials You Need to Provide

Based on your setup, here are the credentials you need to provide:

### ✅ Already Generated (No Action Needed)
- **JWT Keys**: Generated in `scripts/keys/` (use for testing)

### 📋 Credentials You Need to Get

#### 1. **Supabase Credentials** (Required)
**Where to get:**
1. Go to your Supabase project: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

**Example:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://djuxbmchatnamqbkfjyi.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 2. **Google Gemini API Key** (Required)
**Where to get:**
1. Go to: https://aistudio.google.com/app/apikey
2. Click **Create API Key**
3. Copy the key → `LLM_API_KEY`

**Example:**
```bash
LLM_API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash
```

#### 3. **Deepgram API Key** (Required for ASR)
**Where to get:**
1. Go to: https://console.deepgram.com/
2. Sign up or log in
3. Go to **API Keys** section
4. Create a new API key
5. Copy the key → `DEEPGRAM_API_KEY`

**Example:**
```bash
DEEPGRAM_API_KEY=abc123def456ghi789jkl012mno345pqr678stu901vwx234
ASR_PROVIDER=deepgram
```

#### 4. **Redis Setup** (Required for Pub/Sub)
**Check if Redis is running:**
```bash
# Check if Redis is running
docker ps | grep redis
redis-cli ping
```

**If Redis is NOT running, start it:**
```bash
# Option 1: Docker (recommended)
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Option 2: Docker Compose (includes all services)
docker-compose -f docker-compose.pubsub.yml up -d
```

**Configuration:**
```bash
REDIS_URL=redis://localhost:6379
PUBSUB_ADAPTER=redis_streams
```

---

## 🚀 Quick Setup Steps

### Step 1: Get Your Credentials

Fill in these values:

1. **Supabase**:
   - [ ] `NEXT_PUBLIC_SUPABASE_URL` = `?`
   - [ ] `SUPABASE_SERVICE_ROLE_KEY` = `?`

2. **Gemini**:
   - [ ] `LLM_API_KEY` = `?`

3. **Deepgram**:
   - [ ] `DEEPGRAM_API_KEY` = `?`

4. **Redis**:
   - [ ] Check if running: `docker ps | grep redis`
   - [ ] If not, start: `docker run -d -p 6379:6379 redis:7-alpine`

### Step 2: Create .env.local

```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
cp .env.local.example .env.local
```

### Step 3: Fill in .env.local

Open `.env.local` and replace the placeholder values with your actual credentials.

**JWT Public Key:**
The JWT public key has been generated for you. Copy it from:
```bash
cat scripts/keys/jwt-public-key.pem
```

Paste the entire content (including `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----`) into `.env.local` as `JWT_PUBLIC_KEY`.

### Step 4: Verify Setup

```bash
# Check Redis
redis-cli ping
# Should return: PONG

# Check environment variables are loaded
node -e "require('dotenv').config({path:'.env.local'}); console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');"
```

---

## 📝 Complete .env.local Template

Once you have all credentials, your `.env.local` should look like:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://djuxbmchatnamqbkfjyi.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# LLM (Gemini)
LLM_API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash

# TLS (Dev only if needed)
ALLOW_INSECURE_TLS=false

# Pub/Sub (Redis)
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://localhost:6379
REDIS_CONSUMER_GROUP=agent-assist

# Ingestion Service
INGEST_PORT=8443
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----
USE_AUDIO_STREAM=true

# ASR Worker
ASR_PORT=3001
ASR_PROVIDER=deepgram
DEEPGRAM_API_KEY=abc123def456ghi789jkl012mno345pqr678stu901vwx234
BUFFER_WINDOW_MS=300
```

---

## 🔍 Verification Checklist

Before running, verify:

- [ ] Supabase URL and key are set
- [ ] Gemini API key is set
- [ ] Deepgram API key is set
- [ ] JWT public key is set (from `scripts/keys/jwt-public-key.pem`)
- [ ] Redis is running (`docker ps | grep redis` or `redis-cli ping`)
- [ ] All values in `.env.local` are filled (no `?` or placeholders)

---

## 🆘 Troubleshooting

### Redis Not Running
```bash
# Start Redis
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Verify
redis-cli ping
```

### Missing API Keys
- **Gemini**: https://aistudio.google.com/app/apikey
- **Deepgram**: https://console.deepgram.com/
- **Supabase**: https://supabase.com/dashboard → Your Project → Settings → API

### JWT Key Issues
The test keys are in `scripts/keys/`. For production, you'll need to generate your own or get them from your auth provider.

---

## 📞 Next Steps

Once you provide:
1. ✅ Supabase URL and Service Role Key
2. ✅ Gemini API Key
3. ✅ Deepgram API Key

I'll create your complete `.env.local` file and verify everything is set up correctly!


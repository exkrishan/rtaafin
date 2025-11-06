# 🚀 Quick Start Guide

## ✅ Environment Setup Complete!

All credentials have been configured in `.env.local`:

- ✅ **Supabase**: URL and Service Role Key
- ✅ **Gemini**: API Key for LLM
- ✅ **Deepgram**: API Key for ASR (`d65326fff430ad13ad6ad78acfe305a8d8c8245e`)
- ✅ **JWT**: Public key generated in `scripts/keys/`
- ✅ **Pub/Sub**: Redis Streams configured

---

## 🎯 Start Services (3 Steps)

### Step 1: Start Redis (Required)

```bash
# Start Redis container
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Verify it's running
docker ps | grep redis
# Should show: redis   Up X seconds   0.0.0.0:6379->6379/tcp
```

### Step 2: Install Dependencies (First Time Only)

```bash
# Root dependencies (Next.js app)
npm install

# Ingestion service
cd services/ingest && npm install && cd ../..

# ASR worker
cd services/asr-worker && npm install && cd ../..

# Pub/Sub library (if not already installed)
cd lib/pubsub && npm install && cd ../..
```

### Step 3: Start All Services

**Terminal 1 - Next.js App (Main UI):**
```bash
npm run dev
# → http://localhost:3000
```

**Terminal 2 - Ingestion Service (WebSocket):**
```bash
cd services/ingest
npm run dev
# → wss://localhost:8443/v1/ingest
```

**Terminal 3 - ASR Worker:**
```bash
cd services/asr-worker
npm run dev
# → Subscribes to audio, publishes transcripts
# → Metrics: http://localhost:3001/metrics
```

---

## 🧪 Test the Flow

### Test 1: Pub/Sub (Redis)
```bash
node scripts/pubsub_demo.ts
```

### Test 2: Ingestion Service
```bash
./scripts/simulate_exotel_client.sh
```

### Test 3: ASR Worker
```bash
node scripts/asr_worker_demo.ts
```

---

## 📋 Service Status

| Service | Port | Command | Status |
|---------|------|---------|--------|
| **Next.js** | 3000 | `npm run dev` | ✅ Ready |
| **Ingestion** | 8443 | `cd services/ingest && npm run dev` | ✅ Ready |
| **ASR Worker** | 3001 | `cd services/asr-worker && npm run dev` | ✅ Ready |
| **Redis** | 6379 | `docker run -d -p 6379:6379 redis:7-alpine` | ⚠️ **Start Now** |

---

## 🔍 Quick Verification

```bash
# Check all environment variables are loaded
node -e "
require('dotenv').config({path:'.env.local'});
const checks = {
  'Supabase URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
  'Supabase Key': process.env.SUPABASE_SERVICE_ROLE_KEY,
  'Gemini Key': process.env.LLM_API_KEY,
  'Deepgram Key': process.env.DEEPGRAM_API_KEY,
  'JWT Public Key': process.env.JWT_PUBLIC_KEY,
  'Redis URL': process.env.REDIS_URL,
  'Pub/Sub Adapter': process.env.PUBSUB_ADAPTER
};
Object.entries(checks).forEach(([name, val]) => {
  console.log(val ? '✅' : '❌', name);
});
"

# Check Redis
docker ps | grep redis || echo "⚠️  Redis not running - start it first!"
```

---

## 🆘 Troubleshooting

### Redis Connection Error
```bash
# Start Redis
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Or if container exists but stopped
docker start redis
```

### Port Already in Use
```bash
# Find and kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or for other ports
lsof -ti:8443 | xargs kill -9  # Ingestion
lsof -ti:3001 | xargs kill -9  # ASR Worker
```

### Missing Dependencies
```bash
# Install all dependencies
npm install
cd services/ingest && npm install && cd ../..
cd services/asr-worker && npm install && cd ../..
```

---

## 🎉 You're Ready!

1. ✅ **Start Redis**: `docker run -d -p 6379:6379 redis:7-alpine`
2. ✅ **Start Next.js**: `npm run dev`
3. ✅ **Start Ingestion**: `cd services/ingest && npm run dev`
4. ✅ **Start ASR Worker**: `cd services/asr-worker && npm run dev`

All services are configured and ready to run! 🚀


# ✅ Environment Setup Complete

## Configuration Status

Your `.env.local` has been updated with the Deepgram API key and all required service configurations.

### ✅ Configured Variables

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (from existing .env.local)
- **LLM (Gemini)**: `LLM_API_KEY` (from existing .env.local)
- **ASR (Deepgram)**: `DEEPGRAM_API_KEY` = `d65326fff430ad13ad6ad78acfe305a8d8c8245e` ✅ **Added**
- **JWT Keys**: Generated in `scripts/keys/jwt-public-key.pem`
- **Pub/Sub**: Redis Streams configuration
- **Service Ports**: Ingestion (8443), ASR Worker (3001)

---

## 🚀 Next Steps

### 1. Start Redis (Required for Pub/Sub)

```bash
# Option 1: Docker (recommended)
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Option 2: Docker Compose (includes all services)
docker-compose -f docker-compose.pubsub.yml up -d redis

# Verify Redis is running
docker ps | grep redis
# OR
redis-cli ping  # Should return: PONG
```

### 2. Verify Environment Variables

```bash
# Check all required variables are set
node -e "require('dotenv').config({path:'.env.local'}); 
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅' : '❌');
  console.log('Supabase Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
  console.log('Gemini Key:', process.env.LLM_API_KEY ? '✅' : '❌');
  console.log('Deepgram Key:', process.env.DEEPGRAM_API_KEY ? '✅' : '❌');
  console.log('JWT Public Key:', process.env.JWT_PUBLIC_KEY ? '✅' : '❌');
  console.log('Redis URL:', process.env.REDIS_URL || '❌');
  console.log('Pub/Sub Adapter:', process.env.PUBSUB_ADAPTER || '❌');
"
```

### 3. Start Services

#### Next.js App (Main UI)
```bash
npm run dev
# Runs on http://localhost:3000
```

#### Ingestion Service (WebSocket)
```bash
cd services/ingest
npm install
npm run dev
# Runs on wss://localhost:8443/v1/ingest
```

#### ASR Worker
```bash
cd services/asr-worker
npm install
npm run dev
# Subscribes to audio topics, publishes transcripts
# Metrics on http://localhost:3001/metrics
```

### 4. Test End-to-End Flow

```bash
# 1. Test Pub/Sub (Redis)
node scripts/pubsub_demo.ts

# 2. Test Ingestion Service
./scripts/simulate_exotel_client.sh

# 3. Test ASR Worker
node scripts/asr_worker_demo.ts
```

---

## 📋 Service Configuration Summary

| Service | Port | Status | Notes |
|---------|------|--------|-------|
| **Next.js App** | 3000 | ✅ Ready | Main UI, API routes |
| **Ingestion Service** | 8443 | ✅ Ready | WebSocket for audio ingestion |
| **ASR Worker** | 3001 | ✅ Ready | Transcribes audio → transcripts |
| **Redis** | 6379 | ⚠️ **Start Required** | Pub/Sub layer |

---

## 🔍 Troubleshooting

### Redis Not Running
```bash
# Check if Redis is running
docker ps | grep redis
redis-cli ping

# Start Redis
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

### Missing Environment Variables
```bash
# Verify .env.local exists and has all variables
cat .env.local | grep -E "(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|LLM_API_KEY|DEEPGRAM_API_KEY|JWT_PUBLIC_KEY|REDIS_URL)"
```

### Port Conflicts
```bash
# Check if ports are in use
lsof -ti:3000  # Next.js
lsof -ti:8443  # Ingestion
lsof -ti:3001  # ASR Worker
lsof -ti:6379  # Redis

# Kill processes if needed
lsof -ti:3000 | xargs kill -9
```

---

## ✅ Verification Checklist

Before running services, verify:

- [x] Supabase URL and Service Role Key are set
- [x] Gemini API Key is set
- [x] Deepgram API Key is set (`d65326fff430ad13ad6ad78acfe305a8d8c8245e`)
- [x] JWT Public Key is set (from `scripts/keys/jwt-public-key.pem`)
- [x] Redis URL is configured (`redis://localhost:6379`)
- [x] Pub/Sub Adapter is set (`redis_streams`)
- [ ] **Redis is running** (start with Docker)
- [ ] All services can start without errors

---

## 🎯 Ready to Run!

Once Redis is started, you can run all services and test the complete flow:

1. **Start Redis**: `docker run -d -p 6379:6379 redis:7-alpine`
2. **Start Next.js**: `npm run dev`
3. **Start Ingestion**: `cd services/ingest && npm run dev`
4. **Start ASR Worker**: `cd services/asr-worker && npm run dev`

All services are now configured and ready! 🚀


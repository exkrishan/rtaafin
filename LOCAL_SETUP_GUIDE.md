# 🚀 Complete Local Setup Guide

## Quick Start

### Option 1: Automated (Recommended)

```bash
# Start all services
./start-all-services.sh

# Stop all services
./stop-all-services.sh
```

### Option 2: Manual

Start each service in a separate terminal:

**Terminal 1 - Next.js App:**
```bash
npm run dev
# → http://localhost:3000
```

**Terminal 2 - Ingestion Service:**
```bash
cd services/ingest
npm run dev
# → wss://localhost:8443/v1/ingest
```

**Terminal 3 - ASR Worker:**
```bash
cd services/asr-worker
npm run dev
# → http://localhost:3001/metrics
```

---

## Prerequisites

### 1. Node.js 20+

```bash
# Check version
node -v

# If < 20, use nvm
nvm use 20
```

### 2. Environment Variables

Make sure `.env.local` exists with all required variables:

```bash
# Check if file exists
ls -la .env.local

# If not, create from template
cp .env.local.example .env.local
# Then fill in your credentials
```

**Required Variables:**
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `LLM_API_KEY` (Gemini)
- ✅ `DEEPGRAM_API_KEY`
- ✅ `JWT_PUBLIC_KEY`
- ✅ `PUBSUB_ADAPTER=in_memory` (no Redis needed)

### 3. Dependencies

The startup script will install dependencies automatically, or install manually:

```bash
# Root dependencies
npm install

# Ingestion service
cd services/ingest && npm install && cd ../..

# ASR worker
cd services/asr-worker && npm install && cd ../..

# Pub/Sub library
cd lib/pubsub && npm install && cd ../..
```

---

## Verification

### Check All Services Are Running

```bash
# Check Next.js
curl http://localhost:3000

# Check Ingestion
curl http://localhost:8443/health

# Check ASR Worker
curl http://localhost:3001/health
```

### Expected Responses

- **Next.js**: HTML page or API response
- **Ingestion**: `{"status":"ok","service":"ingest"}`
- **ASR Worker**: `{"status":"ok","service":"asr-worker"}`

---

## Testing the Complete Flow

### 1. Test Transcript Flow (Recommended)

```bash
npx tsx scripts/test-transcript-flow.ts
```

**Expected Output:**
```
✅ Credit Card Block - Intent Detection
✅ Credit Card Block - KB Articles
✅ Account Balance - Intent Detection
✅ Account Balance - KB Articles
✅ Debit Card - Intent Detection
✅ Debit Card - KB Articles

🎉 All tests passed!
```

### 2. Test WebSocket Ingestion

```bash
# Generate JWT token
node scripts/generate-test-jwt.js

# Test WebSocket connection
cd services/ingest
JWT_TOKEN="<token-from-above>"
export JWT_TOKEN
./scripts/simulate_exotel_client.sh
```

### 3. Test Complete Flow

```bash
npx tsx scripts/test-complete-flow.ts
```

---

## Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **Next.js App** | http://localhost:3000 | Main UI, API routes |
| **Ingestion (WSS)** | wss://localhost:8443/v1/ingest | WebSocket audio ingestion |
| **Ingestion Health** | http://localhost:8443/health | Health check |
| **ASR Worker Metrics** | http://localhost:3001/metrics | Prometheus metrics |
| **ASR Worker Health** | http://localhost:3001/health | Health check |

---

## Monitoring Services

### View Logs

**Using startup script:**
```bash
# Next.js
tail -f /tmp/rtaa-nextjs.log

# Ingestion
tail -f /tmp/rtaa-ingest.log

# ASR Worker
tail -f /tmp/rtaa-asr.log
```

**Manual (if started manually):**
- Logs appear in the terminal where you started each service

### Check Service Status

```bash
# Check if processes are running
ps aux | grep -E "(next|ingest|asr-worker)" | grep -v grep

# Check port usage
lsof -ti:3000  # Next.js
lsof -ti:8443  # Ingestion
lsof -ti:3001  # ASR Worker
```

---

## Troubleshooting

### Port Already in Use

```bash
# Kill processes on ports
lsof -ti:3000 | xargs kill -9
lsof -ti:8443 | xargs kill -9
lsof -ti:3001 | xargs kill -9

# Or use the stop script
./stop-all-services.sh
```

### Service Not Starting

1. **Check Node.js version:**
   ```bash
   node -v  # Should be 20+
   ```

2. **Check dependencies:**
   ```bash
   npm install
   cd services/ingest && npm install && cd ../..
   cd services/asr-worker && npm install && cd ../..
   ```

3. **Check environment variables:**
   ```bash
   # Verify .env.local exists
   ls -la .env.local
   
   # Check key variables
   grep -E "(SUPABASE|LLM_API_KEY|DEEPGRAM|JWT_PUBLIC_KEY)" .env.local
   ```

### Service Not Responding

1. **Check service logs** (see Monitoring section above)
2. **Verify service is running:**
   ```bash
   curl http://localhost:8443/health
   curl http://localhost:3001/health
   ```
3. **Restart the service:**
   ```bash
   ./stop-all-services.sh
   ./start-all-services.sh
   ```

### Intent Detection Issues

If intent detection returns "unknown":
1. Check `LLM_API_KEY` is set in `.env.local`
2. Verify Gemini API key is valid
3. Check Next.js logs for API errors

### WebSocket Authentication Fails

If you get 401 errors:
1. Check ingestion service logs for detailed error
2. Verify `JWT_PUBLIC_KEY` is set correctly in `.env.local`
3. Generate a new token: `node scripts/generate-test-jwt.js`
4. Check service logs: `tail -f /tmp/rtaa-ingest.log`

---

## Development Workflow

### 1. Start Services

```bash
./start-all-services.sh
```

### 2. Make Code Changes

Edit files as needed. Services will auto-reload (if using `npm run dev`).

### 3. Test Changes

```bash
# Test transcript flow
npx tsx scripts/test-transcript-flow.ts

# Test specific API
curl http://localhost:3000/api/calls/ingest-transcript \
  -H "Content-Type: application/json" \
  -d '{"callId":"test","seq":1,"ts":"2024-01-01T00:00:00Z","text":"customer: test"}'
```

### 4. Stop Services

```bash
./stop-all-services.sh
```

---

## Complete Test Checklist

- [ ] All services start successfully
- [ ] Next.js responds at http://localhost:3000
- [ ] Ingestion health check passes
- [ ] ASR Worker health check passes
- [ ] Transcript flow test passes (6/6)
- [ ] Intent detection works correctly
- [ ] KB articles are returned
- [ ] WebSocket connection works (if auth is fixed)

---

## Quick Reference

```bash
# Start everything
./start-all-services.sh

# Stop everything
./stop-all-services.sh

# Test transcript flow
npx tsx scripts/test-transcript-flow.ts

# Generate JWT token
node scripts/generate-test-jwt.js

# Check service health
curl http://localhost:8443/health
curl http://localhost:3001/health

# View logs
tail -f /tmp/rtaa-nextjs.log
tail -f /tmp/rtaa-ingest.log
tail -f /tmp/rtaa-asr.log
```

---

## Next Steps

1. ✅ **Start all services**: `./start-all-services.sh`
2. ✅ **Verify services**: Check health endpoints
3. ✅ **Run tests**: `npx tsx scripts/test-transcript-flow.ts`
4. ✅ **Open UI**: http://localhost:3000
5. ✅ **Monitor logs**: Use `tail -f` commands above

You're all set! 🎉


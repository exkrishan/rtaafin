# 🏠 Running RTAA Locally

## One-Command Start

```bash
./start-all-services.sh
```

That's it! This will:
- ✅ Check prerequisites
- ✅ Install dependencies if needed
- ✅ Start all 3 services (Next.js, Ingestion, ASR Worker)
- ✅ Verify they're running
- ✅ Show you all the URLs and log locations

## One-Command Stop

```bash
./stop-all-services.sh
```

## What Gets Started

1. **Next.js App** (port 3000)
   - Main web UI
   - API routes
   - Transcript ingestion
   - Intent detection
   - KB article surfacing

2. **Ingestion Service** (port 8443)
   - WebSocket server for audio
   - JWT authentication
   - Pub/Sub publishing

3. **ASR Worker** (port 3001)
   - Audio transcription
   - Transcript publishing
   - Metrics endpoint

## Quick Test

After starting services, test the complete flow:

```bash
npx tsx scripts/test-transcript-flow.ts
```

## Full Documentation

See `LOCAL_SETUP_GUIDE.md` for:
- Detailed setup instructions
- Troubleshooting guide
- Service monitoring
- Development workflow

## Quick Reference

```bash
# Start
./start-all-services.sh

# Test
npx tsx scripts/test-transcript-flow.ts

# Stop
./stop-all-services.sh

# View logs
tail -f /tmp/rtaa-nextjs.log
tail -f /tmp/rtaa-ingest.log
tail -f /tmp/rtaa-asr.log
```

---

**That's all you need to know!** 🚀


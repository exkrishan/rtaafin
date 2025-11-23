# 🎯 Production Demo Testing Report

## Services on Render

| Service | URL | Status |
|---------|-----|--------|
| Frontend | `https://frontend-8jdd.onrender.com` | ⚠️ Testing |
| ASR Worker | `https://rtaa-asr-worker.onrender.com` | ⚠️ Testing |
| Ingest | `https://rtaa-ingest.onrender.com` | ⚠️ Testing |

## Testing Checklist

### ✅ Critical Services for Demo

1. **Frontend Service**
   - Health: `/api/health`
   - Production UI: `/test-agent-assist`
   - Status: ⚠️ Needs verification

2. **ASR Worker**
   - Health: `/health`
   - Metrics: `/metrics`
   - Status: ⚠️ Needs verification

3. **Transcript Consumer**
   - Status API: `/api/transcripts/status`
   - Should be running in frontend service
   - Status: ⚠️ Needs verification

### 🔄 Transcript Flow

1. **Audio → ASR Worker**
   - ASR Worker receives audio from Exotel
   - Processes with ElevenLabs
   - Publishes transcripts to Redis

2. **Redis → Transcript Consumer**
   - Consumer reads from Redis streams
   - Forwards to `/api/calls/ingest-transcript`

3. **Ingest API → Frontend**
   - Detects intent (Gemini)
   - Fetches KB articles
   - Broadcasts via SSE

4. **SSE → UI**
   - Frontend subscribes to `/api/events/stream`
   - Receives `transcript_line` events
   - Displays in UI

### 📋 Pre-Demo Checklist

- [ ] Frontend is accessible
- [ ] ASR Worker is running
- [ ] Transcript Consumer is running
- [ ] Redis connection is working
- [ ] Gemini API key is configured
- [ ] KB search is working
- [ ] Intent detection is working
- [ ] SSE stream is accessible
- [ ] Production UI loads correctly

## Testing Commands

### Quick Health Check
```bash
# Frontend
curl https://frontend-8jdd.onrender.com/api/health

# ASR Worker
curl https://rtaa-asr-worker.onrender.com/health

# Transcript Consumer Status
curl https://frontend-8jdd.onrender.com/api/transcripts/status

# Active Calls
curl https://frontend-8jdd.onrender.com/api/calls/active?limit=10
```

### Test Transcript Ingestion
```bash
curl -X POST https://frontend-8jdd.onrender.com/api/calls/ingest-transcript \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: default" \
  -d '{
    "callId": "test-demo-123",
    "seq": 1,
    "ts": "2025-01-17T12:00:00.000Z",
    "text": "Customer: I need to block my credit card due to fraud"
  }'
```

### Test KB Search
```bash
curl "https://frontend-8jdd.onrender.com/api/kb/search?q=credit+card+fraud&tenantId=default"
```

## Demo Flow

1. **Start Demo**
   - Go to: `https://frontend-8jdd.onrender.com/test-agent-assist`
   - Enter Interaction ID (or use auto-discovery)
   - Click to start monitoring

2. **Expected Behavior**
   - Transcripts appear in real-time
   - KB suggestions appear when intent is detected
   - Disposition modal opens at end of call

3. **Troubleshooting**
   - If transcripts don't appear: Check ASR Worker logs
   - If KB doesn't appear: Check Gemini API key
   - If SSE fails: Check Redis connection

## Environment Variables to Verify

### Frontend Service
- `REDIS_URL` - Redis connection string
- `PUBSUB_ADAPTER=redis_streams`
- `GEMINI_API_KEY` - Gemini API key
- `LLM_PROVIDER=gemini`
- `GEMINI_MODEL=gemini-2.0-flash`
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service key

### ASR Worker
- `ELEVENLABS_API_KEY` - ElevenLabs API key
- `ASR_PROVIDER=elevenlabs`
- `REDIS_URL` - Redis connection string
- `PUBSUB_ADAPTER=redis_streams`

## Notes

- Render free tier services may sleep after inactivity
- First request may take 30-60 seconds to wake up
- Services should auto-deploy on git push
- Check Render dashboard for deployment status


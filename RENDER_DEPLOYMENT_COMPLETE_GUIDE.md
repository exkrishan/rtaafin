# Render Deployment Complete Guide - End-to-End Setup

**Status:** ✅ Ready for Production Deployment  
**Last Updated:** 2025-11-23

---

## Overview

This guide provides complete instructions for deploying all three services to Render:
1. **Ingest Service** - Receives Exotel WebSocket connections
2. **ASR Worker** - Processes audio and generates transcripts
3. **Frontend Service** - Next.js app with UI and API routes

---

## Prerequisites

- ✅ Render account (free tier works)
- ✅ GitHub repository access
- ✅ Redis Cloud account (or Redis instance)
- ✅ Supabase project with database tables configured
- ✅ ElevenLabs API key
- ✅ Gemini API key (for intent detection and disposition)

---

## Service 1: Ingest Service

### Purpose
Receives Exotel WebSocket connections and publishes audio to Redis.

### Render Configuration

**Service Type:** Web Service  
**Environment:** Node  
**Region:** Choose closest to your users (e.g., `Oregon (US West)`)  
**Branch:** `feat/exotel-deepgram-bridge` (or your main branch)  
**Root Directory:** `services/ingest` ⚠️ **CRITICAL**

**Build Command:**
```bash
cd ../.. && npm ci && cd services/ingest && npm run build
```

**Start Command:**
```bash
npm run start
```

**Node Version:** `20.x`

**Health Check Path:** `/health`  
**Health Check Interval:** `30 seconds`

### Environment Variables

Add these in Render Dashboard → Environment:

| Key | Value | Required | Notes |
|-----|-------|----------|-------|
| `REDIS_URL` | `redis://...` | ✅ Yes | Redis Cloud connection string |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes | Must be `redis_streams` |
| `SUPPORT_EXOTEL` | `true` | ✅ Yes | Enable Exotel protocol support |
| `JWT_PUBLIC_KEY` | `-----BEGIN PUBLIC KEY...` | ❌ Optional | Only if not using IP whitelist |
| `PORT` | - | ❌ Auto-set | Render sets this automatically |

### Public WebSocket URL for Exotel

After deployment, your service will have a public URL like:
```
https://rtaa-ingest.onrender.com
```

**WebSocket URL for Exotel:**
```
wss://rtaa-ingest.onrender.com/v1/ingest
```

**Configure in Exotel Dashboard:**
1. Go to Exotel Dashboard → Settings → Webhooks/Streaming
2. Set **Media Stream URL** or **WebSocket Stream URL** to:
   ```
   wss://rtaa-ingest.onrender.com/v1/ingest
   ```
3. Save configuration

### Verification

1. **Health Check:**
   ```bash
   curl https://rtaa-ingest.onrender.com/health
   ```
   Expected: `{"status":"ok","service":"ingest",...}`

2. **WebSocket Test:**
   ```bash
   wscat -c wss://rtaa-ingest.onrender.com/v1/ingest
   ```
   Should connect successfully (may require authentication if JWT is enabled)

---

## Service 2: ASR Worker

### Purpose
Processes audio from Redis and generates transcripts using ElevenLabs.

### Render Configuration

**Service Type:** Web Service  
**Environment:** Node  
**Region:** Same as Ingest Service (for low latency)  
**Branch:** `feat/exotel-deepgram-bridge`  
**Root Directory:** `services/asr-worker` ⚠️ **CRITICAL**

**Build Command:**
```bash
cd ../.. && npm ci && cd services/asr-worker && npm run build
```

**Start Command:**
```bash
npm run start
```

**Node Version:** `20.x`

**Health Check Path:** `/health`  
**Health Check Interval:** `30 seconds`

### Environment Variables

| Key | Value | Required | Notes |
|-----|-------|----------|-------|
| `REDIS_URL` | `redis://...` | ✅ Yes | Same Redis as Ingest Service |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes | Must be `redis_streams` |
| `ASR_PROVIDER` | `elevenlabs` | ✅ Yes | Must be `elevenlabs` |
| `ELEVENLABS_API_KEY` | `...` | ✅ Yes | Your ElevenLabs API key |
| `PORT` | - | ❌ Auto-set | Render sets this automatically |

### Verification

1. **Health Check:**
   ```bash
   curl https://rtaa-asr-worker.onrender.com/health
   ```
   Expected: `{"status":"ok","service":"asr-worker","provider":"elevenlabs",...}`

2. **Metrics:**
   ```bash
   curl https://rtaa-asr-worker.onrender.com/metrics
   ```
   Should return Prometheus metrics

---

## Service 3: Frontend Service

### Purpose
Next.js app with UI, API routes, transcript consumer, intent detection, and KB articles.

### Render Configuration

**Service Type:** Web Service  
**Environment:** Node  
**Region:** Same as other services  
**Branch:** `feat/exotel-deepgram-bridge`  
**Root Directory:** `/` (repo root) ⚠️ **CRITICAL**

**Build Command:**
```bash
npm ci && npm run build
```

**Start Command:**
```bash
npm run start
```

**Node Version:** `20.x`

**Health Check Path:** `/api/health` ⚠️ **REQUIRED**  
**Health Check Interval:** `30 seconds`

### Environment Variables

| Key | Value | Required | Notes |
|-----|-------|----------|-------|
| `SUPABASE_URL` | `https://...` | ✅ Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `...` | ✅ Yes | Supabase service role key |
| `REDIS_URL` | `redis://...` | ✅ Yes | Same Redis as other services |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes | Must be `redis_streams` |
| `GEMINI_API_KEY` | `AIzaSy...` | ✅ Yes | Gemini API key for intent/disposition |
| `LLM_PROVIDER` | `gemini` | ✅ Yes | Must be `gemini` |
| `GEMINI_MODEL` | `gemini-2.0-flash` | ✅ Yes | Gemini model name |
| `NEXT_PUBLIC_BASE_URL` | `https://...` | ✅ Yes | Frontend public URL (for internal API calls) |
| `PORT` | - | ❌ Auto-set | Render sets this automatically |

**Important:** Set `NEXT_PUBLIC_BASE_URL` to your frontend service URL after deployment:
```
NEXT_PUBLIC_BASE_URL=https://rtaa-frontend.onrender.com
```

### Verification

1. **Health Check:**
   ```bash
   curl https://rtaa-frontend.onrender.com/api/health
   ```
   Expected: `{"status":"ok","service":"frontend",...}`

2. **Transcript Consumer Status:**
   ```bash
   curl https://rtaa-frontend.onrender.com/api/transcripts/status
   ```
   Expected: `{"ok":true,"isRunning":true,...}`

3. **UI Access:**
   Open in browser:
   ```
   https://rtaa-frontend.onrender.com/test-agent-assist
   ```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All code committed and pushed to GitHub
- [ ] All environment variables documented
- [ ] Redis Cloud instance created and accessible
- [ ] Supabase project configured with all tables
- [ ] ElevenLabs API key obtained
- [ ] Gemini API key obtained

### Deployment Steps

1. **Deploy Ingest Service:**
   - [ ] Create new Web Service on Render
   - [ ] Configure build/start commands
   - [ ] Set root directory to `services/ingest`
   - [ ] Add all environment variables
   - [ ] Deploy and verify health check
   - [ ] Note the public URL

2. **Deploy ASR Worker:**
   - [ ] Create new Web Service on Render
   - [ ] Configure build/start commands
   - [ ] Set root directory to `services/asr-worker`
   - [ ] Add all environment variables
   - [ ] Deploy and verify health check

3. **Deploy Frontend Service:**
   - [ ] Create new Web Service on Render
   - [ ] Configure build/start commands
   - [ ] Set root directory to `/` (repo root)
   - [ ] Add all environment variables
   - [ ] Set `NEXT_PUBLIC_BASE_URL` to frontend URL
   - [ ] Deploy and verify health check

4. **Configure Exotel:**
   - [ ] Get Ingest Service WebSocket URL
   - [ ] Configure in Exotel Dashboard
   - [ ] Test WebSocket connection

### Post-Deployment Verification

- [ ] All three services show "Live" status in Render
- [ ] All health checks return 200 OK
- [ ] Transcript consumer is running (check `/api/transcripts/status`)
- [ ] Exotel can connect to WebSocket URL
- [ ] Test call: Transcripts appear in UI
- [ ] Test call: Intent detection works
- [ ] Test call: KB articles surface
- [ ] Test call: Disposition modal opens on call end

---

## End-to-End Flow Verification

### Flow 1: Real-Time Transcripts → UI

```
Exotel → Ingest Service (wss://ingest.onrender.com/v1/ingest)
  → Redis Stream: audio_stream
  → ASR Worker (subscribes to audio_stream)
  → ElevenLabs ASR
  → Transcript received → Published to Redis
  → Redis Stream: transcript.{interactionId}
  → Transcript Consumer (auto-discovered)
  → POST /api/calls/ingest-transcript
  → SSE Broadcast (lib/realtime.ts)
  → Frontend UI (components/AgentAssistPanelV2.tsx)
```

**Verification Steps:**
1. Start a call from Exotel
2. Check Ingest Service logs: Should see WebSocket connection
3. Check ASR Worker logs: Should see audio processing and transcript publishing
4. Check Frontend logs: Should see transcript consumer processing
5. Check UI: Transcripts should appear in real-time

### Flow 2: Intent Detection → KB Articles

```
Transcript received → /api/calls/ingest-transcript
  → detectIntent() (lib/intent.ts) - Gemini API
  → Store in intents table
  → getKbAdapter() (lib/kb-adapter.ts)
  → dbAdapter.search() - Query kb_articles table
  → Broadcast intent_update event via SSE
  → UI displays KB articles
```

**Verification Steps:**
1. Send a meaningful transcript (e.g., "I need to block my credit card")
2. Check Frontend logs: Should see intent detection call to Gemini
3. Check Supabase: Should see entry in `intents` table
4. Check UI: KB articles should appear in right panel

### Flow 3: Disposition Generation

```
Call End → POST /api/calls/end
  → Fetch complete transcript from ingest_events
  → generateCallSummary() (lib/summary.ts) - Gemini API
  → Map to dispositions_master taxonomy
  → Store in auto_notes table
  → Broadcast call_end event via SSE
  → UI opens disposition modal
  → Agent selects disposition
  → POST /api/calls/[interactionId]/disposition
  → Save to call_dispositions table
```

**Verification Steps:**
1. End a call
2. Check Frontend logs: Should see disposition generation
3. Check Supabase: Should see entry in `auto_notes` table
4. Check UI: Disposition modal should open automatically
5. Select disposition and save
6. Check Supabase: Should see entry in `call_dispositions` table

---

## Troubleshooting

### Ingest Service Issues

**Problem:** Health check fails  
**Solution:** Check Redis connection, verify `REDIS_URL` is correct

**Problem:** Exotel can't connect  
**Solution:** 
- Verify `SUPPORT_EXOTEL=true` is set
- Check WebSocket URL is correct: `wss://...onrender.com/v1/ingest`
- Verify Render service is "Live" (not sleeping)

### ASR Worker Issues

**Problem:** No transcripts generated  
**Solution:**
- Check `ELEVENLABS_API_KEY` is set correctly
- Check ASR Worker logs for errors
- Verify audio is being received from Redis

**Problem:** Transcripts queued but not published  
**Solution:** 
- This should be fixed with the background processor
- Check ASR Worker logs for "Processed queued transcript" messages

### Frontend Service Issues

**Problem:** Transcripts not appearing in UI  
**Solution:**
- Check transcript consumer status: `/api/transcripts/status`
- Verify SSE connection in browser DevTools
- Check `callId`/`interactionId` consistency

**Problem:** Intent detection not working  
**Solution:**
- Verify `GEMINI_API_KEY` is set
- Check `LLM_PROVIDER=gemini`
- Check Frontend logs for Gemini API errors

**Problem:** KB articles not surfacing  
**Solution:**
- Verify intent detection is working
- Check `kb_articles` table has data
- Verify KB adapter is configured correctly

---

## Service URLs Summary

After deployment, you'll have:

- **Ingest Service:** `https://rtaa-ingest.onrender.com`
  - WebSocket: `wss://rtaa-ingest.onrender.com/v1/ingest`
  - Health: `https://rtaa-ingest.onrender.com/health`

- **ASR Worker:** `https://rtaa-asr-worker.onrender.com`
  - Health: `https://rtaa-asr-worker.onrender.com/health`
  - Metrics: `https://rtaa-asr-worker.onrender.com/metrics`

- **Frontend Service:** `https://rtaa-frontend.onrender.com`
  - UI: `https://rtaa-frontend.onrender.com/test-agent-assist`
  - Health: `https://rtaa-frontend.onrender.com/api/health`
  - Transcript Status: `https://rtaa-frontend.onrender.com/api/transcripts/status`

---

## Keep-Alive Configuration

Render free-tier services sleep after 15 minutes of inactivity. To prevent this:

1. **Use GitHub Actions Keep-Alive Workflow:**
   - Already configured in `.github/workflows/keep-alive.yml`
   - Runs every 10 minutes
   - Pings all service health endpoints

2. **Manual Keep-Alive:**
   ```bash
   curl https://rtaa-ingest.onrender.com/health
   curl https://rtaa-asr-worker.onrender.com/health
   curl https://rtaa-frontend.onrender.com/api/health
   ```

---

## Success Criteria

✅ All three services deploy successfully  
✅ All health checks return 200 OK  
✅ Exotel can connect to WebSocket URL  
✅ Transcripts appear in UI in real-time (< 2 second latency)  
✅ Intent detection triggers for meaningful transcripts  
✅ KB articles surface based on detected intent  
✅ Disposition modal opens automatically on call end  
✅ No data loss or corruption  
✅ Existing functionality preserved  

---

**Ready for production deployment!** 🚀


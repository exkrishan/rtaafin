# Exotel End-to-End Pipeline Test Guide

This guide provides step-by-step instructions for testing the complete Exotel pipeline, from audio ingestion through transcription to frontend display.

## Architecture Overview

```
Exotel (Simulated) 
  → Render Ingest Service (wss://rtaa-ingest-service.onrender.com/v1/ingest)
  → Redis (audio_stream topic)
  → Local ASR Worker (subscribes to audio_stream)
  → ElevenLabs API (transcription)
  → Redis (transcript.{interaction_id} topic)
  → Transcript Consumer (Next.js)
  → /api/calls/ingest-transcript
  → SSE Broadcast
  → Frontend UI (http://localhost:3000/live)
```

## Prerequisites Checklist

Before running the test, ensure all prerequisites are met:

### 1. Services Running

- [ ] **Render Ingest Service**: Deployed and healthy at `https://rtaa-ingest-service.onrender.com`
- [ ] **Local ASR Worker**: Running on `http://localhost:3001` with ElevenLabs configured
- [ ] **Next.js App (Transcript Consumer)**: Running on `http://localhost:3000`
- [ ] **Redis**: Accessible and shared between Render Ingest and Local ASR Worker

### 2. Environment Variables

**Local ASR Worker:**
```bash
ASR_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=sk_...
REDIS_URL=redis://...
PUBSUB_ADAPTER=redis_streams
```

**Next.js App:**
```bash
REDIS_URL=redis://...  # Same as ASR Worker
```

**Render Ingest Service:**
- Verify in Render Dashboard that `REDIS_URL` is set to the same Redis instance

### 3. Configuration Verification

- [ ] Exotel bridge is enabled in Render Ingest Service (`/health` endpoint should show `exotelBridge: "enabled"`)
- [ ] ASR Worker is using ElevenLabs provider (not mock)
- [ ] ElevenLabs API key is valid and has Speech-to-Text access
- [ ] All services are using the same `REDIS_URL`

## Test Execution Steps

### Step 1: Pre-Flight Health Checks

Run the health verification script to ensure all services are ready:

```bash
npx tsx scripts/verify-pipeline-health.ts
```

**Expected Output:**
```
✅ Render Ingest Service: Service is healthy, Exotel bridge enabled
✅ Local ASR Worker: Service is healthy, ASR provider: elevenlabs
✅ Transcript Consumer: Consumer is running, X active subscription(s)
✅ Redis Connection: Successfully connected to Redis, audio_stream exists
⏭️  Redis URL Consistency: Manual verification required
✅ ElevenLabs Configuration: ElevenLabs API key configured and connection available
```

**If any checks fail:**
- Fix the issues before proceeding
- Verify service URLs and environment variables
- Check service logs for errors

### Step 2: Run End-to-End Test

Execute the complete E2E test orchestrator:

```bash
npx tsx scripts/test-exotel-e2e.ts
```

**What it does:**
1. Runs pre-flight health checks
2. Simulates Exotel connection to Render service
3. Sends 20 seconds of audio (configurable via `DURATION_SEC`)
4. Monitors ASR Worker metrics
5. Verifies transcripts are generated and published to Redis
6. Checks Transcript Consumer status
7. Generates comprehensive test report

**Expected Output:**
```
🧪 Exotel End-to-End Pipeline Test
============================================================
   Render Ingest: https://rtaa-ingest-service.onrender.com
   Local ASR Worker: http://localhost:3001
   Transcript Consumer: http://localhost:3000
   WebSocket URL: wss://rtaa-ingest-service.onrender.com/v1/ingest
   Audio Duration: 20 seconds
============================================================

1️⃣  Running Pre-flight Health Checks...
   ✅ Health checks passed

2️⃣  Starting Exotel Simulation...
   ✅ Simulation completed: 1000 frames sent

3️⃣  Checking ASR Worker Metrics...
   ✅ ASR Worker shows activity

4️⃣  Verifying Transcripts...
   📥 Received transcript: type=partial, text="Hello, this is a test..."
   ✅ Received 5 transcript(s) with text (total: 12)

5️⃣  Checking Transcript Consumer Status...
   ✅ Consumer is running, 1 active subscription(s)

📊 Test Report
============================================================
   Success: ✅
   Interaction ID: call_1234567890_abc123
   Duration: 25.34s
   Stages: 5/5 passed
```

### Step 3: Manual Verification (Optional)

For more detailed monitoring, you can run individual scripts:

#### Monitor Redis Streams

```bash
# Monitor both audio and transcripts
npx tsx scripts/monitor-redis-streams.ts --duration 30

# Monitor specific interaction
npx tsx scripts/monitor-redis-streams.ts --interaction-id call_1234567890_abc123 --duration 30

# Monitor only audio stream
npx tsx scripts/monitor-redis-streams.ts --audio-only --duration 30

# Monitor only transcripts
npx tsx scripts/monitor-redis-streams.ts --transcript-only --duration 30
```

#### Run Exotel Simulation Only

```bash
# Use default Render URL
npx tsx scripts/test-exotel-complete-pipeline.ts --duration 20

# Use custom URL
npx tsx scripts/test-exotel-complete-pipeline.ts --url wss://rtaa-ingest-service.onrender.com/v1/ingest --duration 20

# Use audio file
npx tsx scripts/test-exotel-complete-pipeline.ts --file /path/to/audio.pcm --duration 20
```

## Expected Logs at Each Stage

### Render Ingest Service Logs

```
[exotel] WebSocket connection opened
[exotel] Received connected event
[exotel] Received start event: { call_sid: 'call_...', stream_sid: 'stream_...' }
[exotel] Received media event: { chunk: 1, payload: '...' }
[exotel] Published audio frame to Redis: { interaction_id: 'call_...', seq: 1 }
[exotel] Received stop event
[exotel] WebSocket connection closed
```

### Local ASR Worker Logs

```
[ASRWorker] 📨 Message received from Redis for topic audio_stream
  interaction_id: call_...
  seq: 1
  has_audio: true
  audio_length: 320
[ASRWorker] Processing audio chunk: { interactionId: 'call_...', seq: 1, duration: 20ms }
[ElevenLabsProvider] ✅ Connection opened for call_...
[ElevenLabsProvider] Session started for call_...
[ElevenLabsProvider] 📝 Received transcript: type=partial, text="Hello..."
[ASRWorker] Published transcript: { interaction_id: 'call_...', type: 'partial', text: 'Hello...' }
```

### Transcript Consumer Logs

```
[TranscriptConsumer] Auto-discovered transcript stream: transcript.call_...
[TranscriptConsumer] Subscribing to transcript topic: transcript.call_...
[TranscriptConsumer] Received transcript message
  interaction_id: call_...
  textLength: 25
  textPreview: "Hello, this is a test..."
[TranscriptConsumer] ✅ Forwarded transcript successfully
```

### Frontend Logs (Browser Console)

```
[TestUI] Received SSE event: {type: 'transcript_line', text: 'Hello, this is a test...'}
[TestUI] Transcript count: 1
```

## Verification Points

### ✅ Exotel WebSocket Connection

- [ ] WebSocket connection established to Render service
- [ ] `connected` event sent and received
- [ ] `start` event sent with proper format
- [ ] `media` events sent with base64-encoded PCM16 audio
- [ ] `stop` event sent when done

### ✅ Audio Flow Through Pipeline

- [ ] Audio frames published to Redis `audio_stream` topic
- [ ] ASR Worker receives audio from Redis
- [ ] Audio chunks are properly formatted (PCM16, 8kHz, 20ms frames)

### ✅ ElevenLabs Transcription

- [ ] ElevenLabs WebSocket connection established
- [ ] Session started successfully
- [ ] Audio chunks sent to ElevenLabs
- [ ] Transcripts received (both partial and committed)
- [ ] Transcripts contain actual text (not empty)

### ✅ Transcript Publishing

- [ ] Transcripts published to Redis `transcript.{interaction_id}` topic
- [ ] Transcript format is correct (type, text, confidence, etc.)
- [ ] Both partial and final transcripts are published

### ✅ Transcript Consumer

- [ ] Consumer discovers transcript streams automatically
- [ ] Consumer subscribes to transcript topics
- [ ] Consumer receives transcript messages
- [ ] Consumer forwards transcripts to `/api/calls/ingest-transcript`

### ✅ Frontend Display

- [ ] Transcripts appear in UI at `/live` page
- [ ] Transcripts update in real-time
- [ ] Transcripts are readable and accurate
- [ ] Intent detection triggers (if configured)
- [ ] KB articles surface (if configured)

## Troubleshooting Guide

### Issue: Health Checks Fail

**Symptoms:**
- `verify-pipeline-health.ts` reports failures

**Solutions:**
1. **Render Ingest Service not accessible:**
   - Verify service is deployed and running
   - Check Render dashboard for service status
   - Verify `RENDER_INGEST_URL` environment variable

2. **Local ASR Worker not running:**
   - Start ASR Worker: `cd services/asr-worker && npm run dev`
   - Verify `ASR_WORKER_URL` environment variable
   - Check ASR Worker logs for errors

3. **Transcript Consumer not running:**
   - Start Next.js app: `npm run dev`
   - Verify `TRANSCRIPT_CONSUMER_URL` environment variable
   - Check if consumer started automatically (look for `[instrumentation] Starting transcript consumer...`)

4. **Redis connection failed:**
   - Verify `REDIS_URL` is set correctly
   - Test Redis connection: `redis-cli -u $REDIS_URL ping`
   - Ensure Redis is accessible from both Render and local machine

### Issue: No Audio Frames in Redis

**Symptoms:**
- `monitor-redis-streams.ts` shows zero audio messages
- ASR Worker logs show no messages received

**Solutions:**
1. **Verify Exotel simulation connected:**
   - Check simulation script output for "WebSocket connected"
   - Verify Render service logs show Exotel connection

2. **Check Redis topic name:**
   - Verify audio is published to `audio_stream` topic
   - Check Render ingest service logs for "Published audio frame to Redis"

3. **Verify Redis URL consistency:**
   - Ensure Render Ingest Service and Local ASR Worker use same `REDIS_URL`
   - Check Render dashboard for ingest service environment variables

### Issue: No Transcripts Generated

**Symptoms:**
- ASR Worker receives audio but no transcripts
- ElevenLabs connection not established

**Solutions:**
1. **Verify ElevenLabs API key:**
   - Check `ELEVENLABS_API_KEY` is set correctly
   - Verify API key has Speech-to-Text access
   - Check ElevenLabs dashboard for account status

2. **Check ASR Provider:**
   - Verify `ASR_PROVIDER=elevenlabs` (not `mock`)
   - Check ASR Worker health endpoint: `curl http://localhost:3001/health`

3. **Check ElevenLabs connection:**
   - Look for `[ElevenLabsProvider] ✅ Connection opened` in ASR Worker logs
   - Look for `[ElevenLabsProvider] Session started` in ASR Worker logs
   - Check for authentication errors in logs

### Issue: Transcripts Not Appearing in Frontend

**Symptoms:**
- Transcripts published to Redis but not visible in UI

**Solutions:**
1. **Verify Transcript Consumer:**
   - Check consumer status: `curl http://localhost:3000/api/transcripts/status`
   - Verify consumer is running and has active subscriptions
   - Check consumer logs for errors

2. **Check SSE Connection:**
   - Verify frontend is connected to `/api/events/stream`
   - Check browser console for SSE events
   - Verify `interaction_id` matches in UI subscription

3. **Verify API Endpoint:**
   - Check `/api/calls/ingest-transcript` is accessible
   - Verify endpoint is receiving transcript messages
   - Check for errors in Next.js logs

### Issue: High Latency

**Symptoms:**
- Transcripts appear but with significant delay (>10 seconds)

**Solutions:**
1. **Check ASR Worker processing:**
   - Monitor ASR Worker metrics: `curl http://localhost:3001/metrics`
   - Check for backlog of pending sends
   - Verify audio chunk size and send frequency

2. **Check ElevenLabs performance:**
   - Monitor ElevenLabs connection status
   - Check for network latency issues
   - Verify audio format matches ElevenLabs requirements

3. **Check Redis performance:**
   - Monitor Redis connection latency
   - Check for Redis stream backlog
   - Verify Redis is not overloaded

## Success Criteria

A successful test should meet all of the following criteria:

- ✅ All health checks pass
- ✅ Exotel simulation successfully connects to Render
- ✅ Audio flows through entire pipeline (Exotel → Render → Redis → ASR Worker)
- ✅ Transcripts generated within 2-5 seconds of audio
- ✅ Transcripts contain actual text (not empty)
- ✅ Transcripts published to Redis
- ✅ Transcript Consumer discovers and subscribes to transcript streams
- ✅ Transcripts forwarded to API endpoint
- ✅ Transcripts appear in frontend UI
- ✅ Complete end-to-end latency < 10 seconds
- ✅ No errors in any service logs

## Advanced Testing

### Test with Real Audio File

```bash
# Generate PCM16 audio file (8kHz, mono, 16-bit)
# Or use existing audio file

npx tsx scripts/test-exotel-complete-pipeline.ts \
  --file /path/to/audio.pcm \
  --duration 30 \
  --sample-rate 8000
```

### Test with Different Sample Rates

```bash
# Test with 16kHz audio
npx tsx scripts/test-exotel-complete-pipeline.ts \
  --sample-rate 16000 \
  --duration 20
```

### Monitor Specific Interaction

```bash
# After running test, note the interaction_id from output
# Then monitor that specific interaction

npx tsx scripts/monitor-redis-streams.ts \
  --interaction-id call_1234567890_abc123 \
  --duration 60
```

## Additional Resources

- **Exotel Documentation**: https://support.exotel.com/support/solutions/articles/3000108630-working-with-the-stream-applet
- **ElevenLabs Documentation**: https://elevenlabs.io/docs/libraries
- **Redis Streams**: https://redis.io/docs/data-types/streams/
- **ASR Worker Logs Guide**: `services/asr-worker/ASR_LOGS_GUIDE.md`
- **Transcript Consumer Guide**: `TRANSCRIPT_CONSUMER_QUICK_START.md`

## Support

If you encounter issues not covered in this guide:

1. Check service logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure all services are using the same Redis instance
4. Review the troubleshooting section above
5. Check Render dashboard for service status and logs


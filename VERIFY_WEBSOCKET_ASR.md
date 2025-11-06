# 🔍 Verifying WebSocket → ASR Flow

## Quick Test

Run the automated test:

```bash
# From project root
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
nvm use 20
npx tsx scripts/test-websocket-asr-flow.ts
```

This will:
1. ✅ Generate JWT token
2. ✅ Check ASR worker is running
3. ✅ Get initial ASR metrics
4. ✅ Send audio frames via WebSocket
5. ✅ Wait for ASR processing
6. ✅ Check final metrics to verify processing

---

## Manual Verification

### Step 1: Check Services Are Running

```bash
# Check ingestion
curl http://localhost:8443/health
# Should return: {"status":"ok","service":"ingest"}

# Check ASR worker
curl http://localhost:3001/health
# Should return: {"status":"ok","service":"asr-worker"}
```

### Step 2: Get Initial ASR Metrics

```bash
curl http://localhost:3001/metrics | grep asr_
```

Look for:
- `asr_audio_chunks_processed_total` - Number of audio chunks processed
- `asr_errors_total` - Number of errors
- `asr_transcripts_generated_total` - Number of transcripts generated

### Step 3: Send Audio via WebSocket

```bash
# Generate JWT token
node scripts/generate-test-jwt.js

# Send audio (from services/ingest)
cd services/ingest
JWT_TOKEN="<token-from-above>"
export JWT_TOKEN
./scripts/simulate_exotel_client.sh
```

### Step 4: Monitor in Real-Time

**Option A: Use monitoring script**
```bash
./scripts/monitor-asr-flow.sh
```

**Option B: Monitor logs manually**
```bash
# Terminal 1: Ingestion logs
tail -f /tmp/rtaa-ingest.log

# Terminal 2: ASR Worker logs
tail -f /tmp/rtaa-asr.log

# Terminal 3: Check metrics periodically
watch -n 2 'curl -s http://localhost:3001/metrics | grep asr_'
```

### Step 5: Check Metrics After Sending Audio

```bash
curl http://localhost:3001/metrics | grep asr_
```

**Expected Changes:**
- `asr_audio_chunks_processed_total` should **increase**
- `asr_transcripts_generated_total` should **increase** (if using mock provider)
- `asr_errors_total` should stay at 0 (or not increase)

---

## What to Look For in Logs

### Ingestion Service Logs (`/tmp/rtaa-ingest.log`)

Look for:
```
[server] WebSocket upgrade request { hasAuthHeader: true, ... }
[auth] JWT token validated successfully
[server] Authentication successful { tenant_id: 'test-tenant', ... }
[server] New connection { interaction_id: 'test-int-...', tenant_id: 'test-tenant' }
[pubsub] Published message to topic: audio.test-tenant
```

### ASR Worker Logs (`/tmp/rtaa-asr.log`)

Look for:
```
[asr-worker] Subscribed to audio topic: audio.test-tenant
[asr-worker] Received audio frame: interaction_id=test-int-..., seq=1
[asr-worker] Processing audio chunk: interaction_id=test-int-..., seq=1
[asr-worker] Generated transcript: interaction_id=test-int-..., text="..."
[asr-worker] Published transcript: interaction_id=test-int-...
```

---

## Expected Flow

```
1. WebSocket Client
   └─> Connects to wss://localhost:8443/v1/ingest
       └─> Authenticates with JWT
           └─> Sends start event
               └─> Sends audio frames (binary)

2. Ingestion Service
   └─> Receives audio frames
       └─> Publishes to Pub/Sub (audio.test-tenant topic)
           └─> Sends ACK to client

3. Pub/Sub (In-Memory)
   └─> Delivers message to subscribers
       └─> ASR Worker receives audio frame

4. ASR Worker
   └─> Receives audio frame from pub/sub
       └─> Buffers audio (200-500ms)
           └─> Sends to ASR provider (mock/deepgram)
               └─> Gets transcript (partial/final)
                   └─> Publishes transcript to transcript topic

5. Transcript Topic
   └─> Transcript available for downstream consumers
```

---

## Verification Checklist

- [ ] **WebSocket Connection**: Client connects successfully
- [ ] **Authentication**: JWT token validated (check ingestion logs)
- [ ] **Audio Frames Sent**: Client sends frames, receives ACKs
- [ ] **Pub/Sub Publishing**: Ingestion publishes to audio topic (check logs)
- [ ] **ASR Subscription**: ASR worker subscribed to audio topic (check logs)
- [ ] **Audio Processing**: ASR worker receives and processes audio (check metrics)
- [ ] **Transcript Generation**: Transcripts generated (check metrics/logs)
- [ ] **Transcript Publishing**: Transcripts published to transcript topic (check logs)

---

## Troubleshooting

### No Audio Chunks Processed

**Check:**
1. Is ASR worker running? `curl http://localhost:3001/health`
2. Is pub/sub adapter working? Check logs for subscription messages
3. Are audio frames being published? Check ingestion logs

**Solution:**
- Verify pub/sub adapter is `in_memory` in `.env.local`
- Check ASR worker logs for subscription errors
- Verify ingestion service is publishing to correct topic

### No Transcripts Generated

**Check:**
1. Is ASR provider configured? Check `ASR_PROVIDER` in `.env.local`
2. Are audio chunks being processed? Check metrics
3. Is ASR provider working? Check ASR worker logs

**Solution:**
- Verify `ASR_PROVIDER=mock` or `ASR_PROVIDER=deepgram`
- Check ASR worker logs for provider errors
- For Deepgram, verify `DEEPGRAM_API_KEY` is set

### WebSocket Authentication Fails

**Check:**
1. Is JWT token valid? Generate new one: `node scripts/generate-test-jwt.js`
2. Is JWT_PUBLIC_KEY set? Check `.env.local`
3. Check ingestion logs for detailed error

**Solution:**
- Generate new JWT token
- Verify JWT_PUBLIC_KEY format in `.env.local`
- Check ingestion service logs for authentication errors

---

## Quick Commands

```bash
# Test complete flow
npx tsx scripts/test-websocket-asr-flow.ts

# Monitor logs
./scripts/monitor-asr-flow.sh

# Check metrics
curl http://localhost:3001/metrics | grep asr_

# Send test audio
node scripts/generate-test-jwt.js
cd services/ingest
JWT_TOKEN="<token>" ./scripts/simulate_exotel_client.sh
```

---

## Success Indicators

✅ **WebSocket → ASR Flow Working When:**
1. WebSocket connects and authenticates
2. Audio frames are sent and ACKed
3. ASR metrics show chunks processed > 0
4. ASR metrics show transcripts generated > 0
5. No errors in logs

🎉 **You'll see in logs:**
- Ingestion: "Published message to topic"
- ASR Worker: "Received audio frame"
- ASR Worker: "Generated transcript"
- ASR Worker: "Published transcript"


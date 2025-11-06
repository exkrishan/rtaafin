# 🔍 How to Verify WebSocket → ASR Flow

## Quick Status Check

```bash
./scripts/check-websocket-asr-status.sh
```

This shows:
- ✅ Service status
- ✅ ASR metrics (chunks processed, errors)
- ✅ Recent logs
- ✅ Pub/Sub configuration

---

## Method 1: Automated Test (When Auth is Fixed)

```bash
npx tsx scripts/test-websocket-asr-flow.ts
```

**What it does:**
1. Generates JWT token
2. Sends audio frames via WebSocket
3. Monitors ASR metrics before/after
4. Verifies audio was processed

**Expected Output:**
```
✅ Step 1: Generate JWT Token
✅ Step 2: Check ASR Worker
✅ Step 3: Get Initial ASR Metrics
✅ Step 4: Send Audio via WebSocket
✅ Step 5: Wait for ASR Processing
✅ Step 6: Check ASR Metrics After Processing
   📊 Metrics Comparison:
      Audio chunks processed: 0 → 30 (Δ30)
      Transcripts generated: 0 → 1 (Δ1)
```

---

## Method 2: Manual Verification

### Step 1: Check Initial Metrics

```bash
curl http://localhost:3001/metrics | grep asr_
```

**Note the values:**
- `asr_audio_chunks_processed_total 0`
- `asr_errors_total 0`

### Step 2: Send Audio via WebSocket

```bash
# Generate JWT token
node scripts/generate-test-jwt.js

# Send audio
cd services/ingest
JWT_TOKEN="<token-from-above>"
export JWT_TOKEN
./scripts/simulate_exotel_client.sh
```

### Step 3: Check Metrics Again

```bash
curl http://localhost:3001/metrics | grep asr_
```

**Expected Changes:**
- `asr_audio_chunks_processed_total` should **increase** (e.g., 0 → 30)
- `asr_transcripts_generated_total` should **increase** (if using mock provider)
- `asr_errors_total` should stay at 0

### Step 4: Verify in Logs

**Ingestion Logs:**
```bash
tail -f /tmp/rtaa-ingest.log
```

**Look for:**
```
[auth] JWT token validated successfully
[server] Published message to topic: audio.test-tenant
```

**ASR Worker Logs:**
```bash
tail -f /tmp/rtaa-asr.log
```

**Look for:**
```
[ASRWorker] Received audio frame: interaction_id=test-int-...
[ASRWorker] Processing audio chunk: seq=1
[ASRWorker] Generated transcript: text="..."
[ASRWorker] Published transcript: interaction_id=test-int-...
```

---

## Method 3: Real-Time Monitoring

```bash
./scripts/monitor-asr-flow.sh
```

This shows logs from both services in real-time.

---

## What Success Looks Like

### ✅ WebSocket → ASR Flow Working

**Metrics:**
```
asr_audio_chunks_processed_total 30
asr_transcripts_generated_total 1
asr_errors_total 0
```

**Ingestion Logs:**
```
[auth] JWT token validated successfully
[server] Authentication successful
[pubsub] Published message to topic: audio.test-tenant
```

**ASR Worker Logs:**
```
[ASRWorker] Subscribed to audio topic: audio_stream
[ASRWorker] Received audio frame: interaction_id=test-int-123, seq=1
[ASRWorker] Processing audio chunk: interaction_id=test-int-123
[ASRWorker] Generated transcript: type=partial, text="Hello"
[ASRWorker] Published transcript: interaction_id=test-int-123
```

---

## Current Issue: WebSocket Authentication

**Status:** ⚠️ WebSocket authentication returning 401

**To Fix:**
1. Check ingestion service logs: `tail -f /tmp/rtaa-ingest.log`
2. Look for `[auth] JWT validation failed` messages
3. Verify JWT_PUBLIC_KEY is loaded correctly
4. Generate a new JWT token: `node scripts/generate-test-jwt.js`

**Once Fixed:**
- WebSocket will accept connections
- Audio frames will be published to pub/sub
- ASR worker will process them
- Transcripts will be generated

---

## Quick Commands

```bash
# Check status
./scripts/check-websocket-asr-status.sh

# Monitor logs
./scripts/monitor-asr-flow.sh

# Check metrics
curl http://localhost:3001/metrics | grep asr_

# Test WebSocket (when auth is fixed)
npx tsx scripts/test-websocket-asr-flow.ts
```

---

## Verification Checklist

- [ ] **Services Running**: Both ingestion and ASR worker are up
- [ ] **WebSocket Auth**: JWT authentication works (currently failing)
- [ ] **Audio Sent**: Frames sent via WebSocket and ACKed
- [ ] **Pub/Sub**: Audio published to topic (check ingestion logs)
- [ ] **ASR Subscription**: ASR worker subscribed to audio topic
- [ ] **Audio Processing**: Metrics show chunks processed > 0
- [ ] **Transcripts**: Metrics show transcripts generated > 0
- [ ] **No Errors**: Error count stays at 0

---

## Troubleshooting

### No Audio Chunks Processed

**Check:**
1. Is pub/sub working? (Check ingestion logs for "Published message")
2. Is ASR worker subscribed? (Check ASR logs for "Subscribed to audio topic")
3. Are topics matching? (Ingestion publishes to `audio.test-tenant`, ASR subscribes to `audio_stream`)

**Solution:**
- Verify `USE_AUDIO_STREAM=true` in `.env.local`
- Check both services are using same pub/sub adapter
- Verify ASR worker is running and subscribed

### WebSocket 401 Error

**Check ingestion logs:**
```bash
tail -f /tmp/rtaa-ingest.log | grep -E "\[auth\]|Authentication"
```

**Common issues:**
- JWT_PUBLIC_KEY not loaded
- Token format incorrect
- Key format issues (quotes, newlines)

**Solution:**
- Verify JWT_PUBLIC_KEY in `.env.local`
- Generate new token: `node scripts/generate-test-jwt.js`
- Check service logs for detailed error

---

## Expected Flow Diagram

```
┌─────────────┐
│   Client    │
│ (WebSocket) │
└──────┬──────┘
       │ 1. Connect + JWT Auth
       │ 2. Send start event
       │ 3. Send audio frames
       ▼
┌─────────────┐
│  Ingestion  │
│   Service   │
└──────┬──────┘
       │ 4. Publish to pub/sub
       │    Topic: audio_stream
       ▼
┌─────────────┐
│   Pub/Sub   │
│  (In-Memory)│
└──────┬──────┘
       │ 5. Deliver to subscribers
       ▼
┌─────────────┐
│ ASR Worker  │
└──────┬──────┘
       │ 6. Process audio
       │ 7. Generate transcript
       │ 8. Publish transcript
       ▼
┌─────────────┐
│ Transcript  │
│   Topic     │
└─────────────┘
```

---

## Success Indicators

✅ **Flow is Working When:**
1. WebSocket connects (no 401 error)
2. Audio frames are sent and ACKed
3. ASR metrics show `chunksProcessed > 0`
4. ASR metrics show `transcriptsGenerated > 0`
5. Logs show "Received audio frame" and "Generated transcript"

🎉 **You'll know it's working when metrics increase after sending audio!**


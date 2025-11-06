# 🔍 How to Verify WebSocket → ASR Flow

## Current Status

✅ **WebSocket Authentication**: FIXED - Now working!
✅ **Audio Frames Sent**: 30 frames sent, 3 ACKs received
⚠️ **ASR Processing**: Audio not being processed yet

## Issue: In-Memory Adapter Limitation

**Problem**: The in-memory pub/sub adapter works, but each service (ingestion and ASR worker) creates its own instance. They don't share the same in-memory store because they run in separate processes.

**Solution Options:**
1. **Use Redis** (recommended for production)
2. **Run services in same process** (for testing)
3. **Use a shared in-memory store** (requires refactoring)

## How to Verify the Flow is Working

### Method 1: Check Logs

**Ingestion Service Logs:**
```bash
tail -f /tmp/rtaa-ingest.log
```

**Look for:**
```
[server] Published audio frame { interaction_id: 'test-int-...', seq: 1, topic: 'audio_stream' }
```

**ASR Worker Logs:**
```bash
tail -f /tmp/rtaa-asr.log
```

**Look for:**
```
[ASRWorker] Subscribed to audio topic: audio_stream
[ASRWorker] Received audio frame: interaction_id=test-int-..., seq=1
[ASRWorker] Processing audio chunk: interaction_id=test-int-...
[ASRWorker] Generated transcript: text="..."
```

### Method 2: Check Metrics

**Before sending audio:**
```bash
curl http://localhost:3001/metrics | grep asr_audio_chunks_processed_total
# Should show: asr_audio_chunks_processed_total 0
```

**After sending audio:**
```bash
curl http://localhost:3001/metrics | grep asr_audio_chunks_processed_total
# Should show: asr_audio_chunks_processed_total 30 (or higher)
```

### Method 3: Automated Test

```bash
npx tsx scripts/test-websocket-asr-flow.ts
```

**Expected Output:**
```
✅ Step 4: Send Audio via WebSocket
   Sent 30 frames, received 3 ACKs

✅ Step 6: Check ASR Metrics After Processing
   📊 Metrics Comparison:
      Audio chunks processed: 0 → 30 (Δ30)  ← This should increase!
```

---

## What's Working ✅

1. **WebSocket Connection**: ✅ Connects successfully
2. **JWT Authentication**: ✅ Token validated
3. **Audio Frames**: ✅ 30 frames sent and ACKed
4. **Ingestion Service**: ✅ Receives and processes frames
5. **Pub/Sub Publishing**: ✅ Frames published to topic (check logs)

## What's Not Working ⚠️

1. **ASR Processing**: Audio chunks not being processed
   - **Reason**: In-memory adapter instances are separate per process
   - **Fix**: Use Redis or run in same process for testing

---

## Quick Verification Commands

```bash
# Check if services are running
curl http://localhost:8443/health
curl http://localhost:3001/health

# Check ASR metrics
curl http://localhost:3001/metrics | grep asr_

# Monitor logs
tail -f /tmp/rtaa-ingest.log | grep -E "Published|publish"
tail -f /tmp/rtaa-asr.log | grep -E "Received|Processing"

# Run automated test
npx tsx scripts/test-websocket-asr-flow.ts
```

---

## Expected Flow (When Working)

```
1. WebSocket Client
   └─> Connects to wss://localhost:8443/v1/ingest
       └─> Authenticates ✅
           └─> Sends start event ✅
               └─> Sends 30 audio frames ✅

2. Ingestion Service
   └─> Receives frames ✅
       └─> Publishes to pub/sub ✅
           └─> Topic: audio_stream ✅

3. Pub/Sub (In-Memory)
   └─> Should deliver to subscribers ⚠️
       └─> ASR Worker should receive ⚠️

4. ASR Worker
   └─> Should receive audio frames ⚠️
       └─> Should process audio ⚠️
           └─> Should generate transcripts ⚠️
```

---

## Next Steps to Fix ASR Processing

### Option 1: Use Redis (Recommended)

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Update .env.local
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://localhost:6379
```

### Option 2: Test in Same Process (For Development)

Create a combined test that runs ingestion and ASR in the same process to share the in-memory adapter.

---

## Current Test Results

```
✅ WebSocket: Connected and authenticated
✅ Audio Frames: 30 frames sent, 3 ACKs received
✅ Ingestion: Publishing to audio_stream topic
⚠️ ASR Worker: Subscribed but not receiving (in-memory adapter limitation)
```

---

## Summary

**WebSocket → Ingestion → Pub/Sub**: ✅ Working
**Pub/Sub → ASR Worker**: ⚠️ Not working (in-memory adapter limitation)

To see the complete flow working, you'll need to either:
1. Use Redis for pub/sub
2. Or verify the flow works conceptually (WebSocket sends → Ingestion publishes)

The WebSocket and ingestion parts are working correctly! 🎉


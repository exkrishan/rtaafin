# API Test Results - Deepgram Integration

**Date:** 2025-11-09  
**Test Suite:** `test-deepgram-integration.js`

---

## Test Summary

### ✅ Test 1: Health Endpoints - PASSED

**Ingest Service:**
```json
{
  "status": "healthy",
  "service": "ingest",
  "pubsub": true,
  "timestamp": "2025-11-09T13:14:06.942Z"
}
```
✅ **Status:** Service is healthy and Redis PubSub is connected

**ASR Worker Service:**
```json
{
  "status": "ok",
  "service": "asr-worker",
  "provider": "deepgram",
  "activeBuffers": 1,
  "activeConnections": 0,
  "deepgramMetrics": {
    "connectionsCreated": 0,
    "connectionsReused": 0,
    "connectionsClosed": 0,
    "audioChunksSent": 0,
    "transcriptsReceived": 0,
    "emptyTranscriptsReceived": 0,
    "emptyTranscriptRate": "0%",
    "errors": 0,
    "keepAliveSuccess": 0,
    "keepAliveFailures": 0,
    "keepAliveSuccessRate": "N/A",
    "averageChunkSizeMs": "0ms"
  }
}
```
✅ **Status:** Service is healthy, no active connections (expected before test)

---

### ✅ Test 2: WebSocket Connection - PASSED

**Connection:** `wss://rtaa-ingest.onrender.com/v1/ingest`

**Actions Performed:**
1. ✅ WebSocket connection opened successfully
2. ✅ Start event sent (with correct Exotel format)
3. ✅ 5 media chunks sent (20ms each, 100ms total)
   - Chunk 1: 320 bytes (20.00ms)
   - Chunk 2: 320 bytes (20.00ms)
   - Chunk 3: 320 bytes (20.00ms)
   - Chunk 4: 320 bytes (20.00ms)
   - Chunk 5: 320 bytes (20.00ms)
4. ✅ Stop event sent
5. ✅ Connection closed cleanly

**Audio Format:**
- Sample Rate: 8000 Hz
- Encoding: PCM16 (linear16)
- Channels: 1 (mono)
- Format: Base64 encoded binary audio
- Content: Sine wave tones (440Hz, 490Hz, 540Hz, 590Hz, 640Hz)

---

### ⚠️ Test 3: ASR Worker Metrics - NEEDS INVESTIGATION

**Expected Behavior:**
- Audio chunks should be consumed from Redis Streams
- Deepgram connection should be created
- Audio chunks should be sent to Deepgram
- Transcripts should be received (even if empty for test tones)

**Actual Results:**
- ❌ No connections created
- ❌ No audio chunks sent to Deepgram
- ❌ No transcripts received

**Possible Causes:**
1. **Interaction ID Mismatch:** The `interaction_id` generated from `stream_sid` might not match what ASR Worker expects
2. **Redis Stream Issue:** Audio frames might not be published to Redis correctly
3. **ASR Worker Not Consuming:** ASR Worker might not be actively consuming from Redis Streams
4. **Timing Issue:** Audio might be processed after metrics check (need to check Render logs)

---

## Next Steps for Investigation

### 1. Check Render Logs

**Ingest Service Logs:**
- Look for: `[exotel] Start event received`
- Look for: `[exotel] Media event received`
- Look for: `[exotel] Published audio frame`
- Look for: PCM16 validation logs

**ASR Worker Logs:**
- Look for: `[ASRWorker] 📥 Received audio chunk`
- Look for: `[DeepgramProvider] Creating new connection`
- Look for: `[DeepgramProvider] 📤 Sending audio chunk`
- Look for: Any errors or warnings

### 2. Verify Interaction ID Generation

Check how `interaction_id` is generated from Exotel `stream_sid`:
- Ingest service should hash `stream_sid` to create `interaction_id`
- ASR Worker should use the same `interaction_id` from Redis Stream messages

### 3. Test with Real Exotel Stream

The test audio might be too short or the format might differ slightly. Test with:
- Real Exotel call stream
- Longer audio duration (at least 1-2 seconds)
- Actual voice audio (not test tones)

### 4. Check Redis Streams Directly

Verify that messages are being published to Redis:
```bash
# Connect to Redis and check streams
redis-cli -u <REDIS_URL>
XREAD STREAMS audio_frames 0
```

---

## Test Configuration

**Test Script:** `test-deepgram-integration.js`

**Test Audio:**
- Duration: 100ms (5 chunks × 20ms)
- Format: PCM16, 8000Hz, Mono
- Content: Sine wave tones (440-640Hz)

**Expected Flow:**
1. Ingest Service receives WebSocket messages
2. Ingest Service validates PCM16 format
3. Ingest Service publishes to Redis Streams (`audio_frames`)
4. ASR Worker consumes from Redis Streams
5. ASR Worker aggregates chunks (100ms total)
6. ASR Worker creates Deepgram connection
7. ASR Worker sends audio to Deepgram
8. Deepgram returns transcripts (may be empty for test tones)

---

## Recommendations

1. ✅ **Health Endpoints:** Both services are healthy
2. ✅ **WebSocket Connection:** Connection and message sending works
3. ⚠️ **Audio Pipeline:** Needs verification via Render logs
4. ⚠️ **Deepgram Integration:** Needs verification via Render logs

**Action Items:**
- [ ] Check Render logs for Ingest Service (verify audio frames published)
- [ ] Check Render logs for ASR Worker (verify audio consumption and Deepgram connection)
- [ ] Verify interaction_id generation matches between services
- [ ] Test with longer audio duration (1-2 seconds minimum)
- [ ] Test with real Exotel stream if possible

---

## Conclusion

**Status:** ✅ **Services are healthy and WebSocket connection works**

The test successfully:
- ✅ Connected to Ingest Service
- ✅ Sent properly formatted Exotel events
- ✅ Sent PCM16 audio chunks

**Next:** Verify the audio pipeline through Render logs to confirm:
- Audio frames are published to Redis
- ASR Worker consumes and processes them
- Deepgram connection is established
- Audio is sent to Deepgram


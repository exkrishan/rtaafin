# Exotel → Deepgram Bridge: Manual Acceptance Testing Guide

## Overview

This guide provides step-by-step instructions for manually testing the Exotel → Deepgram bridge feature before production deployment.

## Prerequisites

- [ ] Ingest service running with `EXO_BRIDGE_ENABLED=true`
- [ ] ASR worker running with `EXO_BRIDGE_ENABLED=true` and `ASR_PROVIDER=deepgram`
- [ ] Deepgram API key configured
- [ ] Redis pub/sub layer running and accessible
- [ ] WebSocket client tool or simulator script available

## Test Environment Setup

### 1. Start Services

**Terminal 1: Ingest Service**
```bash
cd services/ingest
export EXO_BRIDGE_ENABLED=true
export EXO_MAX_BUFFER_MS=500
export EXO_IDLE_CLOSE_S=10
export REDIS_URL=redis://localhost:6379
export PUBSUB_ADAPTER=redis_streams
npm run dev
```

**Terminal 2: ASR Worker**
```bash
cd services/asr-worker
export EXO_BRIDGE_ENABLED=true
export ASR_PROVIDER=deepgram
export DEEPGRAM_API_KEY=your-api-key-here
export EXO_IDLE_CLOSE_S=10
export EXO_EARLY_AUDIO_FILTER=true
export REDIS_URL=redis://localhost:6379
export PUBSUB_ADAPTER=redis_streams
npm run dev
```

### 2. Verify Services Are Running

```bash
# Check Ingest Service
curl http://localhost:8443/health | jq

# Expected response should include:
# {
#   "status": "ok",
#   "exotelBridge": "enabled",
#   "exotelMetrics": { ... }
# }

# Check ASR Worker
curl http://localhost:3001/health | jq

# Expected response should include:
# {
#   "status": "healthy",
#   "provider": "deepgram",
#   "deepgram": { ... }
# }
```

## Test Cases

### Test Case 1: Basic Connection and Audio Flow

**Objective:** Verify that Exotel WebSocket connection is established and audio frames are processed.

**Steps:**
1. Run the simulator script:
   ```bash
   cd services/ingest
   ts-node scripts/simulate-exotel-stream.ts --duration 5 --sample-rate 8000
   ```

2. **Expected Results:**
   - ✅ WebSocket connection established
   - ✅ `connected` event sent and acknowledged
   - ✅ `start` event sent and acknowledged
   - ✅ Multiple `media` events sent (5 seconds = ~250 frames at 20ms each)
   - ✅ `stop` event sent and connection closed cleanly

3. **Check Logs:**
   - **Ingest Service:** Look for `[exotel]` logs showing frame processing
   - **ASR Worker:** Look for `[DeepgramProvider]` logs showing connection and audio processing

4. **Verify Metrics:**
   ```bash
   # Check Ingest metrics
   curl http://localhost:8443/health | jq '.exotelMetrics'
   
   # Expected:
   # {
   #   "framesIn": 250,
   #   "bytesIn": 80000,
   #   "bufferDrops": 0,
   #   "publishFailures": 0
   # }
   
   # Check ASR Worker metrics
   curl http://localhost:3001/health | jq '.deepgramMetrics'
   
   # Expected:
   # {
   #   "audioChunksSent": 250,
   #   "connectionsCreated": 1,
   #   "transcriptsReceived": > 0
   # }
   ```

**Pass Criteria:**
- ✅ All events sent successfully
- ✅ No errors in logs
- ✅ Metrics show frames processed
- ✅ Connection closed cleanly

---

### Test Case 2: Transcript Generation

**Objective:** Verify that audio is transcribed correctly by Deepgram.

**Steps:**
1. Use a test audio file with known speech content:
   ```bash
   # Generate or use a test audio file (PCM16, 8kHz, mono)
   # Then run simulator with file:
   ts-node scripts/simulate-exotel-stream.ts --duration 10 --sample-rate 8000 --file /path/to/test-audio.pcm
   ```

2. **Monitor Transcripts:**
   - Check ASR worker logs for transcript events
   - Look for both `partial` and `final` transcripts
   - Verify transcript text matches expected content

3. **Check Latency:**
   ```bash
   curl http://localhost:3001/health | jq '.deepgramMetrics.averageLatencyMs'
   ```
   - Expected: < 1000ms for first interim transcript
   - Expected: < 2000ms for final transcripts

**Pass Criteria:**
- ✅ Transcripts generated with non-empty text
- ✅ Latency within acceptable range
- ✅ Both partial and final transcripts received

---

### Test Case 3: Early-Audio Filtering

**Objective:** Verify that early audio (ringing, silence) is filtered correctly.

**Steps:**
1. Run simulator with early silence:
   ```bash
   # Simulate 2 seconds of silence, then speech
   ts-node scripts/simulate-exotel-stream.ts --duration 5 --sample-rate 8000
   ```

2. **Check Logs:**
   - Look for `[DeepgramProvider] 🔇 Suppressing early-audio transcript` messages
   - After 2 seconds or first speech, should see `[DeepgramProvider] 🎤 Speech detected`

3. **Verify Behavior:**
   - Early transcripts (first 2 seconds) should be suppressed
   - After speech detection, transcripts should appear normally

**Pass Criteria:**
- ✅ Early audio transcripts suppressed
- ✅ Speech detection triggers correctly
- ✅ Normal transcripts appear after speech detected

---

### Test Case 4: Idle Timeout

**Objective:** Verify that connections are closed after idle timeout.

**Steps:**
1. Start a connection but don't send audio:
   ```bash
   # Modify simulator to connect but not send media frames
   # Or use a custom script that connects and waits
   ```

2. **Wait for Timeout:**
   - Default timeout: 10 seconds (`EXO_IDLE_CLOSE_S=10`)
   - Wait 15 seconds

3. **Check Logs:**
   - **Ingest Service:** Should see connection closed due to idle timeout
   - **ASR Worker:** Should see Deepgram connection closed due to idle timeout

**Pass Criteria:**
- ✅ Connection closed after idle timeout
- ✅ No resource leaks
- ✅ Clean shutdown logged

---

### Test Case 5: Pub/Sub Failure Recovery

**Objective:** Verify bounded buffer fallback when pub/sub fails.

**Steps:**
1. **Simulate Pub/Sub Failure:**
   - Stop Redis: `docker stop redis` or `redis-cli SHUTDOWN`
   - Or disconnect network temporarily

2. **Send Audio:**
   ```bash
   ts-node scripts/simulate-exotel-stream.ts --duration 2 --sample-rate 8000
   ```

3. **Check Logs:**
   - Should see `[exotel] ❌ Failed to publish frame, using bounded buffer fallback`
   - Should see frames added to bounded buffer

4. **Recover Pub/Sub:**
   - Restart Redis or reconnect network

5. **Verify Recovery:**
   - Should see `[exotel] ✅ Flushed buffered frames`
   - Metrics should show `publishFailures` > 0 initially, then recovery

**Pass Criteria:**
- ✅ Bounded buffer used during pub/sub failure
- ✅ Frames buffered (up to `EXO_MAX_BUFFER_MS`)
   - Old frames dropped when buffer exceeds max duration
- ✅ Recovery and republishing when pub/sub recovers

---

### Test Case 6: Multiple Concurrent Calls

**Objective:** Verify system handles multiple concurrent Exotel streams.

**Steps:**
1. **Start Multiple Simulators:**
   ```bash
   # Terminal 1
   ts-node scripts/simulate-exotel-stream.ts --duration 10 &
   
   # Terminal 2
   ts-node scripts/simulate-exotel-stream.ts --duration 10 &
   
   # Terminal 3
   ts-node scripts/simulate-exotel-stream.ts --duration 10 &
   ```

2. **Monitor Resources:**
   - Check CPU and memory usage
   - Check connection counts in health endpoints
   - Verify all calls process correctly

3. **Check Metrics:**
   - Verify metrics aggregate correctly across calls
   - Check for any errors or timeouts

**Pass Criteria:**
- ✅ All concurrent calls process successfully
- ✅ No resource exhaustion
- ✅ Metrics accurate across all calls

---

### Test Case 7: Error Handling

**Objective:** Verify graceful error handling for various failure scenarios.

**Test Scenarios:**

1. **Invalid Audio Format:**
   - Send non-PCM16 audio
   - Expected: Error logged, connection may close

2. **Wrong Sample Rate:**
   - Send audio with mismatched sample rate
   - Expected: Warning logged, may affect transcription quality

3. **Deepgram API Failure:**
   - Use invalid API key
   - Expected: Connection fails, error logged, graceful degradation

4. **Network Interruption:**
   - Temporarily disconnect network
   - Expected: Reconnection attempts, bounded buffer used

**Pass Criteria:**
- ✅ Errors handled gracefully
- ✅ No crashes or unhandled exceptions
- ✅ Appropriate error messages logged
- ✅ System recovers when possible

---

## Smoke Test (Automated)

For quick validation, run the automated smoke test:

```bash
STT_SMOKE=1 ts-node scripts/smoke-test-exotel-bridge.ts
```

**Expected Output:**
```
🧪 Exotel → Deepgram Bridge Smoke Test
============================================================
Ingest URL: http://localhost:8443
ASR Worker URL: http://localhost:3001
WebSocket URL: ws://localhost:8443/v1/ingest
============================================================

1️⃣  Testing Ingest Service Health...
   ✅ Service is healthy, bridge is enabled

2️⃣  Testing ASR Worker Health...
   ✅ Service is healthy, Deepgram provider active

3️⃣  Testing Exotel WebSocket Connection...
   ✅ Successfully sent 5 audio frames

4️⃣  Testing ASR Worker Metrics...
   ✅ Metrics show activity: {...}

============================================================
📊 Test Summary
============================================================

✅ Passed: 4
❌ Failed: 0
⏭️  Skipped: 0

✅ Smoke test passed!
```

## Test Results Template

Use this template to record test results:

```markdown
## Test Results - [Date]

### Environment
- Ingest Service: [URL/Version]
- ASR Worker: [URL/Version]
- Deepgram API: [Model/Version]
- Redis: [Version]

### Test Case Results

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1. Basic Connection | ✅/❌ | [Notes] |
| 2. Transcript Generation | ✅/❌ | [Notes] |
| 3. Early-Audio Filtering | ✅/❌ | [Notes] |
| 4. Idle Timeout | ✅/❌ | [Notes] |
| 5. Pub/Sub Failure Recovery | ✅/❌ | [Notes] |
| 6. Multiple Concurrent Calls | ✅/❌ | [Notes] |
| 7. Error Handling | ✅/❌ | [Notes] |

### Issues Found
- [List any issues]

### Sign-off
- Tester: [Name]
- Date: [Date]
- Status: ✅ Ready for Production / ❌ Needs Fixes
```

## Rollback Procedure

If issues are found during testing:

1. **Disable Bridge:**
   ```bash
   export EXO_BRIDGE_ENABLED=false
   ```

2. **Restart Services:**
   ```bash
   # Restart both services
   ```

3. **Verify Normal Operation:**
   - Check health endpoints
   - Verify normal flow works

4. **Document Issues:**
   - Record in issue tracker
   - Update test results

## Next Steps

After successful acceptance testing:

1. ✅ Document test results
2. ✅ Get sign-off from stakeholders
3. ✅ Proceed to Phase 6: Security verification and rollout
4. ✅ Schedule production deployment






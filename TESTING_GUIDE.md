# 🧪 Complete Testing Guide - Deepgram Integration

**Date:** 2025-11-09  
**Status:** All fixes deployed ✅

---

## Quick Test (Automated)

### Run the Test Script

```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
node test-deepgram-integration.js
```

### Expected Results

**✅ Test 1: Health Endpoints**
- Both services should return `status: "healthy"` or `status: "ok"`
- Ingest service should show `pubsub: true`
- ASR Worker should show `provider: "deepgram"`

**✅ Test 2: WebSocket Connection**
- Connection should open successfully
- Start event should be sent
- 5 media chunks (100ms total audio) should be sent
- Stop event should be sent
- Connection should close cleanly

**✅ Test 3: ASR Worker Metrics (CRITICAL)**
After 10-30 seconds, metrics should show:
```json
{
  "audioChunksSent": 5,           // ✅ Should be 5
  "connectionsCreated": 1,        // ✅ Should be 1
  "transcriptsReceived": 0-5,     // ✅ May be 0-5 (depends on audio content)
  "errors": 0,                    // ✅ Should be 0
  "averageChunkSizeMs": "20ms"    // ✅ Should be ~20ms
}
```

---

## Manual Testing Steps

### Step 1: Verify Services Are Live

```bash
# Check Ingest Service
curl https://rtaa-ingest.onrender.com/health | jq

# Check ASR Worker
curl https://rtaa-asr-worker.onrender.com/health | jq
```

**Expected:**
- Both return `200 OK`
- Status is `healthy` or `ok`

### Step 2: Run Integration Test

```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
node test-deepgram-integration.js
```

### Step 3: Wait and Check Metrics

```bash
# Wait 15 seconds
sleep 15

# Check metrics
curl -s https://rtaa-asr-worker.onrender.com/health | jq '.deepgramMetrics'
```

**Expected:**
- `audioChunksSent` should be **5** (not 0, not null)
- `connectionsCreated` should be **1** (not 0, not null)
- `transcriptsReceived` may be 0-5 (depends on audio content)

### Step 4: Check Render Logs

**ASR Worker Logs - Look for:**
```
[RedisStreamsAdapter] ✅ Reset existing consumer group asr-worker for audio_stream to position 0
[RedisStreamsAdapter] 🔍 First read for audio_stream, reading from beginning (position: 0)
[RedisStreamsAdapter] ✅ First read completed for audio_stream, found 5 message(s)
[RedisStreamsAdapter] ✅ Processed 5 message(s) from audio_stream
[ASRWorker] 📥 Received audio chunk: { interaction_id: '...', seq: 1, ... }
[DeepgramProvider] ✅ Connection opened for ...
[DeepgramProvider] 📤 Sending audio chunk: { interactionId: '...', seq: 1, ... }
```

**Ingest Service Logs - Look for:**
```
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', topic: 'audio_stream' }
[exotel] Published audio frame
[server] Published audio frame
```

---

## Success Criteria

### ✅ Test 3 is PASSING if:

1. **Metrics are non-zero:**
   - `audioChunksSent >= 5`
   - `connectionsCreated >= 1`
   - `transcriptsReceived >= 0` (may be 0 for silence)

2. **ASR Worker logs show:**
   - Consumer group reset happening
   - First read finding messages
   - Audio chunks being received
   - Deepgram connection being created

3. **No errors in logs:**
   - No Redis connection errors
   - No consumer group errors
   - No Deepgram connection errors

---

## Troubleshooting

### Issue: Metrics Still Zero

**Check 1: Consumer Group Reset**
Look for this in ASR Worker logs:
```
[RedisStreamsAdapter] ✅ Reset existing consumer group asr-worker for audio_stream to position 0
```

**If missing:**
- Consumer group might not exist yet (first time)
- Or reset might be failing silently

**Check 2: First Read Finding Messages**
Look for this in ASR Worker logs:
```
[RedisStreamsAdapter] ✅ First read completed for audio_stream, found X message(s)
```

**If X is 0:**
- Messages might be published after first read completes
- Timing issue - try running test again

**Check 3: Messages Being Published**
Look for this in Ingest Service logs:
```
[exotel] Published audio frame
```

**If missing:**
- Ingest service might not be publishing
- Check Ingest service health

### Issue: Deepgram Connection Errors

**Check logs for:**
```
[DeepgramProvider] ❌ Cannot send audio: socket not ready
[DeepgramProvider] ❌ CRITICAL: Connection closed due to timeout (1011)
```

**If present:**
- Deepgram connection issues (separate from Redis Streams fix)
- Check Deepgram API key
- Check network connectivity

### Issue: No Logs at All

**Check:**
1. Services are actually deployed and running
2. Logs are being streamed in Render dashboard
3. Services are using latest code (check deployment timestamps)

---

## Advanced Testing

### Test with Real Exotel Stream

1. Configure Exotel to stream to: `wss://rtaa-ingest.onrender.com/v1/ingest`
2. Make a test call
3. Monitor ASR Worker logs for:
   - Audio chunks being received
   - Deepgram transcripts being generated
   - Transcripts being published

### Test Multiple Calls

1. Run test script multiple times
2. Check that each call gets processed
3. Verify metrics accumulate correctly
4. Check for any memory leaks or connection issues

---

## What Success Looks Like

### Complete Success Flow:

1. **Test script sends audio** ✅
2. **Ingest service receives and publishes** ✅
3. **ASR Worker consumer group resets to position 0** ✅
4. **ASR Worker first read finds messages** ✅
5. **ASR Worker processes audio chunks** ✅
6. **Deepgram connection created** ✅
7. **Audio sent to Deepgram** ✅
8. **Transcripts received (if audio has speech)** ✅
9. **Metrics updated** ✅

### Final Metrics Should Show:

```json
{
  "audioChunksSent": 5,
  "connectionsCreated": 1,
  "transcriptsReceived": 0-5,
  "errors": 0,
  "averageChunkSizeMs": "20ms"
}
```

---

## Next Steps After Successful Test

1. ✅ **Verify end-to-end flow** - Test with real Exotel stream
2. ✅ **Monitor production** - Watch for any issues in real calls
3. ✅ **Check metrics** - Ensure metrics are being collected correctly
4. ✅ **Review logs** - Look for any warnings or errors

---

## Quick Reference

**Test Command:**
```bash
node test-deepgram-integration.js
```

**Check Metrics:**
```bash
curl -s https://rtaa-asr-worker.onrender.com/health | jq '.deepgramMetrics'
```

**Check Health:**
```bash
curl -s https://rtaa-ingest.onrender.com/health | jq
curl -s https://rtaa-asr-worker.onrender.com/health | jq
```

**Expected Wait Time:**
- 10-30 seconds after sending audio for metrics to update
- First read happens immediately on subscription
- Deepgram connection takes 500-1000ms

---

**Status:** Ready for testing! 🚀

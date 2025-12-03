# ASR Transcription Test Diagnosis

## Test Results Summary

**Test Date:** 2025-11-28  
**Test Call ID:** `test-call-1764304955831`  
**Stream ID:** `test-stream-1764304955831`

### ✅ What Worked:
1. Test script successfully connected to ingest service (`wss://ingestservice.onrender.com`)
2. Sent 6 audio chunks (5 seconds each = 30 seconds total)
3. Ingest service received and processed the stop event
4. Ingest service shows `total_chunks: 6` (confirmed 6 media events received)
5. ASR worker is running and healthy (`https://asr11labs.onrender.com`)

### ⚠️ What's Missing:
1. **No transcripts found in Redis** for the test call
2. **No audio messages in Redis** from the test call (may have been consumed immediately)
3. **No logs from ingest service** showing:
   - Start event received
   - Media events received (except total_chunks count)
   - Audio frames published to Redis

## Key Findings from Logs

### Ingest Service Logs:
- ✅ Received stop event
- ✅ Published call_end event to Redis
- ✅ Registered call in registry
- ⚠️ No logs for start event (may be using `logger.info` instead of `console.log`)
- ⚠️ No logs for media events (only shows `total_chunks: 6`)
- ⚠️ No logs for published audio frames (only logs seq 1 and seq % 100 === 0)

### Redis Check:
- ❌ No audio messages found with `interaction_id: test-call-1764304955831`
- ⚠️ Audio may have been consumed immediately by ASR worker
- ✅ Other calls' audio is present in Redis

## Next Steps to Diagnose

### 1. Check ASR Worker Logs on Render
Look for logs with `test-call-1764304955831`:
- Did ASR worker receive audio from Redis?
- Did it create a buffer for this interaction?
- Did it send audio to ElevenLabs?
- Are there any errors from ElevenLabs?

### 2. Check Ingest Service Logs (Full)
Look for logs around `04:42:36` to `04:43:01`:
- Start event received?
- Media events received? (should see 6 events)
- Audio frames published? (check for publish success/failure)

### 3. Verify Audio Format
The test script sends:
- Sample rate: 16000 Hz
- Encoding: PCM16
- Chunk duration: 5000ms
- Format: Base64-encoded in media.payload

### 4. Check Consumer Groups
Verify ASR worker is consuming from `audio_stream`:
```bash
# Check if ASR worker has a consumer group
redis-cli XINFO GROUPS audio_stream
```

## Possible Root Causes

1. **Audio frames not published to Redis**
   - Ingest service received media events but failed to publish
   - Check for publish errors in ingest logs

2. **Audio frames consumed immediately**
   - ASR worker consumed frames but didn't process them
   - Check ASR worker logs for buffer creation/processing

3. **ASR worker not processing**
   - Audio received but not sent to ElevenLabs
   - Check for connection issues or errors

4. **ElevenLabs not returning transcripts**
   - Audio sent but no transcripts received
   - Check for ElevenLabs API errors or empty transcripts

## Test Script Location
- `scripts/test-asr-transcription-flow.ts`
- Run with: `npm run test-asr`

## Related Scripts
- `scripts/check-audio-in-redis.ts` - Check if audio is in Redis
- `scripts/check-asr-worker-status.ts` - Check ASR worker status


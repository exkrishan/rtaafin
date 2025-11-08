# Deepgram Logging Improvements & Analysis

## Summary

Based on your latest logs, **transcripts are still NOT coming through**. The same issues persist:

1. ❌ **No transcript events from Deepgram** - Deepgram is not returning any transcript events at all
2. ❌ **Same audio chunk being sent repeatedly** - `seq: 3` with the same 1731 bytes (108ms of audio)
3. ❌ **Connections closing after ~5 seconds** - Deepgram is timing out
4. ❌ **Empty transcripts being published** - ASR worker is publishing `(EMPTY)` transcripts

## Changes Made

### 1. Enhanced KeepAlive Logging
- Changed KeepAlive logs from `console.debug()` to `console.info()` so they appear in production logs
- You should now see:
  - `📡 Sent initial KeepAlive (JSON) for {interactionId}`
  - `📡 Sent periodic KeepAlive (JSON) for {interactionId}` (every 3 seconds)

### 2. Enhanced Buffer Management Logging
- Added logging when new audio chunks arrive:
  - `📥 Received audio chunk:` - Shows when new audio frames arrive from Redis
- Added logging when buffers are cleared:
  - `✅ Cleared {count} chunks from buffer for {interactionId} after processing`

### 3. What to Look For in New Logs

After deploying these changes, check the logs for:

1. **KeepAlive Messages:**
   ```
   [DeepgramProvider] 📡 Sent initial KeepAlive (JSON) for call-XXX
   [DeepgramProvider] 📡 Sent periodic KeepAlive (JSON) for call-XXX
   ```
   - If you DON'T see these, KeepAlive isn't being sent
   - If you DO see these but Deepgram still times out, KeepAlive format might be wrong

2. **New Audio Chunks:**
   ```
   [ASRWorker] 📥 Received audio chunk: { seq: X, totalChunksInBuffer: Y }
   ```
   - If `seq` stays at 3, new audio frames aren't arriving from Exotel
   - If `seq` increases, new audio is arriving but buffer might not be clearing

3. **Buffer Clearing:**
   ```
   [ASRWorker] ✅ Cleared 3 chunks from buffer for call-XXX after processing
   ```
   - If you DON'T see this, buffers aren't being cleared
   - If you DO see this but `seq` stays the same, new audio isn't arriving

4. **Deepgram Transcript Events:**
   ```
   [DeepgramProvider] 📨 Transcript event received for call-XXX
   ```
   - If you DON'T see this, Deepgram isn't returning transcripts (the main issue)

## Root Cause Analysis

Based on the logs, the most likely issues are:

### Issue 1: KeepAlive Format/Method
The Deepgram SDK's `connection.send()` method might only accept binary audio data, not JSON text frames. KeepAlive messages might need to be sent differently, or Deepgram might not require explicit KeepAlive if audio is sent regularly.

**Possible Fix:** Check Deepgram SDK documentation for the correct KeepAlive format, or verify if KeepAlive is needed at all.

### Issue 2: Audio Chunks Too Small/Repeated
- Audio chunks are only 108ms (1731 bytes at 8kHz)
- The same chunk (`seq: 3`) is being sent repeatedly
- Deepgram might ignore repeated, identical small chunks

**Possible Fix:** 
- Verify new audio frames are arriving from Exotel
- Increase buffer window further (currently 1000ms)
- Ensure buffer is cleared after processing

### Issue 3: Audio Format
- Sample rate: 8000 Hz
- Encoding: linear16
- Channels: 1
- Format looks correct, but Deepgram might have specific requirements

**Possible Fix:** Verify Deepgram accepts 8kHz audio (some models require 16kHz+)

## Next Steps

1. **Deploy these changes** to Render (ASR Worker service)
2. **Monitor the new logs** to see:
   - Are KeepAlive messages being sent?
   - Are new audio chunks arriving?
   - Are buffers being cleared?
3. **Check Deepgram SDK documentation** for:
   - Correct KeepAlive format/method
   - Minimum audio chunk size/frequency
   - Supported sample rates for the model

## Expected Behavior After Fix

Once the issues are resolved, you should see:
1. ✅ KeepAlive messages being sent every 3 seconds
2. ✅ New audio chunks arriving with increasing `seq` numbers
3. ✅ Buffers being cleared after processing
4. ✅ Deepgram transcript events: `📨 Transcript event received`
5. ✅ Real transcripts being published (not `(EMPTY)`)

## Questions to Answer

1. **Are KeepAlive messages being sent?** (Check for `📡 Sent periodic KeepAlive`)
2. **Are new audio frames arriving?** (Check for `📥 Received audio chunk` with increasing `seq`)
3. **Are buffers being cleared?** (Check for `✅ Cleared X chunks from buffer`)
4. **Is Deepgram receiving audio?** (Check for any Deepgram events other than Open/Close)

If all of the above are YES but you still don't see transcript events, the issue is likely:
- KeepAlive format is incorrect
- Audio format is incompatible with Deepgram
- Deepgram API key or account issue


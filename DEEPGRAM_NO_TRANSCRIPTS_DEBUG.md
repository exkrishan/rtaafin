# 🔍 Deepgram No Transcripts - Debug Analysis

## 🚨 Critical Issues Identified

### Issue 1: Deepgram Not Returning Transcripts ❌
**Symptom:**
- ✅ Connection opens: `✅ Connection opened`
- ✅ Audio sent: `📤 Sent audio chunk, size=1731`
- ❌ **NO transcripts received** - Only timeouts: `⚠️ Timeout waiting for transcript`
- ❌ Empty transcripts published: `text: '(EMPTY)'`

**Root Cause Analysis:**
1. **No Error Events** - Deepgram isn't sending error events (would see `❌ Error` in logs)
2. **No Transcript Events** - Deepgram isn't sending transcript events (would see `📝 Received transcript`)
3. **Only Timeouts** - After 5 seconds, timeout fires and empty transcript is returned

**Possible Causes:**
- ❌ **Sample rate mismatch** - Exotel sends 8kHz, but Deepgram connection might be configured wrong
- ❌ **Audio format issue** - Audio might not be in correct format for Deepgram
- ❌ **API key issue** - API key might be invalid or have wrong permissions
- ❌ **Connection.send() issue** - Audio might not be reaching Deepgram
- ❌ **Deepgram API issue** - API might be rejecting the audio silently

---

### Issue 2: Connection Keeps Closing ❌
**Symptom:**
- Connection opens successfully
- Then closes unexpectedly: `🔒 Connection closed`
- New connection created, cycle repeats

**Possible Causes:**
- Connection might be timing out
- Deepgram might be closing connection due to errors
- Network issues

---

### Issue 3: Same seq=3 Repeatedly ❌
**Symptom:**
- Same audio chunk (seq=3) is being processed repeatedly
- Same chunk sent to Deepgram multiple times

**Possible Causes:**
- Buffer not being cleared after processing
- Audio frames being redelivered from Redis

---

## 🔧 Debugging Steps

### Step 1: Check Sample Rate

**Check Ingest logs for:**
```
[exotel] Start event received: { sample_rate: 8000, ... }
```

**Check ASR Worker logs for:**
- What sample rate is being passed to Deepgram
- Should match Exotel's sample rate

**Expected:**
- Exotel: 8kHz (8000 Hz) default
- Deepgram connection: Should be created with same sample rate

---

### Step 2: Check Deepgram API Key

**Verify:**
1. API key is correct: `d65326fff430ad13ad6ad78acfe305a8d8c8245e`
2. API key has proper permissions
3. Check Deepgram dashboard for API usage/errors

**Test API key:**
```bash
curl -X POST "https://api.deepgram.com/v1/listen" \
  -H "Authorization: Token d65326fff430ad13ad6ad78acfe305a8d8c8245e" \
  -H "Content-Type: audio/wav" \
  --data-binary @test.wav
```

---

### Step 3: Check Audio Format

**Verify:**
- Audio is PCM16 (linear16)
- Sample rate matches (8kHz, 16kHz, or 24kHz)
- Audio data is valid (not corrupted)

**Check logs for:**
- Audio chunk size: `size=1731` (this seems small - might be issue)
- Sample rate in Deepgram connection config

---

### Step 4: Add More Logging

**Need to add:**
1. Log Deepgram connection config (sample rate, encoding)
2. Log any Deepgram API errors (might be silent)
3. Log audio chunk details before sending
4. Log Deepgram response (even if empty)

---

## 🎯 Most Likely Issues

### Issue A: Sample Rate Mismatch (Most Likely)

**Problem:**
- Exotel sends 8kHz audio
- Deepgram connection might be created with wrong sample rate
- Or sample rate not being passed correctly

**Fix:**
- Verify sample rate from audio frame is passed to Deepgram
- Ensure Deepgram connection uses same sample rate as audio

---

### Issue B: Audio Format Issue

**Problem:**
- Audio might not be in correct format
- Deepgram expects specific format (linear16/PCM16)

**Fix:**
- Verify audio encoding matches Deepgram requirements
- Check if audio needs conversion

---

### Issue C: API Key Permissions

**Problem:**
- API key might not have live transcription permissions
- Or key might be invalid

**Fix:**
- Verify API key in Deepgram dashboard
- Test with curl to confirm key works

---

## 🔧 Immediate Fixes Needed

### Fix 1: Add Error Logging

Add logging to catch Deepgram API errors:
```typescript
connection.on(LiveTranscriptionEvents.Error, (error: any) => {
  console.error(`[DeepgramProvider] ❌ API Error:`, {
    error: error.message || String(error),
    code: error.code,
    type: error.type,
    interactionId,
  });
});
```

### Fix 2: Log Connection Config

Log the exact config being sent to Deepgram:
```typescript
console.info(`[DeepgramProvider] Connection config:`, {
  model: 'nova-2',
  language: 'en-US',
  sample_rate: sampleRate,
  encoding: 'linear16',
  interactionId,
});
```

### Fix 3: Log Audio Details

Log audio chunk details before sending:
```typescript
console.info(`[DeepgramProvider] Sending audio:`, {
  interactionId,
  seq,
  size: audio.length,
  sampleRate,
  expectedDuration: (audio.length / 2 / sampleRate * 1000).toFixed(0) + 'ms',
});
```

---

## 📊 What to Check in Logs

### In ASR Worker Logs, Look For:

1. **Sample Rate:**
   ```
   [ASRWorker] Received audio frame: { sample_rate: 8000, ... }
   [DeepgramProvider] Connection config: { sample_rate: 8000, ... }
   ```

2. **Deepgram Errors:**
   ```
   [DeepgramProvider] ❌ API Error: { ... }
   ```

3. **Audio Details:**
   ```
   [DeepgramProvider] Sending audio: { size: 1731, sampleRate: 8000, ... }
   ```

4. **Transcript Events:**
   ```
   [DeepgramProvider] 📝 Received transcript: { text: "...", ... }
   ```

---

## 🚨 Current Status

**What's Working:**
- ✅ Connection opens successfully
- ✅ Audio chunks are being sent
- ✅ No `start()` errors (fixed)

**What's NOT Working:**
- ❌ No transcripts from Deepgram
- ❌ Only timeouts (5 seconds)
- ❌ Empty transcripts published
- ❌ Connection keeps closing

**Next Steps:**
1. Add detailed logging to Deepgram provider
2. Check sample rate matching
3. Verify API key permissions
4. Test with known good audio file

---

## 🔍 Need More Info

To debug further, I need:

1. **Ingest Service Logs:**
   - What sample rate is Exotel sending?
   - Are audio frames being published correctly?

2. **ASR Worker Logs (with more detail):**
   - What sample rate is being passed to Deepgram?
   - Any Deepgram API errors?
   - Audio chunk details?

3. **Deepgram Dashboard:**
   - API usage/errors
   - Connection attempts
   - Any rejections?

Let me add enhanced logging to help debug this.


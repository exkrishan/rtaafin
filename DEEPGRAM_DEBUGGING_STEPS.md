# 🔍 Deepgram No Transcripts - Debugging Steps

## 🚨 Current Issue

**Symptom:**
- ✅ Connection opens: `✅ Connection opened`
- ✅ Audio sent: `📤 Sent audio chunk, size=1731`
- ❌ **NO transcripts received** - Only timeouts
- ❌ Empty transcripts published (filtered out, so UI shows nothing)

---

## ✅ Enhanced Logging Added

I've added detailed logging to help debug. After deployment, you'll see:

### 1. Connection Config Logging
```
[DeepgramProvider] Connection config: {
  interactionId: 'call-1762532332133',
  model: 'nova-2',
  sample_rate: 8000,  ← Check this matches Exotel
  encoding: 'linear16',
  ...
}
```

### 2. Audio Details Logging
```
[ASRWorker] Processing audio buffer: {
  interaction_id: 'call-1762532332133',
  seq: 3,
  sampleRate: 8000,  ← Check this matches
  audioSize: 1731,
  chunksCount: 3,
  bufferAge: 300
}

[DeepgramProvider] 📤 Sending audio chunk: {
  interactionId: 'call-1762532332133',
  seq: 3,
  size: 1731,
  sampleRate: 8000,  ← Check this matches
  samples: 865,
  durationMs: '108ms',  ← Check if reasonable
  isReady: true
}
```

### 3. Enhanced Error Logging
```
[DeepgramProvider] ❌ API Error: {
  error: '...',
  code: '...',
  type: '...',
  fullError: {...}
}
```

---

## 🔍 What to Check After Deployment

### Check 1: Sample Rate Match

**In Ingest logs, look for:**
```
[exotel] Start event received: { sample_rate: 8000, ... }
```

**In ASR Worker logs, look for:**
```
[ASRWorker] Processing audio buffer: { sampleRate: 8000, ... }
[DeepgramProvider] Connection config: { sample_rate: 8000, ... }
[DeepgramProvider] 📤 Sending audio chunk: { sampleRate: 8000, ... }
```

**Expected:**
- All should show **same sample rate** (likely 8000 for Exotel)
- If they don't match → **This is the problem!**

---

### Check 2: Audio Duration

**In ASR Worker logs, look for:**
```
[DeepgramProvider] 📤 Sending audio chunk: { durationMs: '108ms', ... }
```

**Expected:**
- Should be **100-500ms** (reasonable audio chunk)
- If too small (<50ms) → Might not be enough audio
- If too large (>1000ms) → Might be buffering issue

---

### Check 3: Deepgram API Errors

**In ASR Worker logs, look for:**
```
[DeepgramProvider] ❌ API Error: { error: '...', code: '...', ... }
```

**If you see errors:**
- **401/403:** API key issue
- **400:** Bad request (format/sample rate issue)
- **500:** Deepgram server error

---

### Check 4: Connection Lifecycle

**In ASR Worker logs, look for:**
```
[DeepgramProvider] ✅ Connection opened
[DeepgramProvider] 🔒 Connection closed  ← If this happens too soon, that's the problem
```

**Expected:**
- Connection should stay open during call
- If it closes immediately → Connection issue

---

## 🎯 Most Likely Issues

### Issue 1: Sample Rate Mismatch (Most Likely)

**Problem:**
- Exotel sends 8kHz audio
- But ASR Worker might be using default 24kHz
- Deepgram connection created with wrong sample rate
- Deepgram rejects audio silently

**Check:**
- Look at `sampleRate` in all logs
- Should all be **8000** (or whatever Exotel sends)

**Fix:**
- Ensure sample rate from audio frame is passed correctly
- Verify Deepgram connection uses same sample rate

---

### Issue 2: Audio Too Small

**Problem:**
- Audio chunk size: `1731 bytes`
- At 8kHz, 16-bit: `1731 / 2 / 8000 * 1000 = 108ms`
- This might be too small for Deepgram to process

**Check:**
- Look at `durationMs` in logs
- If <50ms → Too small, might need more buffering

**Fix:**
- Increase buffer window
- Or send larger chunks

---

### Issue 3: API Key Issue

**Problem:**
- API key might be invalid
- Or doesn't have live transcription permissions

**Check:**
- Look for `401` or `403` errors in logs
- Check Deepgram dashboard for API usage

**Fix:**
- Verify API key in Deepgram dashboard
- Test with curl to confirm key works

---

## 📋 Next Steps

1. **Wait for deployment** (~5-10 minutes)
2. **Make a new Exotel call** (old call might have issues)
3. **Check new logs** for:
   - Sample rate values (should all match)
   - Audio duration (should be reasonable)
   - Any Deepgram API errors
4. **Share the new logs** so I can see:
   - Connection config (sample rate)
   - Audio details (size, duration, sample rate)
   - Any errors

---

## 🔧 Quick Test

To verify API key works, test with curl:

```bash
# Test Deepgram API key
curl -X POST "https://api.deepgram.com/v1/listen" \
  -H "Authorization: Token d65326fff430ad13ad6ad78acfe305a8d8c8245e" \
  -H "Content-Type: audio/wav" \
  --data-binary @test.wav
```

If this works, API key is valid. If not, key might be wrong.

---

## 📊 Summary

**Current Status:**
- ✅ Connection opens
- ✅ Audio is sent
- ❌ No transcripts received
- ❌ Only timeouts

**Enhanced Logging Added:**
- ✅ Connection config (sample rate, encoding)
- ✅ Audio details (size, duration, sample rate)
- ✅ Enhanced error logging

**After Deployment:**
- Check sample rate matching
- Check audio duration
- Check for API errors
- Share new logs for analysis

The enhanced logging will help us identify the exact issue!


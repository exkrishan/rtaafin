# 🚨 Issue: Empty Transcripts Being Skipped

## What's Happening

The Transcript Consumer is working correctly, but it's receiving transcripts with **empty text** from the ASR Worker, which are being filtered out:

```
[TranscriptConsumer] ⚠️ Skipping transcript with EMPTY text {
  interaction_id: 'call-1762532332133',
  type: 'partial',
  seq: 4
}
```

## Root Cause

**Deepgram is not returning transcript text**, so the ASR Worker is publishing empty transcripts `(EMPTY)`.

## What to Check

### 1. Check ASR Worker Logs

Look for these patterns in **ASR Worker logs**:

**Bad (Empty Transcripts):**
```
[ASRWorker] Published partial transcript {
  text: '(EMPTY)',
  textLength: 0
}
[ASRWorker] ⚠️ WARNING: Published transcript with EMPTY text!
```

**Good (Real Transcripts):**
```
[ASRWorker] Published partial transcript {
  text: 'Hello, how can I help you?',
  textLength: 25
}
```

### 2. Check Deepgram Provider Logs

Look for these in **ASR Worker logs**:

**Connection Issues:**
```
[DeepgramProvider] ⚠️ Timeout waiting for transcript
[DeepgramProvider] 🔒 Connection closed
[DeepgramProvider] ❌ CRITICAL: Connection closed due to timeout (1011)
```

**Transcript Events:**
```
[DeepgramProvider] 📨 Transcript event received
[DeepgramProvider] ⚠️ Empty transcript received from Deepgram
```

**Good Transcripts:**
```
[DeepgramProvider] 📝 Received transcript for {interactionId} {
  text: 'Hello',
  textLength: 5
}
```

## Likely Issues

### Issue 1: Deepgram Connection Timeout (1011)

**Symptoms:**
- `Connection closed due to timeout (1011)`
- `Timeout waiting for transcript`

**Cause:**
- KeepAlive messages not being sent/recognized
- Audio chunks too small/infrequent
- Connection not receiving continuous audio

**Check:**
- Look for `📡 Sent periodic KeepAlive` in logs
- Check if audio chunks are being sent continuously
- Verify connection stays open

### Issue 2: Deepgram Not Receiving Audio

**Symptoms:**
- Connection opens successfully
- But no transcript events received
- Timeout after 5 seconds

**Cause:**
- Audio format incorrect
- Sample rate mismatch
- Audio data not being sent properly

**Check:**
- Look for `📤 Sending audio chunk` in logs
- Verify audio size and duration
- Check sample rate matches (8000 Hz for Exotel)

### Issue 3: Empty Transcripts from Deepgram

**Symptoms:**
- Transcript events received
- But `transcriptText` is empty or whitespace

**Cause:**
- Deepgram received audio but couldn't transcribe
- Audio quality too poor
- Language mismatch

**Check:**
- Look for `Empty transcript received from Deepgram` in logs
- Check raw data in logs
- Verify audio quality

## Quick Fixes to Try

### Fix 1: Verify Deepgram Connection

Check ASR Worker logs for:
```
[DeepgramProvider] ✅ Connection opened
[DeepgramProvider] 📡 Sent periodic KeepAlive
```

If you don't see KeepAlive messages, the connection might be timing out.

### Fix 2: Check Audio Flow

Look for continuous:
```
[ASRWorker] 📥 Received audio chunk
[ASRWorker] Processing audio buffer
[DeepgramProvider] 📤 Sending audio chunk
```

If there are gaps, audio isn't flowing continuously.

### Fix 3: Verify Deepgram API Key

Check ASR Worker logs for:
```
[DeepgramProvider] Initialized with API key
```

If you see errors about API key, it's not configured correctly.

## Next Steps

1. **Check ASR Worker logs** for Deepgram connection status
2. **Look for KeepAlive messages** - should see them every 3 seconds
3. **Check for transcript events** - should see `📨 Transcript event received`
4. **Verify audio is being sent** - should see `📤 Sending audio chunk` regularly
5. **Check for errors** - look for `❌` or `⚠️` messages

## Expected Log Flow (Good)

```
[DeepgramProvider] ✅ Connection opened
[DeepgramProvider] 📡 Sent initial KeepAlive
[ASRWorker] 📥 Received audio chunk
[ASRWorker] Processing audio buffer
[DeepgramProvider] 📤 Sending audio chunk
[DeepgramProvider] 📡 Sent periodic KeepAlive
[DeepgramProvider] 📨 Transcript event received
[DeepgramProvider] 📝 Received transcript { text: 'Hello', ... }
[ASRWorker] Published partial transcript { text: 'Hello', ... }
[TranscriptConsumer] Received transcript message { text: 'Hello', ... }
[TranscriptConsumer] ✅ Forwarded transcript successfully
```

## Current Log Flow (Bad)

```
[DeepgramProvider] ✅ Connection opened
[ASRWorker] 📥 Received audio chunk
[DeepgramProvider] 📤 Sending audio chunk
[DeepgramProvider] ⚠️ Timeout waiting for transcript
[ASRWorker] Published partial transcript { text: '(EMPTY)' }
[TranscriptConsumer] ⚠️ Skipping transcript with EMPTY text
```

---

**The issue is in the Deepgram → ASR Worker flow, not the Transcript Consumer!**

Check ASR Worker logs to see why Deepgram isn't returning transcripts.


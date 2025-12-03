# ElevenLabs Integration Diagnostic Checklist

## Problem: ElevenLabs Dashboard Shows 0 API Requests

If the ElevenLabs Usage dashboard shows **0 Total Requests Completed** and **0 Max Concurrent Requests**, it means **no audio is being sent to ElevenLabs**.

## Diagnostic Steps

### Step 1: Check if ASR Worker is Receiving Messages from Redis

**Look for this log in ASR worker logs:**
```
[ASRWorker] 📨 Message received from Redis for topic audio_stream
```

**If you DON'T see this log:**
- ❌ ASR worker is not receiving messages from Redis
- **Possible causes:**
  - Redis subscription failed
  - Wrong topic name
  - Redis connection issue
  - Consumer group issue

**If you DO see this log:**
- ✅ Messages are being received from Redis
- **Proceed to Step 2**

---

### Step 2: Check if Audio is Being Processed

**Look for this log in ASR worker logs:**
```
[ASRWorker] 🎵 Processing audio for {interactionId}
```

**If you DON'T see this log:**
- ❌ Audio is not being processed
- **Possible causes:**
  - `EXO_BRIDGE_ENABLED != true` (check for `❌ CRITICAL: Bridge disabled` log)
  - Missing audio field in message (check for `⚠️ Message missing audio field!` log)
  - Invalid audio format (check for `❌ CRITICAL: Invalid or missing audio field` log)
  - Call has ended (check for `⏸️ Skipping audio - call has ended` log)

**If you DO see this log:**
- ✅ Audio is being processed
- **Proceed to Step 3**

---

### Step 3: Check if ElevenLabs Connection is Being Created

**Look for these logs in ASR worker logs:**
```
[ElevenLabsProvider] 🔑 Creating single-use token for {interactionId}...
[ElevenLabsProvider] ✅ Created single-use token (expires in 15 minutes)
[ElevenLabsProvider] 🔌 Attempting to connect to ElevenLabs for {interactionId}
[ElevenLabsProvider] ✅ Connection opened for {interactionId}
[ElevenLabsProvider] ✅ Session started for {interactionId}
```

**If you DON'T see these logs:**
- ❌ ElevenLabs connection is not being created
- **Possible causes:**
  - `ELEVENLABS_API_KEY` is missing or invalid
  - Single-use token creation failed (check for `❌ Failed to create single-use token` log)
  - Connection timeout (check for `⚠️ Connection open timeout` or `⚠️ Session start timeout` log)
  - Authentication error (check for `❌ Authentication error` log)

**If you DO see these logs:**
- ✅ ElevenLabs connection is established
- **Proceed to Step 4**

---

### Step 4: Check if Audio is Being Sent to ElevenLabs

**Look for this log in ASR worker logs:**
```
[ElevenLabsProvider] 📤 Sent audio chunk to ElevenLabs:
```

**If you DON'T see this log:**
- ❌ Audio is not being sent to ElevenLabs
- **Possible causes:**
  - Buffer not accumulating enough audio (check for `⏳ Buffer too small` log)
  - Timer not triggering (check for `⏰ Timer tick` logs)
  - Connection not ready (check for `Connection not ready after wait` log)
  - Sample rate mismatch (check for `❌ CRITICAL: Sample rate mismatch` log)

**If you DO see this log:**
- ✅ Audio is being sent to ElevenLabs
- **But ElevenLabs still shows 0 requests?**
  - Check for errors after send (look for `Error sending audio` log)
  - Check if WebSocket is actually connected (look for `WebSocket is not connected` error)
  - Verify API key has Speech-to-Text permissions
  - Check ElevenLabs account subscription status

---

## Quick Diagnostic Commands

### Check ASR Worker Logs for Key Events

```bash
# Check if messages are being received from Redis
grep "📨 Message received from Redis" <asr-worker-logs>

# Check if audio is being processed
grep "🎵 Processing audio for" <asr-worker-logs>

# Check if ElevenLabs connections are being created
grep "✅ Session started" <asr-worker-logs>

# Check if audio is being sent to ElevenLabs
grep "📤 Sent audio chunk to ElevenLabs" <asr-worker-logs>

# Check for errors
grep "❌\|⚠️\|Error" <asr-worker-logs>
```

### Check ASR Worker Health Endpoint

```bash
curl https://asr11labs.onrender.com/health
```

**Look for:**
- `activeConnections`: Should be > 0 if connections are established
- `audioChunksSent`: Should be > 0 if audio is being sent
- `transcriptsReceived`: Should be > 0 if transcripts are being received

---

## Common Issues and Solutions

### Issue 1: Bridge Disabled

**Symptom:** Log shows `❌ CRITICAL: Bridge disabled (EXO_BRIDGE_ENABLED != true)`

**Solution:**
```bash
# Set environment variable in Render
EXO_BRIDGE_ENABLED=true
```

### Issue 2: Missing Audio Field

**Symptom:** Log shows `⚠️ Message missing audio field!`

**Solution:**
- Check ingest service logs to verify audio is being published correctly
- Verify Redis message structure matches expected format

### Issue 3: Connection Timeout

**Symptom:** Log shows `⚠️ Session start timeout`

**Solution:**
- Verify `ELEVENLABS_API_KEY` is correct
- Check network connectivity from Render to ElevenLabs
- Verify API key has Speech-to-Text permissions

### Issue 4: Authentication Error

**Symptom:** Log shows `❌ Authentication error`

**Solution:**
- Verify API key is correct and has Speech-to-Text permissions
- Check account subscription includes Speech-to-Text access
- Verify single-use token creation is successful

### Issue 5: Buffer Not Accumulating Audio

**Symptom:** Log shows `⏳ Buffer too small` repeatedly

**Solution:**
- Check if audio chunks are arriving frequently enough
- Verify sample rate is correct (8000 Hz for telephony)
- Check if timer is triggering (look for `⏰ Timer tick` logs)

---

## Expected Log Flow (Successful Integration)

```
1. [ASRWorker] 📨 Message received from Redis for topic audio_stream
2. [ASRWorker] 🎵 Processing audio for {interactionId}
3. [ASRWorker] 📥 Added chunk to buffer for {interactionId}
4. [ElevenLabsProvider] 🔑 Creating single-use token for {interactionId}...
5. [ElevenLabsProvider] ✅ Created single-use token (expires in 15 minutes)
6. [ElevenLabsProvider] ✅ Connection opened for {interactionId}
7. [ElevenLabsProvider] ✅ Session started for {interactionId}
8. [ASRWorker] 📤 Timer: Triggering send for {interactionId}
9. [ElevenLabsProvider] 📤 Sent audio chunk to ElevenLabs: {interactionId, seq, size, ...}
10. [ElevenLabsProvider] 📝 Transcript (PARTIAL/FINAL): {text, ...}
```

If any step is missing, that's where the integration is failing.


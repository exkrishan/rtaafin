# How to Check if ElevenLabs is Receiving Audio Chunks

## 🔍 Quick Check (2 minutes)

### Step 1: Check ASR Worker Logs

**Look for this log pattern:**
```
[ElevenLabsProvider] 📤 Sent audio chunk to ElevenLabs:
```

**If you see this log:**
- ✅ Audio chunks ARE being sent to ElevenLabs
- Check the log details for:
  - `size`: Audio chunk size in bytes
  - `durationMs`: Audio duration in milliseconds
  - `sampleRate`: Sample rate (should be 16000 for ElevenLabs)
  - `connectionReady`: Should be `true`
  - `hasConnection`: Should be `true`

**If you DON'T see this log:**
- ❌ Audio chunks are NOT being sent
- See troubleshooting section below

---

## 📊 Detailed Verification Steps

### Step 1: Verify WebSocket Connection is Established

**Look for these logs in ASR Worker:**

```
[ElevenLabsProvider] ✅ Created single-use token (expires in 15 minutes)
[ElevenLabsProvider] ✅ Connection opened for {interactionId}
[ElevenLabsProvider] ✅ Session started for {interactionId}
[ElevenLabsProvider] ✅ Connection ready for {interactionId}
```

**What this means:**
- ✅ WebSocket connection to ElevenLabs is established
- ✅ Session is active and ready to receive audio

**If you DON'T see these:**
- ❌ Connection failed - check for errors:
  - `❌ Failed to create single-use token`
  - `⚠️ Connection open timeout`
  - `⚠️ Session start timeout`
  - `❌ Authentication error`

---

### Step 2: Verify Audio is Being Sent

**Look for this log:**
```
[ElevenLabsProvider] 📤 Sent audio chunk to ElevenLabs: {
  interactionId: '...',
  seq: 123,
  size: 8192,              ← Audio size in bytes
  durationMs: '40.00',     ← Audio duration
  sampleRate: 16000,       ← Should be 16000
  connectionSampleRate: 16000,
  sampleRateMatch: true,   ← Should be true
  base64Length: 10924,     ← Base64 encoded length
  hasConnection: true,     ← Should be true
  connectionReady: true,   ← Should be true
  payloadFields: {
    hasAudioBase64: true,  ← Should be true
    hasSampleRate: true,   ← Should be true
    commit: 'immediate'    ← Commit strategy
  }
}
```

**What to check:**
- ✅ `hasConnection: true` - Connection exists
- ✅ `connectionReady: true` - Connection is ready
- ✅ `sampleRateMatch: true` - Sample rates match
- ✅ `hasAudioBase64: true` - Audio is base64 encoded
- ✅ `size > 0` - Audio has content

**If you see errors:**
- `❌ CRITICAL: Sample rate mismatch` - Connection sample rate doesn't match audio
- `❌ CRITICAL: Base64 encoding failed` - Audio encoding failed
- `Error sending audio` - WebSocket send failed

---

### Step 3: Verify ElevenLabs is Receiving (Raw WebSocket Messages)

**Look for this log:**
```
[ElevenLabsProvider] 🔍 RAW WebSocket message received for {interactionId}: {
  messageType: 'partial_transcript' or 'committed_transcript',
  hasTranscript: true,
  hasText: true,
  ...
}
```

**What this means:**
- ✅ ElevenLabs IS receiving audio
- ✅ ElevenLabs IS processing it
- ✅ ElevenLabs IS sending back transcripts

**If you DON'T see this:**
- ❌ ElevenLabs may not be receiving audio
- Check for WebSocket errors
- Verify API key has correct permissions

---

### Step 4: Check Metrics

**Check ASR Worker health endpoint:**
```bash
curl https://rtaa-asr-worker.onrender.com/health
```

**Look for:**
```json
{
  "elevenlabs": {
    "audioChunksSent": 150,        ← Should be > 0
    "transcriptsReceived": 50,      ← Should be > 0
    "emptyTranscriptsReceived": 10,
    "connectionsCreated": 1,
    "connectionsReused": 0,
    "errors": 0                     ← Should be 0 or low
  }
}
```

**What to check:**
- ✅ `audioChunksSent > 0` - Audio is being sent
- ✅ `transcriptsReceived > 0` - Transcripts are being received
- ✅ `errors: 0` - No errors

---

## 🔍 Log Search Commands

### Search for Audio Sending Logs

```bash
# In ASR Worker logs, search for:
grep "📤 Sent audio chunk to ElevenLabs" <logs>

# Or search for:
grep "ElevenLabsProvider.*Sent audio" <logs>
```

### Search for Connection Logs

```bash
# Check if connection is established:
grep "✅ Connection opened\|✅ Session started\|✅ Connection ready" <logs>

# Check for connection errors:
grep "❌\|⚠️.*Connection\|Error.*connection" <logs>
```

### Search for Raw WebSocket Messages

```bash
# Check if ElevenLabs is responding:
grep "🔍 RAW WebSocket message received" <logs>

# Check for transcript events:
grep "partial_transcript\|committed_transcript" <logs>
```

---

## 🐛 Troubleshooting

### Problem 1: No "Sent audio chunk" Logs

**Possible Causes:**
1. **Buffer not accumulating enough audio**
   - Look for: `⏳ Buffer too small` or `Timer: hasMinimumChunkSize: false`
   - **Fix:** Audio chunks may be too small, wait for more audio

2. **Connection not ready**
   - Look for: `Connection not ready after wait`
   - **Fix:** Connection may be still establishing, check connection logs

3. **Silence detection skipping audio**
   - Look for: `⏸️ Skipping silence - not sending to ElevenLabs`
   - **Fix:** This is expected for silence, but may be too aggressive

4. **Sample rate mismatch**
   - Look for: `❌ CRITICAL: Sample rate mismatch`
   - **Fix:** Connection will be recreated, check next attempt

### Problem 2: "Sent audio chunk" but No Transcripts

**Possible Causes:**
1. **ElevenLabs not processing**
   - Check for: `🔍 RAW WebSocket message received` logs
   - If missing, ElevenLabs may not be receiving or processing

2. **WebSocket connection issues**
   - Look for: `WebSocket is not connected` errors
   - **Fix:** Connection will be recreated automatically

3. **Empty transcripts**
   - Look for: `Received transcript with EMPTY text`
   - **Fix:** Audio may be silence or too quiet

4. **API key permissions**
   - Verify API key has Speech-to-Text (Scribe) permissions
   - Check ElevenLabs account subscription status

### Problem 3: Connection Errors

**Look for:**
- `❌ Failed to create single-use token`
- `⚠️ Connection open timeout`
- `⚠️ Session start timeout`
- `❌ Authentication error`

**Fixes:**
1. Verify `ELEVENLABS_API_KEY` is set correctly
2. Check API key has correct permissions
3. Verify network connectivity to ElevenLabs
4. Check ElevenLabs service status

---

## 📋 Complete Verification Checklist

### ✅ Connection Established
- [ ] `✅ Created single-use token` log present
- [ ] `✅ Connection opened` log present
- [ ] `✅ Session started` log present
- [ ] `✅ Connection ready` log present
- [ ] Health endpoint shows `activeConnections: 1`

### ✅ Audio Being Sent
- [ ] `📤 Sent audio chunk to ElevenLabs` logs present
- [ ] `audioChunksSent` metric > 0 in health endpoint
- [ ] Log shows `hasConnection: true`
- [ ] Log shows `connectionReady: true`
- [ ] Log shows `sampleRateMatch: true`

### ✅ ElevenLabs Receiving
- [ ] `🔍 RAW WebSocket message received` logs present (if enabled)
- [ ] `transcriptsReceived` metric > 0 in health endpoint
- [ ] No `WebSocket is not connected` errors
- [ ] No connection timeout errors

### ✅ Transcripts Being Generated
- [ ] `📥 Received transcript` logs present
- [ ] Transcripts have non-empty `text` field
- [ ] Transcripts being published to Redis
- [ ] `transcriptsReceived` > `emptyTranscriptsReceived`

---

## 🎯 Quick Test

### Make a Test Call and Check Logs

1. **Start a call from Exotel**
2. **Speak something clearly** (not silence)
3. **Check ASR Worker logs for:**

```
[ElevenLabsProvider] 📤 Sent audio chunk to ElevenLabs: {
  interactionId: '...',
  seq: 1,
  size: 8192,
  ...
}
```

4. **Within 1-2 seconds, you should see:**

```
[ElevenLabsProvider] 📥 Received transcript: {
  type: 'partial',
  text: '...',  ← Should have actual text
  ...
}
```

**If you see "Sent" but no "Received":**
- ❌ ElevenLabs is not processing the audio
- Check for errors or connection issues

**If you see "Received" but text is empty:**
- ⚠️ Audio may be silence or too quiet
- Check audio quality metrics in logs

---

## 📊 Expected Log Flow

### Successful Flow:
```
1. [ElevenLabsProvider] ✅ Created single-use token
2. [ElevenLabsProvider] ✅ Connection opened for {id}
3. [ElevenLabsProvider] ✅ Session started for {id}
4. [ElevenLabsProvider] ✅ Connection ready for {id}
5. [ElevenLabsProvider] 📤 Sent audio chunk to ElevenLabs: {seq: 1, ...}
6. [ElevenLabsProvider] 📥 Received transcript: {text: "Hello", ...}
7. [ASRWorker] Published partial transcript: {text: "Hello", ...}
```

### Failed Flow (No Audio Sent):
```
1. [ElevenLabsProvider] ✅ Created single-use token
2. [ElevenLabsProvider] ✅ Connection opened for {id}
3. [ElevenLabsProvider] ✅ Session started for {id}
4. [ElevenLabsProvider] ✅ Connection ready for {id}
5. [ASRWorker] ⏸️ Skipping silence - not sending to ElevenLabs
   OR
5. [ASRWorker] ⏳ Buffer too small (waiting for more audio)
```

---

## 🔗 Key Files

- **Provider:** `services/asr-worker/src/providers/elevenlabsProvider.ts`
- **Main Worker:** `services/asr-worker/src/index.ts`
- **Health Endpoint:** `services/asr-worker/src/index.ts` (GET /health)

---

## 📞 Quick Commands

```bash
# Check health
curl https://rtaa-asr-worker.onrender.com/health | jq '.elevenlabs'

# Search logs for audio sending
grep "📤 Sent audio chunk" <logs>

# Search for connection status
grep "Connection.*ready\|Session.*started" <logs>

# Search for errors
grep "❌\|Error.*ElevenLabs" <logs>
```


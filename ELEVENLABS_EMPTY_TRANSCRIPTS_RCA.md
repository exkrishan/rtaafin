# ElevenLabs Empty Transcripts - Root Cause Analysis

## Problem
- **Symptom**: Transcript timeouts (5 seconds) followed by empty transcripts being published
- **Log Pattern**: 
  ```
  [ElevenLabsProvider] ⚠️ Transcript timeout for {interactionId} { seq: 117, timeout: '5s' }
  [ASRWorker] Published partial transcript { text: '(EMPTY)', textLength: 0 }
  [ASRWorker] ⚠️ WARNING: Published transcript with EMPTY text!
  ```

## Root Cause

**ElevenLabs is not sending transcript events** (`PARTIAL_TRANSCRIPT` or `COMMITTED_TRANSCRIPT`).

### Evidence:
1. ✅ Audio chunks are being sent successfully (seq 122, 123)
2. ✅ Connection is established (WebSocket opened, session started)
3. ❌ No transcript events received from ElevenLabs
4. ❌ Timeout after 5 seconds → returns empty transcript

### Possible Reasons:

#### 1. **Silence Detection (Most Likely)**
- Audio might be silence or very low volume
- ElevenLabs VAD (Voice Activity Detection) filters out silence
- No transcripts generated for silence periods
- **Check**: Look for `[ASRWorker] ℹ️ Audio appears to be silence` logs

#### 2. **Insufficient Audio Duration**
- VAD needs minimum speech duration before committing
- Current setting: `minSpeechDurationMs: 100ms`
- If audio chunks are too short or sparse, VAD won't trigger
- **Check**: Audio duration in logs (`totalAudioDurationMs`)

#### 3. **Event Handlers Not Receiving Data**
- WebSocket connection established but events not firing
- SDK event listeners might not be properly attached
- **Check**: Look for new debug logs:
  - `📨 Received PARTIAL_TRANSCRIPT event`
  - `📨 Received COMMITTED_TRANSCRIPT event`
  - `🔔 Received {eventName} event` (for other events)

#### 4. **Audio Format Issues**
- Sample rate mismatch (sending 8kHz but ElevenLabs expects different)
- Audio encoding issues
- **Check**: Verify `sampleRate` in send logs matches connection setup

## Debugging Steps

### 1. Check for Event Reception
After deploying the updated code, look for:
```
[ElevenLabsProvider] 📨 Received PARTIAL_TRANSCRIPT event for {interactionId}
[ElevenLabsProvider] 📨 Received COMMITTED_TRANSCRIPT event for {interactionId}
```

**If these logs appear**: Events are being received, but might be empty
**If these logs DON'T appear**: Events are not being sent by ElevenLabs

### 2. Check Audio Quality
Look for:
```
[ASRWorker] ℹ️ Audio appears to be silence (energy: X, max: Y)
```

**If energy is very low (< 100)**: Audio is likely silence
**If energy is high**: Audio has content, but ElevenLabs isn't transcribing

### 3. Check Connection State
Look for:
```
[ElevenLabsProvider] 📤 Sent audio chunk to ElevenLabs: {
  connectionReady: true,
  pendingResolvers: X,
  queuedTranscripts: Y
}
```

**If `connectionReady: false`**: Connection not fully established
**If `pendingResolvers` keeps growing**: Events not being received

### 4. Check All Events
Look for:
```
[ElevenLabsProvider] 🔔 Received {eventName} event
```

This will show ALL events ElevenLabs is sending (if any)

## Solutions

### Solution 1: Adjust VAD Settings (If Audio is Silence)
If audio is silence, this is expected behavior. Options:
- Accept empty transcripts for silence
- Adjust `vadThreshold` to be more sensitive (lower value = more sensitive)
- Adjust `minSpeechDurationMs` to be shorter

### Solution 2: Check Audio Source
- Verify the audio source (Exotel) is sending actual speech, not silence
- Check audio levels/volume
- Verify sample rate matches (should be 8000 Hz for telephony)

### Solution 3: Manual Commit Strategy
Switch from VAD to manual commit:
- Set `commitStrategy: CommitStrategy.MANUAL`
- Manually commit every 20-30 seconds
- This forces transcripts even for silence

### Solution 4: Verify Account Access
- Confirm ElevenLabs account has Speech-to-Text access
- Verify subscription tier includes STT
- Check if there are usage limits/quota issues

## Next Steps

1. **Deploy updated code** with enhanced logging
2. **Monitor logs** for:
   - Event reception logs (`📨 Received PARTIAL_TRANSCRIPT`)
   - Audio quality logs (`Audio appears to be silence`)
   - Connection state logs (`📤 Sent audio chunk`)
3. **Analyze results**:
   - If events are received → Check if they're empty (silence)
   - If events are NOT received → Check connection/account issues
4. **Adjust configuration** based on findings

## Code Changes Made

1. ✅ Added logging for transcript event reception
2. ✅ Added logging for all ElevenLabs events
3. ✅ Enhanced audio send logging with connection state
4. ✅ Better visibility into what ElevenLabs is sending/receiving


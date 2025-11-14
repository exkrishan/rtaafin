# ElevenLabs ASR Implementation Summary

**Date:** 2025-11-14  
**Status:** ⚠️ Partially Working - Transcripts Not Appearing in UI  
**Issue:** Transcripts are being generated but not displayed in the frontend

---

## 📋 What Was Implemented

### 1. ElevenLabs Provider Integration

**File:** `services/asr-worker/src/providers/elevenlabsProvider.ts`

**Key Features:**
- WebSocket connection to ElevenLabs Scribe v2 Realtime API
- Audio chunk processing and sending
- Transcript reception (partial and final)
- Connection management and reuse
- Silence detection for telephony audio

**Configuration:**
- Uses `ELEVENLABS_API_KEY` environment variable
- Session config: `sample_rate: 16000` (ElevenLabs requirement)
- Handles both 8kHz telephony and 16kHz audio

### 2. Silence Detection Fixes

**Problem:** 8kHz telephony audio has much lower energy than 16kHz audio, causing false silence detection.

**Fixes Applied:**

**File:** `services/asr-worker/src/providers/elevenlabsProvider.ts`
```typescript
// Lower thresholds for 8kHz telephony audio
const SILENCE_THRESHOLD_8KHZ = 10;   // Was 50, then 25
const MIN_AMPLITUDE_8KHZ = 10;       // Was 500, then 50

// Skip sending silence to ElevenLabs to prevent empty transcripts
if (isSilence) {
  return { type: 'partial', text: '', isFinal: false };
}
```

**File:** `services/asr-worker/src/index.ts`
- Applied same silence detection thresholds
- Logs audio quality metrics for debugging

### 3. Audio Amplification

**File:** `services/asr-worker/src/providers/elevenlabsProvider.ts`

**Feature:** `amplifyTelephonyAudio()` method
- Amplifies 8kHz telephony audio by 2x before sending to ElevenLabs
- Improves transcription quality for quiet telephony audio
- Configurable amplification factor (default: 2.0)

### 4. ASR Worker Integration

**File:** `services/asr-worker/src/index.ts`

**Changes:**
- Added ElevenLabs provider support
- Configured silence detection thresholds
- Integrated with existing buffer management
- Publishes transcripts to Redis: `transcript.{interaction_id}`

---

## 🔄 Complete Flow

```
1. Exotel Stream Applet
   ↓ (WebSocket with audio)
2. Ingest Service (services/ingest)
   ↓ (Publishes to Redis: audio_stream)
3. ASR Worker (services/asr-worker)
   ↓ (Processes audio through ElevenLabs)
   ↓ (Publishes to Redis: transcript.{interaction_id})
4. Transcript Consumer (lib/transcript-consumer.ts)
   ↓ (Auto-discovers transcript streams)
   ↓ (Forwards to /api/calls/ingest-transcript)
5. Ingest Transcript API (app/api/calls/ingest-transcript/route.ts)
   ↓ (Broadcasts via SSE)
6. Frontend (components/AgentAssistPanelV2.tsx)
   ↓ (Receives via EventSource)
7. UI Display
```

---

## ⚠️ Current Issues

### Issue 1: Transcripts Not Appearing in UI

**Symptoms:**
- Transcripts are being generated (logs show successful processing)
- Transcript Consumer is forwarding them successfully
- SSE broadcast shows `recipients: 0` (no clients listening)
- UI shows "Waiting for transcript..."

**Root Cause:**
- **Call ID Mismatch**: UI is connected to one callId, but transcripts are for a different callId
- Example from logs:
  - UI connected to: `3c441df482db99f5cf9180765a8919be`
  - Transcripts for: `8fa998d80c08e7c31a271e05cfae19bd`
  - Result: `recipients: 0` in broadcast logs

**Evidence from Logs:**
```
[TranscriptConsumer] ✅ Forwarded transcript successfully {
  interaction_id: '8fa998d80c08e7c31a271e05cfae19bd',
  callId: '8fa998d80c08e7c31a271e05cfae19bd',
  seq: 3347,
  text: 'Good'
}

[realtime] 📡 Broadcast event {
  callId: '8fa998d80c08e7c31a271e05cfae19bd',
  recipients: 0,  ← NO CLIENTS LISTENING
  totalClients: 1  ← But there IS a client, just for different callId
}
```

### Issue 2: Empty Transcripts

**Symptoms:**
- Most transcripts are being skipped: `[TranscriptConsumer] ⚠️ Skipping transcript with EMPTY text`
- This is expected for silence, but may be too aggressive

**Current Behavior:**
- Silence detection thresholds: `SILENCE_THRESHOLD_8KHZ = 10`, `MIN_AMPLITUDE_8KHZ = 10`
- Empty transcripts are filtered out by Transcript Consumer
- This is working as designed, but may need tuning

### Issue 3: SSE Connection Instability

**Symptoms:**
- SSE connections keep closing and reopening
- Logs show: `[sse-endpoint] ❌ Stream cancelled` followed by `🔌 New SSE connection request`
- Connection duration is very short (182ms, 4939ms, 9778ms)

**Recent Fix:**
- Removed unnecessary dependencies from SSE useEffect
- Now only recreates when `interactionId` or `useSse` changes
- Should reduce connection churn

---

## 🔍 What to Check

### 1. Verify ElevenLabs Connection

**Check ASR Worker Logs:**
```bash
# Look for these logs:
[ElevenLabsProvider] ✅ WebSocket connected
[ElevenLabsProvider] 📤 Sending audio chunk
[ElevenLabsProvider] 📥 Received transcript
```

**Check for Errors:**
- WebSocket connection failures
- API key issues
- Rate limiting errors

### 2. Verify Transcript Generation

**Check ASR Worker Logs:**
```bash
# Look for:
[ASRWorker] Published partial transcript
[ASRWorker] ⚠️ WARNING: Published transcript with EMPTY text!  ← This is the problem
```

**What to Check:**
- Are transcripts being published to Redis?
- Are they empty or do they have text?
- What's the `interaction_id` in the published transcript?

### 3. Verify Transcript Consumer

**Check Frontend Logs:**
```bash
# Look for:
[TranscriptConsumer] Auto-discovered transcript stream
[TranscriptConsumer] Received transcript message
[TranscriptConsumer] ✅ Forwarded transcript successfully
```

**What to Check:**
- Is Transcript Consumer running? (should auto-start via `instrumentation.ts`)
- Is it discovering the correct transcript streams?
- Is it forwarding transcripts with the correct `callId`?

### 4. Verify SSE Connection

**Check Frontend Logs:**
```bash
# Look for:
[AgentAssistPanel] ✅ SSE connection opened
[AgentAssistPanel] 📥 Received transcript_line event
```

**What to Check:**
- Is SSE connection established?
- What `callId` is the connection using?
- Does it match the `callId` in the broadcast logs?

### 5. Verify Call ID Matching

**Critical Check:**
1. What `callId` is shown in the UI? (check auto-discovery dropdown)
2. What `interaction_id` is in the transcript messages?
3. Do they match exactly?

**From Logs:**
- UI callId: `3c441df482db99f5cf9180765a8919be`
- Transcript callId: `8fa998d80c08e7c31a271e05cfae19bd`
- **They don't match!** This is why `recipients: 0`

---

## 🛠️ Debugging Steps

### Step 1: Check ASR Worker Health

```bash
curl https://rtaa-asr-worker.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "provider": "elevenlabs",
  "activeConnections": 1,
  "transcriptsReceived": 100,
  "emptyTranscriptsReceived": 50
}
```

### Step 2: Check Active Calls

```bash
curl https://frontend-8jdd.onrender.com/api/calls/active
```

**Expected Response:**
```json
{
  "ok": true,
  "calls": [
    {
      "interactionId": "8fa998d80c08e7c31a271e05cfae19bd",
      "lastActivity": "1763094009344"
    }
  ],
  "latestCall": "8fa998d80c08e7c31a271e05cfae19bd"
}
```

### Step 3: Check Transcript Consumer Status

```bash
curl https://frontend-8jdd.onrender.com/api/transcripts/status
```

**Expected Response:**
```json
{
  "ok": true,
  "isRunning": true,
  "subscriptionCount": 5,
  "subscriptions": [
    {
      "interactionId": "8fa998d80c08e7c31a271e05cfae19bd",
      "transcriptCount": 10
    }
  ]
}
```

### Step 4: Monitor Real-Time Logs

**ASR Worker Logs:**
- Look for `[ElevenLabsProvider]` logs
- Check for transcript publishing: `[ASRWorker] Published partial transcript`
- Note the `interaction_id` in published transcripts

**Frontend Logs:**
- Look for `[TranscriptConsumer]` logs
- Check for forwarding: `[TranscriptConsumer] ✅ Forwarded transcript successfully`
- Note the `callId` being forwarded

**SSE Logs:**
- Look for `[realtime] 📡 Broadcast event`
- Check `recipients` count (should be > 0 if client is listening)
- Check `callId` in broadcast vs UI connection

---

## 📊 Key Metrics to Monitor

### 1. Transcript Generation Rate
- How many transcripts are being generated per minute?
- What percentage are empty vs non-empty?

### 2. Transcript Consumer Processing
- How many transcripts are being forwarded?
- What's the success rate of forwarding?

### 3. SSE Connection Health
- How many active SSE connections?
- What's the average connection duration?
- How many transcripts are being delivered to clients?

### 4. Call ID Matching
- How many calls have matching callIds between UI and transcripts?
- What's the mismatch rate?

---

## 🔧 Recent Fixes Applied

### Fix 1: Silence Detection Thresholds
**Date:** 2025-11-14  
**Files:**
- `services/asr-worker/src/providers/elevenlabsProvider.ts`
- `services/asr-worker/src/index.ts`

**Changes:**
- Lowered thresholds for 8kHz telephony: `SILENCE_THRESHOLD_8KHZ = 10`, `MIN_AMPLITUDE_8KHZ = 10`
- Added logic to skip sending silence to ElevenLabs

### Fix 2: Audio Amplification
**Date:** 2025-11-14  
**File:** `services/asr-worker/src/providers/elevenlabsProvider.ts`

**Changes:**
- Added `amplifyTelephonyAudio()` method
- Amplifies 8kHz audio by 2x before sending

### Fix 3: SSE Connection Stability
**Date:** 2025-11-14  
**File:** `components/AgentAssistPanelV2.tsx`

**Changes:**
- Removed unnecessary dependencies from useEffect
- Only recreates SSE connection when `interactionId` or `useSse` changes

### Fix 4: Auto-Discovery Filtering
**Date:** 2025-11-14  
**File:** `app/api/calls/active/route.ts`

**Changes:**
- Only shows calls with non-empty transcripts
- Checks last 10 messages in stream for actual content

---

## 🎯 Next Steps for Dev Guy

### Priority 1: Fix Call ID Mismatch

**Problem:** UI is connected to wrong callId

**Investigation:**
1. Check what callId the UI is using (from auto-discovery or manual input)
2. Check what `interaction_id` is in the transcript messages from ASR Worker
3. Verify they match

**Possible Causes:**
- Auto-discovery selecting wrong call
- Exotel sending different `call_sid` vs `stream_sid`
- Mapping issue between Exotel IDs and interaction IDs

**Solution:**
- Ensure UI uses the same ID that ASR Worker publishes transcripts with
- Check Exotel handler to see how it maps `call_sid` to `interaction_id`

### Priority 2: Verify Transcript Generation

**Check:**
1. Are transcripts actually being generated by ElevenLabs?
2. Are they being published to Redis?
3. Are they empty or do they have text?

**Debug:**
- Check ASR Worker logs for `[ElevenLabsProvider] 📥 Received transcript`
- Check if transcripts have `text` field populated
- Verify Redis stream has messages: `transcript.{interaction_id}`

### Priority 3: Verify End-to-End Flow

**Test Flow:**
1. Make a test call from Exotel
2. Check Ingest Service logs for `call_sid`
3. Check ASR Worker logs for `interaction_id` (should match `call_sid`)
4. Check Transcript Consumer logs for forwarding
5. Check SSE broadcast logs for `recipients` count
6. Check UI console for received events

**Expected:**
- All IDs should match throughout the flow
- `recipients` should be > 0 when UI is connected
- UI should receive `transcript_line` events

---

## 📝 Environment Variables

### ASR Worker
```bash
ELEVENLABS_API_KEY=your_api_key_here
ASR_PROVIDER=elevenlabs
REDIS_URL=your_redis_url
```

### Frontend
```bash
REDIS_URL=your_redis_url
NEXT_PUBLIC_BASE_URL=https://frontend-8jdd.onrender.com
```

---

## 🔗 Key Files Reference

### ASR Worker
- `services/asr-worker/src/providers/elevenlabsProvider.ts` - ElevenLabs integration
- `services/asr-worker/src/index.ts` - Main worker logic
- `services/asr-worker/package.json` - Dependencies

### Frontend
- `lib/transcript-consumer.ts` - Transcript Consumer
- `app/api/calls/ingest-transcript/route.ts` - Ingest API
- `app/api/events/stream/route.ts` - SSE endpoint
- `components/AgentAssistPanelV2.tsx` - UI component
- `app/test-agent-assist/page.tsx` - Test page

### Ingest Service
- `services/ingest/src/exotel-handler.ts` - Exotel WebSocket handler
- `services/ingest/src/server.ts` - Main server

---

## 📞 Support Information

**Deployed Services:**
- ASR Worker: `https://rtaa-asr-worker.onrender.com`
- Ingest Service: `https://ingestservice.onrender.com`
- Frontend: `https://frontend-8jdd.onrender.com`

**Health Endpoints:**
- ASR Worker: `/health`
- Ingest Service: `/health`
- Frontend: `/api/transcripts/status`

**Git Branch:**
- `feat/exotel-deepgram-bridge`

---

## 🐛 Known Issues

1. **Call ID Mismatch** - UI and transcripts using different IDs
2. **Empty Transcripts** - Most transcripts are empty (silence detection)
3. **SSE Connection Churn** - Connections closing/reopening frequently (recently fixed)
4. **Auto-Discovery** - May select calls with empty transcripts (recently fixed)

---

## ✅ What's Working

1. ✅ ElevenLabs WebSocket connection established
2. ✅ Audio chunks being sent to ElevenLabs
3. ✅ Transcripts being received from ElevenLabs
4. ✅ Transcripts being published to Redis
5. ✅ Transcript Consumer discovering and forwarding transcripts
6. ✅ SSE infrastructure in place
7. ✅ UI components ready to receive transcripts

---

## ❌ What's Not Working

1. ❌ Transcripts not appearing in UI (call ID mismatch)
2. ❌ Most transcripts are empty (silence detection too aggressive or audio quality issue)
3. ❌ SSE connections unstable (recently fixed, needs verification)

---

## 🎯 Success Criteria

For transcripts to appear in UI:
1. ✅ ElevenLabs generates transcript with text
2. ✅ ASR Worker publishes to Redis with `interaction_id`
3. ✅ Transcript Consumer forwards with matching `callId`
4. ✅ SSE broadcasts to client with matching `callId`
5. ✅ UI receives event and displays transcript

**Current Status:** Steps 1-4 are working, but step 5 fails due to call ID mismatch.


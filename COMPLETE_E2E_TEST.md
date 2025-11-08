# 🧪 Complete End-to-End Test Guide

**Date:** 2025-11-07  
**Goal:** Verify complete flow from Exotel call → Transcripts in UI

---

## ✅ Pre-Test Checklist

### 1. Services Status
- [ ] Frontend (Next.js): `http://localhost:3000` or `https://rtaa-frontend.onrender.com`
- [ ] Ingest Service: `https://rtaa-ingest.onrender.com/health`
- [ ] ASR Worker: `https://rtaa-asr-worker.onrender.com/health`
- [ ] Redis: Connected (check Render logs)

### 2. Recent Fixes Deployed
- [x] Deepgram provider (queue-based callbacks)
- [x] Redis connection management (singleton + circuit breaker)
- [x] TypeScript build fix

---

## 🚀 Step-by-Step Test Procedure

### STEP 1: Open Test UI

**Option A: Local (Recommended)**
```
http://localhost:3000/test-transcripts
```

**Option B: Production**
```
https://rtaa-frontend.onrender.com/test-transcripts
```

**What to see:**
- Test UI page loads
- Input field for "Interaction ID"
- "Subscribe to Transcripts" button
- "Check Consumer Status" button
- "Send Test Transcript" button

---

### STEP 2: Check Transcript Consumer Status

1. Click **"Check Consumer Status"** button
2. Should see status JSON showing:
   - `isRunning: true`
   - `subscriptions: []` (or list of active subscriptions)
   - `lastDiscovery: <timestamp>`

**If consumer not running:**
- Check Render frontend logs
- Look for `[TranscriptConsumerInit] Initializing...`
- Restart frontend service if needed

---

### STEP 3: Make NEW Call from Exotel

**Important:** Use a **NEW** call, not old cached ones!

1. Start a fresh call from Exotel
2. Speak clearly: *"I need help with my credit card. I want to block my card."*
3. Get the **NEW interaction ID** from:
   - Exotel dashboard
   - Render ingest service logs
   - Format: `call-1762531234567` (timestamp-based)

**What to check in Render logs:**
- Ingest service: `[exotel] Received binary message` (audio frames)
- ASR Worker: `[DeepgramProvider] ✅ Connection opened`
- ASR Worker: `[DeepgramProvider] 📝 Received transcript` (with actual text)

---

### STEP 4: Subscribe in Test UI

1. **Paste the NEW interaction ID** in the input field
2. Click **"Subscribe to Transcripts"** button
3. Should see: `✅ Subscribed to transcripts`
4. Green "Subscribed" badge should appear

**What happens:**
- UI connects to SSE endpoint: `/api/events/stream?callId={interactionId}`
- Transcript consumer subscribes to Redis: `transcript.{interactionId}`
- Historical transcripts are fetched (if any)

---

### STEP 5: Watch Transcripts Appear

**Expected behavior:**
- Transcripts appear in real-time as you speak
- Each transcript shows:
  - Timestamp
  - Text (actual speech, not empty)
  - Sequence number
  - Type (partial/final)

**What to verify:**
- ✅ Transcripts appear within 1-2 seconds of speaking
- ✅ Text is actual speech (not `[EMPTY - Debug Mode]`)
- ✅ Count increases as you continue speaking
- ✅ Transcripts are readable and accurate

---

### STEP 6: Verify Complete Flow

**Check Render Logs:**

**Ingest Service:**
```
[exotel] Received binary message, size=...
[exotel] Published audio frame to Redis
```

**ASR Worker:**
```
[DeepgramProvider] ✅ Connection opened for call-...
[DeepgramProvider] 📝 Received transcript for call-...
  textLength: 25
  textPreview: "I need help with my credit card"
```

**Frontend (Transcript Consumer):**
```
[TranscriptConsumer] Received transcript message
  interaction_id: call-...
  textLength: 25
  textPreview: "I need help with my credit card"
[TranscriptConsumer] ✅ Forwarded transcript successfully
```

**UI (Browser Console):**
```
[TestUI] Received SSE event: {type: 'transcript_line', text: 'I need help...'}
```

---

### STEP 7: Verify Intent Detection & KB Articles

**Expected:**
- After transcript appears, intent detection should trigger
- KB articles should surface automatically
- Articles should be relevant to "credit card"

**Check:**
- Look for intent detection logs in frontend
- Check if KB articles appear in UI (if integrated)
- Verify intent confidence scores

---

## 🔍 Troubleshooting

### No Transcripts Appearing

**Check 1: Consumer Status**
- Click "Check Consumer Status"
- Verify `isRunning: true`
- If not running, check Render logs

**Check 2: Redis Connection**
- Look for `[RedisStreamsAdapter] ❌ Max clients reached`
- If present, wait 60 seconds for backoff to clear
- Or restart all Render services

**Check 3: ASR Worker**
- Check ASR Worker logs for Deepgram connection
- Verify `[DeepgramProvider] ✅ Connection opened`
- Check for `[DeepgramProvider] 📝 Received transcript`

**Check 4: Interaction ID**
- Make sure you're using the **NEW** interaction ID
- Old calls may have cached state
- Get ID from Exotel or Render logs

### Empty Transcripts

**If seeing `[EMPTY - Debug Mode]`:**
- Deepgram may not be returning text
- Check ASR Worker logs for Deepgram errors
- Verify `DEEPGRAM_API_KEY` is set correctly
- Check Deepgram API status

### Connection Errors

**If seeing Redis max clients:**
- Wait 60 seconds (circuit breaker backoff)
- Check if old connections have timed out
- Restart services if needed

---

## ✅ Success Criteria

**Complete success when:**
1. ✅ Test UI loads and subscribes
2. ✅ NEW call from Exotel generates interaction ID
3. ✅ Transcripts appear in UI with actual speech text
4. ✅ Transcripts update in real-time as you speak
5. ✅ Intent detection triggers automatically
6. ✅ KB articles surface (if integrated)

---

## 📊 Test Results Template

```
Test Date: ___________
Interaction ID: ___________
Test Duration: ___________

✅ Services Status:
  [ ] Frontend running
  [ ] Ingest service running
  [ ] ASR Worker running
  [ ] Redis connected

✅ Flow Verification:
  [ ] Exotel call started
  [ ] Audio received by ingest service
  [ ] Audio published to Redis
  [ ] ASR Worker consumed audio
  [ ] Deepgram connection opened
  [ ] Transcripts generated
  [ ] Transcripts published to Redis
  [ ] Transcript consumer received transcripts
  [ ] Transcripts forwarded to API
  [ ] SSE broadcast to UI
  [ ] Transcripts displayed in UI

✅ Quality Checks:
  [ ] Transcripts show actual speech (not empty)
  [ ] Transcripts appear within 1-2 seconds
  [ ] Real-time updates working
  [ ] Intent detection triggered
  [ ] KB articles surfaced

Issues Found:
_________________________________
_________________________________
```

---

## 🎯 Next Steps After Successful Test

1. **Production Deployment:** System is ready for production use
2. **Monitoring:** Set up alerts for service health
3. **Scaling:** Monitor Redis connection limits
4. **Optimization:** Fine-tune Deepgram settings if needed


**Date:** 2025-11-07  
**Goal:** Verify complete flow from Exotel call → Transcripts in UI

---

## ✅ Pre-Test Checklist

### 1. Services Status
- [ ] Frontend (Next.js): `http://localhost:3000` or `https://rtaa-frontend.onrender.com`
- [ ] Ingest Service: `https://rtaa-ingest.onrender.com/health`
- [ ] ASR Worker: `https://rtaa-asr-worker.onrender.com/health`
- [ ] Redis: Connected (check Render logs)

### 2. Recent Fixes Deployed
- [x] Deepgram provider (queue-based callbacks)
- [x] Redis connection management (singleton + circuit breaker)
- [x] TypeScript build fix

---

## 🚀 Step-by-Step Test Procedure

### STEP 1: Open Test UI

**Option A: Local (Recommended)**
```
http://localhost:3000/test-transcripts
```

**Option B: Production**
```
https://rtaa-frontend.onrender.com/test-transcripts
```

**What to see:**
- Test UI page loads
- Input field for "Interaction ID"
- "Subscribe to Transcripts" button
- "Check Consumer Status" button
- "Send Test Transcript" button

---

### STEP 2: Check Transcript Consumer Status

1. Click **"Check Consumer Status"** button
2. Should see status JSON showing:
   - `isRunning: true`
   - `subscriptions: []` (or list of active subscriptions)
   - `lastDiscovery: <timestamp>`

**If consumer not running:**
- Check Render frontend logs
- Look for `[TranscriptConsumerInit] Initializing...`
- Restart frontend service if needed

---

### STEP 3: Make NEW Call from Exotel

**Important:** Use a **NEW** call, not old cached ones!

1. Start a fresh call from Exotel
2. Speak clearly: *"I need help with my credit card. I want to block my card."*
3. Get the **NEW interaction ID** from:
   - Exotel dashboard
   - Render ingest service logs
   - Format: `call-1762531234567` (timestamp-based)

**What to check in Render logs:**
- Ingest service: `[exotel] Received binary message` (audio frames)
- ASR Worker: `[DeepgramProvider] ✅ Connection opened`
- ASR Worker: `[DeepgramProvider] 📝 Received transcript` (with actual text)

---

### STEP 4: Subscribe in Test UI

1. **Paste the NEW interaction ID** in the input field
2. Click **"Subscribe to Transcripts"** button
3. Should see: `✅ Subscribed to transcripts`
4. Green "Subscribed" badge should appear

**What happens:**
- UI connects to SSE endpoint: `/api/events/stream?callId={interactionId}`
- Transcript consumer subscribes to Redis: `transcript.{interactionId}`
- Historical transcripts are fetched (if any)

---

### STEP 5: Watch Transcripts Appear

**Expected behavior:**
- Transcripts appear in real-time as you speak
- Each transcript shows:
  - Timestamp
  - Text (actual speech, not empty)
  - Sequence number
  - Type (partial/final)

**What to verify:**
- ✅ Transcripts appear within 1-2 seconds of speaking
- ✅ Text is actual speech (not `[EMPTY - Debug Mode]`)
- ✅ Count increases as you continue speaking
- ✅ Transcripts are readable and accurate

---

### STEP 6: Verify Complete Flow

**Check Render Logs:**

**Ingest Service:**
```
[exotel] Received binary message, size=...
[exotel] Published audio frame to Redis
```

**ASR Worker:**
```
[DeepgramProvider] ✅ Connection opened for call-...
[DeepgramProvider] 📝 Received transcript for call-...
  textLength: 25
  textPreview: "I need help with my credit card"
```

**Frontend (Transcript Consumer):**
```
[TranscriptConsumer] Received transcript message
  interaction_id: call-...
  textLength: 25
  textPreview: "I need help with my credit card"
[TranscriptConsumer] ✅ Forwarded transcript successfully
```

**UI (Browser Console):**
```
[TestUI] Received SSE event: {type: 'transcript_line', text: 'I need help...'}
```

---

### STEP 7: Verify Intent Detection & KB Articles

**Expected:**
- After transcript appears, intent detection should trigger
- KB articles should surface automatically
- Articles should be relevant to "credit card"

**Check:**
- Look for intent detection logs in frontend
- Check if KB articles appear in UI (if integrated)
- Verify intent confidence scores

---

## 🔍 Troubleshooting

### No Transcripts Appearing

**Check 1: Consumer Status**
- Click "Check Consumer Status"
- Verify `isRunning: true`
- If not running, check Render logs

**Check 2: Redis Connection**
- Look for `[RedisStreamsAdapter] ❌ Max clients reached`
- If present, wait 60 seconds for backoff to clear
- Or restart all Render services

**Check 3: ASR Worker**
- Check ASR Worker logs for Deepgram connection
- Verify `[DeepgramProvider] ✅ Connection opened`
- Check for `[DeepgramProvider] 📝 Received transcript`

**Check 4: Interaction ID**
- Make sure you're using the **NEW** interaction ID
- Old calls may have cached state
- Get ID from Exotel or Render logs

### Empty Transcripts

**If seeing `[EMPTY - Debug Mode]`:**
- Deepgram may not be returning text
- Check ASR Worker logs for Deepgram errors
- Verify `DEEPGRAM_API_KEY` is set correctly
- Check Deepgram API status

### Connection Errors

**If seeing Redis max clients:**
- Wait 60 seconds (circuit breaker backoff)
- Check if old connections have timed out
- Restart services if needed

---

## ✅ Success Criteria

**Complete success when:**
1. ✅ Test UI loads and subscribes
2. ✅ NEW call from Exotel generates interaction ID
3. ✅ Transcripts appear in UI with actual speech text
4. ✅ Transcripts update in real-time as you speak
5. ✅ Intent detection triggers automatically
6. ✅ KB articles surface (if integrated)

---

## 📊 Test Results Template

```
Test Date: ___________
Interaction ID: ___________
Test Duration: ___________

✅ Services Status:
  [ ] Frontend running
  [ ] Ingest service running
  [ ] ASR Worker running
  [ ] Redis connected

✅ Flow Verification:
  [ ] Exotel call started
  [ ] Audio received by ingest service
  [ ] Audio published to Redis
  [ ] ASR Worker consumed audio
  [ ] Deepgram connection opened
  [ ] Transcripts generated
  [ ] Transcripts published to Redis
  [ ] Transcript consumer received transcripts
  [ ] Transcripts forwarded to API
  [ ] SSE broadcast to UI
  [ ] Transcripts displayed in UI

✅ Quality Checks:
  [ ] Transcripts show actual speech (not empty)
  [ ] Transcripts appear within 1-2 seconds
  [ ] Real-time updates working
  [ ] Intent detection triggered
  [ ] KB articles surfaced

Issues Found:
_________________________________
_________________________________
```

---

## 🎯 Next Steps After Successful Test

1. **Production Deployment:** System is ready for production use
2. **Monitoring:** Set up alerts for service health
3. **Scaling:** Monitor Redis connection limits
4. **Optimization:** Fine-tune Deepgram settings if needed


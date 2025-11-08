# 🧪 Exotel Test Readiness Assessment

## ✅ What SHOULD Work (Based on Recent Fixes)

### 1. **Exotel Connection** ✅
- **Status:** Should work if `SUPPORT_EXOTEL=true` is set
- **What happens:**
  - Exotel connects to `wss://rtaa-ingest.onrender.com/v1/ingest`
  - Ingest service accepts connection (no JWT required for Exotel)
  - Audio frames are received and published to Redis

### 2. **Audio Processing** ✅
- **Status:** Should work
- **What happens:**
  - Ingest service receives audio from Exotel
  - Publishes to Redis Streams topic: `audio.exotel` or `audio_stream`
  - ASR Worker subscribes and receives audio frames

### 3. **ASR Transcription** ⚠️ (Depends on Provider)
- **Status:** Will work, but quality depends on provider
- **Mock Provider (Default):**
  - ✅ Will generate fake transcripts (deterministic)
  - ✅ Always returns text (never empty)
  - ✅ Good for testing the flow
  - ❌ Not real transcription
- **Deepgram Provider:**
  - ✅ Real speech-to-text
  - ⚠️ Requires `DEEPGRAM_API_KEY`
  - ⚠️ Requires `ASR_PROVIDER=deepgram`

### 4. **Transcript Flow** ✅
- **Status:** Should work perfectly (we just fixed this!)
- **What happens:**
  - ASR Worker publishes transcripts to Redis
  - Frontend TranscriptConsumer receives them
  - Messages are auto-ACK'd (no redelivery)
  - Empty transcripts are filtered out
  - Transcripts forwarded to `/api/ingest-transcript`

### 5. **UI Display** ✅
- **Status:** Should work
- **What happens:**
  - Transcripts broadcast via SSE to connected clients
  - UI receives real-time updates
  - Transcripts appear in the dashboard

---

## ⚠️ What MIGHT NOT Work (Optional Features)

### 1. **Intent Detection** ⚠️
- **Status:** Won't work without `LLM_API_KEY`
- **Impact:** Transcripts will still flow, but intent will be "unknown"
- **Logs will show:** `[intent] LLM_API_KEY not configured, returning unknown intent`
- **Fix:** Add `LLM_API_KEY` to Frontend service if you want intent detection

### 2. **KB Suggestions** ⚠️
- **Status:** Won't work without `NEXT_PUBLIC_SUPABASE_URL`
- **Impact:** Transcripts will still flow, but no KB articles
- **Logs will show:** `[ingest-transcript] Supabase error: Error: Missing NEXT_PUBLIC_SUPABASE_URL`
- **Fix:** Add Supabase env vars if you want KB suggestions

### 3. **Real ASR (Deepgram)** ⚠️
- **Status:** Won't work without `DEEPGRAM_API_KEY`
- **Impact:** Will fall back to mock provider (fake transcripts)
- **Fix:** Set `ASR_PROVIDER=deepgram` and `DEEPGRAM_API_KEY=your-key`

---

## 🔍 Critical Pre-Flight Checks

### ✅ Check 1: Exotel Support Enabled
**Service:** `rtaa-ingest`  
**Required:** `SUPPORT_EXOTEL=true`

**How to verify:**
1. Go to Render Dashboard → `rtaa-ingest` → Environment
2. Check if `SUPPORT_EXOTEL=true` exists
3. If not, add it and service will auto-redeploy

**Expected logs after fix:**
```
[server] supportExotel: true
[exotel] New Exotel WebSocket connection
```

---

### ✅ Check 2: All Services Use Same Redis
**Services:** `rtaa-ingest`, `rtaa-asr-worker`, `rtaa-frontend`  
**Required:** All must have the **SAME** `REDIS_URL`

**How to verify:**
1. Go to each service → Environment tab
2. Compare `REDIS_URL` values
3. They must be identical!

**Expected logs:**
```
[RedisStreamsAdapter] Connected to Redis: redis://default:...@...
```

---

### ✅ Check 3: ASR Provider Configured
**Service:** `rtaa-asr-worker`  
**Required:** `ASR_PROVIDER=mock` (or `deepgram`)

**How to verify:**
1. Go to Render Dashboard → `rtaa-asr-worker` → Environment
2. Check if `ASR_PROVIDER` is set
3. If not, add `ASR_PROVIDER=mock` for testing

**Expected logs:**
```
[ASRWorker] Using ASR provider: mock
```

---

### ✅ Check 4: Pub/Sub Adapter
**Services:** All three services  
**Required:** `PUBSUB_ADAPTER=redis_streams`

**How to verify:**
1. Check each service's environment variables
2. All should have `PUBSUB_ADAPTER=redis_streams`

---

## 🧪 Test Flow (What to Expect)

### Step 1: Make Exotel Call
1. Configure Exotel to call your number
2. Exotel connects to `wss://rtaa-ingest.onrender.com/v1/ingest`
3. **Expected logs (Ingest):**
   ```
   [exotel] New Exotel WebSocket connection
   [exotel] Start event received: { stream_sid: "...", call_sid: "..." }
   [exotel] Published audio frame: { seq: 1, ... }
   [exotel] Published audio frame: { seq: 2, ... }
   ```

### Step 2: ASR Processing
1. ASR Worker receives audio frames
2. Processes through provider (mock or deepgram)
3. Publishes transcripts
4. **Expected logs (ASR Worker):**
   ```
   [ASRWorker] Received audio frame: { interaction_id: "...", seq: 1 }
   [ASRWorker] Published partial transcript: { text: "Hello", seq: 1 }
   [ASRWorker] Published partial transcript: { text: "Hello, I", seq: 2 }
   ```

### Step 3: Transcript Consumption
1. Frontend TranscriptConsumer receives transcripts
2. Forwards to `/api/ingest-transcript`
3. Broadcasts via SSE
4. **Expected logs (Frontend):**
   ```
   [TranscriptConsumer] Received transcript message: { seq: 1, text: "Hello" }
   [TranscriptConsumer] ✅ Forwarded transcript successfully
   [realtime] Broadcast transcript_line: { callId: "...", seq: 1 }
   ```

### Step 4: UI Display
1. Open dashboard: `https://rtaa-frontend.onrender.com/dashboard`
2. Subscribe to call ID
3. **Expected:** Transcripts appear in real-time

---

## 🚨 Potential Issues & Fixes

### Issue 1: No Connection from Exotel
**Symptom:** No logs showing Exotel connection

**Check:**
- [ ] `SUPPORT_EXOTEL=true` in Ingest service
- [ ] Exotel WebSocket URL is correct
- [ ] IP whitelist or Basic Auth configured

**Fix:**
- Add `SUPPORT_EXOTEL=true` to Ingest service
- Verify Exotel configuration

---

### Issue 2: Audio Received but No Transcripts
**Symptom:** See "Published audio frame" but no transcripts

**Check:**
- [ ] ASR Worker is running
- [ ] `ASR_PROVIDER` is set
- [ ] All services use same `REDIS_URL`
- [ ] ASR Worker logs show "Subscribed to audio topics"

**Fix:**
- Check ASR Worker logs
- Verify `ASR_PROVIDER` is set
- Verify Redis connection

---

### Issue 3: Transcripts Published but Not Displayed
**Symptom:** See "Published transcript" but nothing in UI

**Check:**
- [ ] Frontend TranscriptConsumer is running
- [ ] Frontend has same `REDIS_URL`
- [ ] UI is subscribed to correct call ID
- [ ] SSE connection is established

**Fix:**
- Check Frontend logs for TranscriptConsumer
- Verify subscription in UI
- Check browser console for SSE errors

---

### Issue 4: Empty Transcripts (Old Issue)
**Symptom:** Transcripts published but text is empty

**Status:** ✅ **FIXED!** Empty transcripts are now filtered out

**What happens:**
- Empty transcripts are skipped (not processed)
- Logs show: `[TranscriptConsumer] ⚠️ Skipping transcript with EMPTY text`
- No spam in logs

**If you see this:**
- This is expected behavior (filtering working)
- Check ASR Worker logs to see why transcripts are empty
- If using mock provider, should never be empty
- If using Deepgram, check API key and connection

---

## ✅ Final Checklist Before Testing

### Environment Variables
- [ ] `SUPPORT_EXOTEL=true` in Ingest service
- [ ] `REDIS_URL` is **SAME** in all three services
- [ ] `PUBSUB_ADAPTER=redis_streams` in all three services
- [ ] `ASR_PROVIDER=mock` (or `deepgram`) in ASR Worker
- [ ] `DEEPGRAM_API_KEY` set if using Deepgram

### Service Status
- [ ] All services show "Live" status in Render
- [ ] No errors in service logs
- [ ] Redis connection successful in all services

### Exotel Configuration
- [ ] WebSocket URL: `wss://rtaa-ingest.onrender.com/v1/ingest`
- [ ] IP whitelist or Basic Auth configured
- [ ] Sample rate configured (8kHz/16kHz/24kHz)

---

## 🎯 Expected Outcome

### ✅ **Core Flow WILL Work:**
1. ✅ Exotel connects
2. ✅ Audio is received
3. ✅ Transcripts are generated (mock or real)
4. ✅ Transcripts are published
5. ✅ Transcripts are consumed
6. ✅ Transcripts appear in UI

### ⚠️ **Optional Features MAY NOT Work:**
1. ⚠️ Intent detection (needs `LLM_API_KEY`)
2. ⚠️ KB suggestions (needs Supabase)
3. ⚠️ Real ASR (needs Deepgram API key)

---

## 📊 Summary

**Will it work?** ✅ **YES, the core flow should work!**

**What will work:**
- Exotel connection ✅
- Audio ingestion ✅
- ASR processing ✅ (mock or real)
- Transcript flow ✅
- UI display ✅

**What might not work:**
- Intent detection (optional)
- KB suggestions (optional)
- Real ASR (if not configured)

**Bottom line:** The transcript flow should work end-to-end. Optional features (intent, KB) won't work without additional configuration, but transcripts will still appear in the UI.

---

## 🚀 Ready to Test!

1. **Verify environment variables** (checklist above)
2. **Make a test call from Exotel**
3. **Monitor logs** in all three services
4. **Check UI** for transcripts

If you see issues, check the "Potential Issues & Fixes" section above.


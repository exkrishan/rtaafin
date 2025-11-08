# ✅ Final Test Checklist - Exotel to UI Flow

## 🔍 Pre-Flight Verification

### Service 1: Ingest Service (`rtaa-ingest`)

**Required Environment Variables:**
- [ ] `SUPPORT_EXOTEL=true` ✅ **CRITICAL**
- [ ] `REDIS_URL=redis://default:...@...` ✅
- [ ] `PUBSUB_ADAPTER=redis_streams` ✅

**How to verify:**
1. Render Dashboard → `rtaa-ingest` → Environment tab
2. Check all three variables are set
3. Check logs should show: `supportExotel: true`

---

### Service 2: ASR Worker (`rtaa-asr-worker`)

**Required Environment Variables:**
- [ ] `ASR_PROVIDER=deepgram` ✅
- [ ] `DEEPGRAM_API_KEY=d65326fff430ad13ad6ad78acfe305a8d8c8245e` ✅ (Already set)
- [ ] `REDIS_URL=redis://default:...@...` ✅ (SAME as Ingest)
- [ ] `PUBSUB_ADAPTER=redis_streams` ✅

**How to verify:**
1. Render Dashboard → `rtaa-asr-worker` → Environment tab
2. Check all variables are set
3. Check logs should show:
   ```
   [ASRWorker] Using ASR provider: deepgram
   [DeepgramProvider] Initialized with API key
   ```

---

### Service 3: Frontend (`rtaa-frontend`)

**Required Environment Variables:**
- [ ] `REDIS_URL=redis://default:...@...` ✅ (SAME as other services)
- [ ] `PUBSUB_ADAPTER=redis_streams` ✅
- [ ] `NEXT_PUBLIC_BASE_URL=https://rtaa-frontend.onrender.com` ✅ (or your URL)

**Optional (for other features):**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` (for KB suggestions)
- [ ] `LLM_API_KEY` (for intent detection)

**How to verify:**
1. Render Dashboard → `rtaa-frontend` → Environment tab
2. Check required variables are set
3. Check logs should show:
   ```
   [TranscriptConsumer] Initialized
   [TranscriptConsumer] Stream discovery started
   ```

---

## 🔗 Critical: All Services Must Share Same Redis

**⚠️ IMPORTANT:** All three services MUST use the **SAME** `REDIS_URL`.

**How to verify:**
1. Check each service's `REDIS_URL` value
2. They must be **identical**
3. If different, update them to match

---

## 🧪 Test Flow

### Step 1: Verify Services Are Running

1. **Ingest Service:**
   - Status: "Live" ✅
   - Health: `https://rtaa-ingest.onrender.com/health` → `{"status":"ok"}`
   - Logs: `supportExotel: true`

2. **ASR Worker:**
   - Status: "Live" ✅
   - Health: `https://rtaa-asr-worker.onrender.com/health` → `{"status":"ok"}`
   - Logs: `Using ASR provider: deepgram`

3. **Frontend:**
   - Status: "Live" ✅
   - URL: `https://rtaa-frontend.onrender.com` → Should load
   - Logs: `TranscriptConsumer initialized`

---

### Step 2: Configure Exotel

1. **WebSocket URL:**
   ```
   wss://rtaa-ingest.onrender.com/v1/ingest?sample-rate=16000
   ```
   (Use your actual Ingest service URL)

2. **Authentication:**
   - IP Whitelist (recommended) OR
   - Basic Auth (if configured)

3. **Sample Rate:**
   - 8kHz (PSTN)
   - 16kHz (recommended)
   - 24kHz (HD)

---

### Step 3: Make Test Call

1. **From Exotel Dashboard:**
   - Configure call flow
   - Add Stream/Voicebot Applet
   - Set WebSocket URL
   - Make test call

2. **Monitor Logs (Ingest Service):**
   ```
   [exotel] New Exotel WebSocket connection
   [exotel] Start event received: { stream_sid: "...", call_sid: "..." }
   [exotel] Published audio frame: { seq: 1, ... }
   [exotel] Published audio frame: { seq: 2, ... }
   ```

3. **Monitor Logs (ASR Worker):**
   ```
   [ASRWorker] Received audio frame: { interaction_id: "...", seq: 1 }
   [DeepgramProvider] 📝 Received transcript: { text: "Hello", ... }
   [ASRWorker] Published partial transcript: { text: "Hello", seq: 1 }
   ```

4. **Monitor Logs (Frontend):**
   ```
   [TranscriptConsumer] Received transcript message: { seq: 1, text: "Hello" }
   [TranscriptConsumer] ✅ Forwarded transcript successfully
   [realtime] Broadcast transcript_line: { callId: "...", seq: 1 }
   ```

---

### Step 4: Verify UI Display

1. **Open Dashboard:**
   ```
   https://rtaa-frontend.onrender.com/dashboard
   ```

2. **Subscribe to Call:**
   - Enter call ID (from Exotel logs)
   - Click "Subscribe" or auto-subscribe should work

3. **Expected:**
   - ✅ Transcripts appear in real-time
   - ✅ Text is real (from Deepgram, not fake)
   - ✅ Updates as call progresses
   - ✅ No empty transcripts

---

## ✅ Success Indicators

### Ingest Service:
- ✅ Exotel connects successfully
- ✅ Audio frames are received
- ✅ Frames are published to Redis

### ASR Worker:
- ✅ Audio frames are received from Redis
- ✅ Deepgram provider processes audio
- ✅ Real transcripts are generated
- ✅ Transcripts are published to Redis

### Frontend:
- ✅ Transcripts are consumed from Redis
- ✅ Transcripts are forwarded to API
- ✅ SSE broadcasts to UI
- ✅ UI displays transcripts in real-time

---

## 🚨 Troubleshooting

### Issue: Exotel Can't Connect

**Check:**
- [ ] `SUPPORT_EXOTEL=true` in Ingest service
- [ ] WebSocket URL is correct
- [ ] IP whitelist or Basic Auth configured
- [ ] Service is "Live" (not "Failed")

**Logs to check:**
- Ingest service logs for connection errors
- Look for "Exotel WebSocket upgrade request"

---

### Issue: Audio Received but No Transcripts

**Check:**
- [ ] ASR Worker is "Live"
- [ ] `ASR_PROVIDER=deepgram` is set
- [ ] `DEEPGRAM_API_KEY` is set correctly
- [ ] All services use SAME `REDIS_URL`
- [ ] ASR Worker logs show "Subscribed to audio topics"

**Logs to check:**
- ASR Worker logs for "Received audio frame"
- ASR Worker logs for "Published transcript"
- Deepgram provider logs for errors

---

### Issue: Transcripts Published but Not in UI

**Check:**
- [ ] Frontend is "Live"
- [ ] Frontend has SAME `REDIS_URL`
- [ ] TranscriptConsumer is initialized
- [ ] UI is subscribed to correct call ID
- [ ] SSE connection is established

**Logs to check:**
- Frontend logs for "Received transcript message"
- Frontend logs for "Forwarded transcript successfully"
- Browser console for SSE connection errors

---

### Issue: Empty Transcripts

**Status:** ✅ **FIXED!** Empty transcripts are now filtered out.

**If you see empty transcripts:**
- Check ASR Worker logs for Deepgram errors
- Verify `DEEPGRAM_API_KEY` is correct
- Check Deepgram provider logs for connection issues

---

## 📊 Expected Log Flow

### Complete Flow Example:

```
[Ingest] [exotel] New Exotel WebSocket connection
[Ingest] [exotel] Start event received: { stream_sid: "call-123", ... }
[Ingest] [exotel] Published audio frame: { seq: 1, size: 9600 }

[ASR Worker] [ASRWorker] Received audio frame: { interaction_id: "call-123", seq: 1 }
[ASR Worker] [DeepgramProvider] 📤 Sent audio chunk: { seq: 1, size: 9600 }
[ASR Worker] [DeepgramProvider] 📝 Received transcript: { text: "Hello", type: "partial" }
[ASR Worker] [ASRWorker] Published partial transcript: { text: "Hello", seq: 1 }

[Frontend] [TranscriptConsumer] Received transcript message: { seq: 1, text: "Hello" }
[Frontend] [TranscriptConsumer] ✅ Forwarded transcript successfully
[Frontend] [realtime] Broadcast transcript_line: { callId: "call-123", seq: 1, text: "Hello" }
```

---

## ✅ Final Checklist

Before testing, verify:

- [ ] All three services are "Live"
- [ ] All services use SAME `REDIS_URL`
- [ ] `SUPPORT_EXOTEL=true` in Ingest
- [ ] `ASR_PROVIDER=deepgram` in ASR Worker
- [ ] `DEEPGRAM_API_KEY` is set in ASR Worker
- [ ] `PUBSUB_ADAPTER=redis_streams` in all services
- [ ] Exotel is configured with correct WebSocket URL
- [ ] Frontend URL is accessible

---

## 🚀 Ready to Test!

If all checkboxes above are ✅, you're ready to test!

1. **Make a call from Exotel**
2. **Monitor logs** in all three services
3. **Check UI** for real-time transcripts
4. **Verify transcripts are real** (from Deepgram, not mock)

**Expected Result:**
- ✅ Exotel connects
- ✅ Audio is processed
- ✅ Real transcripts are generated (Deepgram)
- ✅ Transcripts appear in UI in real-time
- ✅ No empty transcripts
- ✅ No repeated processing

---

## 📝 Notes

- **Real ASR:** You're using Deepgram, so transcripts will be real speech-to-text
- **No Fallback:** If Deepgram fails, service will fail (no mock fallback)
- **Empty Transcripts:** Are filtered out automatically
- **Auto-ACK:** Messages won't be redelivered

**Good luck with your test!** 🎉


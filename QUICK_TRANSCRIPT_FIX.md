# 🚨 Quick Fix: No Transcripts Appearing

## Immediate Actions

### 1. Check Transcript Consumer Status

**In your browser, go to:**
```
https://ingest-1-96p6.onrender.com/api/transcripts/status
```

**What to look for:**
- `"running": true` → Consumer is running ✅
- `"running": false` → Consumer is NOT running ❌

**If NOT running, start it:**
```
https://ingest-1-96p6.onrender.com/api/transcripts/start
```
(Just visit this URL - it will start the consumer)

---

### 2. Trigger Stream Discovery

**After starting consumer, trigger discovery:**
```
https://ingest-1-96p6.onrender.com/api/transcripts/auto-subscribe
```
(Just visit this URL - it will discover and subscribe to all transcript streams)

---

### 3. Manually Subscribe to Your Call ID

**If you know your Exotel call ID (from logs), subscribe directly:**

In your browser console (F12), run:
```javascript
fetch('/api/transcripts/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ interactionId: 'call-1762532332133' }) // Replace with your actual call ID
}).then(r => r.json()).then(console.log);
```

---

### 4. Check Frontend Logs

**Go to Render Dashboard → Frontend Service → Logs**

**Look for:**
- `[TranscriptConsumer] Starting transcript consumer...` ✅
- `[TranscriptConsumer] Auto-discovered transcript stream` ✅
- `[TranscriptConsumer] Subscribing to transcript topic` ✅
- `[TranscriptConsumer] Received transcript message` ✅
- `[TranscriptConsumer] ✅ Forwarded transcript successfully` ✅

**If you see errors:**
- Note the error message
- Check Redis connection
- Check if ASR Worker is publishing

---

### 5. Check ASR Worker Logs

**Go to Render Dashboard → ASR Worker → Logs**

**Look for:**
- `[ASRWorker] Published partial transcript` ✅
- Should show `interaction_id` and `text`

**If you DON'T see this:**
- ASR Worker is not processing audio
- Check Deepgram connection
- Check if audio is being received

---

### 6. Verify the Full Flow

**The complete flow should be:**

1. ✅ Exotel call → Ingest Service receives audio
2. ✅ Ingest Service → Publishes to Redis `audio_stream`
3. ✅ ASR Worker → Consumes audio, processes with Deepgram
4. ✅ ASR Worker → Publishes to Redis `transcript.{interaction_id}`
5. ✅ Transcript Consumer → Discovers and subscribes to `transcript.*`
6. ✅ Transcript Consumer → Receives messages from Redis
7. ✅ Transcript Consumer → Forwards to `/api/calls/ingest-transcript`
8. ✅ `/api/calls/ingest-transcript` → Broadcasts via SSE
9. ✅ Frontend → Receives via SSE and displays

**Check each step in the logs!**

---

## 🔧 Most Common Issue: Consumer Not Running

**If the consumer is not running:**

1. **Check if instrumentation is working:**
   - Look for `[instrumentation] Starting transcript consumer...` in Frontend logs
   - If not present, the consumer didn't start automatically

2. **Manually start it:**
   - Visit: `https://ingest-1-96p6.onrender.com/api/transcripts/start`
   - Should see: `{"ok": true, "message": "Transcript consumer started"}`

3. **Then trigger discovery:**
   - Visit: `https://ingest-1-96p6.onrender.com/api/transcripts/auto-subscribe`
   - Should discover and subscribe to existing streams

---

## 📋 Quick Test

1. **Make an Exotel call**
2. **Check ASR Worker logs** - should see "Published transcript"
3. **Check Frontend logs** - should see "Received transcript message"
4. **Check browser console** - should see SSE events
5. **Transcripts should appear in UI**

---

## 🚨 If Still Not Working

**Check these in order:**

1. ✅ Transcript Consumer is running (`/api/transcripts/status`)
2. ✅ ASR Worker is publishing (`[ASRWorker] Published transcript`)
3. ✅ Transcript Consumer is discovering streams (`Auto-discovered transcript stream`)
4. ✅ Transcript Consumer is subscribed (`Subscribing to transcript topic`)
5. ✅ Transcript Consumer is receiving (`Received transcript message`)
6. ✅ Transcript Consumer is forwarding (`✅ Forwarded transcript successfully`)
7. ✅ SSE is broadcasting (check `/api/calls/ingest-transcript` logs)
8. ✅ Browser SSE connection is open (check browser console)

**The first step that fails is where the problem is!**


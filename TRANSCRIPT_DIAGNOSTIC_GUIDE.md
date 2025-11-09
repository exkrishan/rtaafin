# 🔍 Transcript Diagnostic Guide - Why No Transcripts Appearing?

## Step-by-Step Diagnosis

### Step 1: Check if Transcript Consumer is Running

**Check Status:**
```bash
curl https://your-frontend-url.onrender.com/api/transcripts/status
```

**Expected Response:**
```json
{
  "ok": true,
  "running": true,
  "subscriptions": [...],
  "totalProcessed": 0
}
```

**If `running: false`:**
- Transcript Consumer is not started
- **Fix:** Call `/api/transcripts/start` or check `instrumentation.ts` is working

---

### Step 2: Check if ASR Worker is Publishing Transcripts

**Check ASR Worker Logs (Render Dashboard):**
Look for:
```
[ASRWorker] Published partial transcript {
  interaction_id: 'call-1762532332133',
  text: '...',
  seq: 1
}
```

**If you don't see this:**
- ASR Worker is not processing audio
- Check if Deepgram is working
- Check if audio is being received

---

### Step 3: Check if Transcript Consumer is Discovering Streams

**Check Frontend Logs (Render Dashboard):**
Look for:
```
[TranscriptConsumer] Auto-discovered transcript stream {
  interactionId: 'call-1762532332133',
  stream: 'transcript.call-1762532332133'
}
```

**If you don't see this:**
- Stream discovery is not working
- **Fix:** Manually trigger discovery:
  ```bash
  curl -X POST https://your-frontend-url.onrender.com/api/transcripts/auto-subscribe
  ```

---

### Step 4: Check if Transcript Consumer is Subscribing

**Check Frontend Logs:**
Look for:
```
[TranscriptConsumer] Subscribing to transcript topic {
  interactionId: 'call-1762532332133',
  topic: 'transcript.call-1762532332133'
}
```

**If you don't see this:**
- Subscription is failing
- Check Redis connection
- Check if stream exists in Redis

---

### Step 5: Check if Transcript Consumer is Receiving Messages

**Check Frontend Logs:**
Look for:
```
[TranscriptConsumer] Received transcript message {
  interaction_id: 'call-1762532332133',
  seq: 1,
  text: '...'
}
```

**If you don't see this:**
- Consumer is not receiving messages from Redis
- Check Redis Stream consumer group
- Check if messages are being ACK'd

---

### Step 6: Check if Transcript Consumer is Forwarding

**Check Frontend Logs:**
Look for:
```
[TranscriptConsumer] ✅ Forwarded transcript successfully {
  interaction_id: 'call-1762532332133',
  callId: 'call-1762532332133',
  seq: 1
}
```

**If you don't see this:**
- Forwarding to `/api/calls/ingest-transcript` is failing
- Check API endpoint is accessible
- Check network connectivity

---

### Step 7: Check if SSE is Broadcasting

**Check Frontend Logs:**
Look for:
```
[broadcastEvent] Broadcasting transcript_line event {
  callId: 'call-1762532332133',
  text: '...'
}
```

**If you don't see this:**
- SSE broadcast is not working
- Check `/api/calls/ingest-transcript` is calling `broadcastEvent()`

---

### Step 8: Check Browser SSE Connection

**Open Browser DevTools → Console:**
Look for:
```
[TranscriptPanel] SSE connection opened
[TranscriptPanel] Received transcript_line event
```

**If you don't see this:**
- SSE connection is not established
- Check browser console for errors
- Check Network tab for `/api/events/stream` connection

---

## 🚨 Common Issues & Fixes

### Issue 1: Transcript Consumer Not Running

**Symptoms:**
- Status shows `running: false`
- No logs from Transcript Consumer

**Fix:**
```bash
# Manually start consumer
curl -X POST https://your-frontend-url.onrender.com/api/transcripts/start

# Or check instrumentation.ts is enabled in next.config.js
```

---

### Issue 2: Stream Discovery Not Finding Streams

**Symptoms:**
- No "Auto-discovered transcript stream" logs
- Status shows `subscriptions: []`

**Fix:**
```bash
# Manually trigger discovery
curl -X POST https://your-frontend-url.onrender.com/api/transcripts/auto-subscribe

# Or manually subscribe to specific interaction ID
curl -X POST https://your-frontend-url.onrender.com/api/transcripts/subscribe \
  -H "Content-Type: application/json" \
  -d '{"interactionId": "call-1762532332133"}'
```

---

### Issue 3: Transcripts Published but Not Consumed

**Symptoms:**
- ASR Worker logs show "Published transcript"
- But Transcript Consumer logs show nothing

**Fix:**
1. Check Redis Stream exists:
   ```bash
   # Connect to Redis and check
   redis-cli
   > KEYS transcript.*
   > XINFO STREAM transcript.call-1762532332133
   ```

2. Check consumer group exists:
   ```bash
   > XINFO GROUPS transcript.call-1762532332133
   ```

3. Manually subscribe:
   ```bash
   curl -X POST https://your-frontend-url.onrender.com/api/transcripts/subscribe \
     -H "Content-Type: application/json" \
     -d '{"interactionId": "call-1762532332133"}'
   ```

---

### Issue 4: SSE Connection Not Established

**Symptoms:**
- Browser console shows SSE errors
- Network tab shows failed connection

**Fix:**
1. Check `/api/events/stream` endpoint is accessible
2. Check CORS settings
3. Check if `callId` parameter matches
4. Check browser console for errors

---

## 🔧 Quick Diagnostic Commands

```bash
# 1. Check consumer status
curl https://your-frontend-url.onrender.com/api/transcripts/status

# 2. Start consumer if not running
curl -X POST https://your-frontend-url.onrender.com/api/transcripts/start

# 3. Trigger stream discovery
curl -X POST https://your-frontend-url.onrender.com/api/transcripts/auto-subscribe

# 4. Manually subscribe to specific interaction ID
curl -X POST https://your-frontend-url.onrender.com/api/transcripts/subscribe \
  -H "Content-Type: application/json" \
  -d '{"interactionId": "YOUR_CALL_ID_HERE"}'
```

---

## 📋 Diagnostic Checklist

- [ ] Transcript Consumer is running
- [ ] ASR Worker is publishing transcripts to Redis
- [ ] Transcript Consumer is discovering streams
- [ ] Transcript Consumer is subscribed to streams
- [ ] Transcript Consumer is receiving messages
- [ ] Transcript Consumer is forwarding to API
- [ ] SSE is broadcasting events
- [ ] Browser SSE connection is established
- [ ] Call ID matches between all components

---

**Next Steps:**
1. Run the diagnostic commands above
2. Check each step in the logs
3. Identify where the flow breaks
4. Apply the appropriate fix


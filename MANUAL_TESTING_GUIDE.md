# 🧪 Manual Testing Guide - Full Flow (Exotel → UI)

## Overview

This guide walks you through testing the complete flow:
1. **Exotel Call** → 2. **Ingest Service** → 3. **ASR Worker** → 4. **Transcript Consumer** → 5. **Frontend UI**

---

## 📋 Prerequisites Checklist

Before testing, verify:

- [ ] All services are deployed on Render:
  - ✅ `rtaa-ingest` (WebSocket service)
  - ✅ `rtaa-asr-worker` (ASR processing)
  - ✅ `rtaa-frontend` (Next.js app)
- [ ] Redis is configured and accessible
- [ ] Environment variables are set correctly
- [ ] Exotel account is configured

---

## 🔧 Step 1: Verify Environment Variables

### Ingest Service (`rtaa-ingest`)

Check Render Dashboard → Environment tab:

```bash
SUPPORT_EXOTEL=true          # ✅ Must be true
REDIS_URL=redis://...        # ✅ Your Redis URL
PUBSUB_ADAPTER=redis_streams # ✅ Must be redis_streams
PORT=8443                    # ✅ WebSocket port (default)
```

### ASR Worker (`rtaa-asr-worker`)

```bash
REDIS_URL=redis://...        # ✅ Same Redis URL
PUBSUB_ADAPTER=redis_streams # ✅ Must be redis_streams
ASR_PROVIDER=mock            # ✅ Use 'mock' for testing (or 'deepgram' for real)
DEEPGRAM_API_KEY=...        # ✅ If using Deepgram
PORT=3001                   # ✅ Health check port
```

### Frontend (`rtaa-frontend`)

```bash
REDIS_URL=redis://...        # ✅ Same Redis URL
PUBSUB_ADAPTER=redis_streams # ✅ Must be redis_streams
NEXT_PUBLIC_BASE_URL=...    # ✅ Your frontend URL (e.g., https://rtaa-frontend.onrender.com)
```

---

## 🌐 Step 2: Get Your Service URLs

### Find Your Render Service URLs

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your services:
   - **Ingest Service:** `rtaa-ingest` → Copy the URL (e.g., `https://rtaa-ingest.onrender.com`)
   - **Frontend:** `rtaa-frontend` → Copy the URL (e.g., `https://rtaa-frontend.onrender.com`)

### WebSocket Endpoint

Your Exotel WebSocket URL will be:
```
wss://rtaa-ingest.onrender.com:8443/v1/ingest
```

**Note:** If Render uses a different port or path, check your service logs or Render settings.

---

## 📞 Step 3: Configure Exotel

### Option A: Stream Applet (Unidirectional - Audio Only)

1. **Go to Exotel Dashboard**
   - Navigate to: **App Bazaar** → **Stream Applet**

2. **Configure Applet:**
   - **WebSocket URL:** `wss://rtaa-ingest.onrender.com:8443/v1/ingest?sample-rate=16000`
   - **Authentication:** 
     - **IP Whitelist** (Recommended): Contact Exotel support for IP ranges
     - **OR Basic Auth:** `wss://API_KEY:API_TOKEN@rtaa-ingest.onrender.com:8443/v1/ingest`
   - **Sample Rate:** `16000` (16kHz recommended)
   - **Encoding:** `PCM16` (default)

3. **Save Configuration**

### Option B: Voicebot Applet (Bidirectional)

1. **Go to Exotel Dashboard**
   - Navigate to: **App Bazaar** → **Voicebot Applet**

2. **Configure Applet:**
   - **WebSocket URL:** `wss://rtaa-ingest.onrender.com:8443/v1/ingest?sample-rate=16000`
   - **Authentication:** Same as above
   - **Sample Rate:** `16000`
   - **Next Applet:** (Your choice - can be empty for testing)

3. **Save Configuration**

---

## 🧪 Step 4: Make a Test Call

### Method 1: Via Exotel Dashboard

1. **Go to Exotel Dashboard**
2. **Navigate to:** **Calls** → **Make a Call**
3. **Configure:**
   - **From Number:** Your Exotel number
   - **To Number:** Your test phone number
   - **Applet:** Select the Stream/Voicebot applet you configured
4. **Click "Make Call"**
5. **Speak into the phone** - Say something like:
   - "Hello, I need help with my credit card"
   - "My card was stolen and I need to block it"

### Method 2: Via API

```bash
curl -X POST https://api.exotel.com/v1/Accounts/{account_sid}/Calls.json \
  -u "{api_key}:{api_token}" \
  -d "From={exotel_number}" \
  -d "To={test_number}" \
  -d "CallerId={exotel_number}" \
  -d "Url=https://your-exotel-applet-url"
```

---

## 📊 Step 5: Monitor Logs (Real-Time)

### Ingest Service Logs

**In Render Dashboard:**
1. Go to `rtaa-ingest` service
2. Click **"Logs"** tab
3. Look for:
   ```
   [exotel] New Exotel WebSocket connection
   [exotel] Start event received: { stream_sid: "...", call_sid: "..." }
   [exotel] Published audio frame: { stream_sid: "...", seq: 1 }
   [exotel] Published audio frame: { stream_sid: "...", seq: 2 }
   ```

### ASR Worker Logs

**In Render Dashboard:**
1. Go to `rtaa-asr-worker` service
2. Click **"Logs"** tab
3. Look for:
   ```
   [ASR Worker] Received audio frame: { interactionId: "...", seq: 1 }
   [MockProvider] Generated transcript: "Hello, I need help..."
   [ASR Worker] Published transcript: { interactionId: "...", text: "..." }
   ```

### Frontend Logs

**In Render Dashboard:**
1. Go to `rtaa-frontend` service
2. Click **"Logs"** tab
3. Look for:
   ```
   [TranscriptConsumer] Auto-discovered transcript stream: { interactionId: "..." }
   [TranscriptConsumer] Received transcript message: { text: "...", seq: 1 }
   [TranscriptConsumer] ✅ Forwarded transcript successfully
   ```

---

## 🖥️ Step 6: View Transcripts in UI

### Option A: Test Transcripts Page (Recommended for Testing)

1. **Open Browser:**
   ```
   https://rtaa-frontend.onrender.com/test-transcripts
   ```

2. **Get the Interaction ID:**
   - From **Ingest Service logs**, find the `call_sid` or `stream_sid`
   - Example: `call-1762530768573` or `stream-abc123`
   - **Note:** Exotel uses `call_sid`, which maps to `interaction_id` in our system

3. **Subscribe to Transcripts:**
   - Enter the **Interaction ID** (use the `call_sid` from Exotel)
   - Click **"Subscribe to Transcripts"**
   - You should see: `✅ Subscribed to transcripts`

4. **Watch Transcripts Appear:**
   - Transcripts will appear in real-time as you speak
   - Each transcript line shows:
     - **Type:** `partial` or `final`
     - **Sequence:** Sequential number
     - **Text:** The transcribed text
     - **Timestamp:** When it was received

### Option B: Dashboard Page (Full UI)

1. **Open Browser:**
   ```
   https://rtaa-frontend.onrender.com/dashboard
   ```

2. **Update the Call ID:**
   - The dashboard currently uses a hardcoded `callId`
   - You may need to modify the code or use the test page first

### Option C: Demo Page

1. **Open Browser:**
   ```
   https://rtaa-frontend.onrender.com/demo
   ```

2. **Use Demo Controls:**
   - If available, use the demo controls to simulate a call
   - Or wait for real Exotel calls to appear

---

## 🔍 Step 7: Verify Each Step

### ✅ Step 1: Exotel → Ingest Service

**Check Ingest Logs:**
```bash
# Should see:
[exotel] New Exotel WebSocket connection
[exotel] Start event received: { stream_sid: "stream-123", call_sid: "call-456" }
[exotel] Published audio frame: { stream_sid: "stream-123", seq: 1 }
```

**If not working:**
- Verify `SUPPORT_EXOTEL=true` in Ingest service
- Check Exotel WebSocket URL is correct
- Verify IP whitelist or Basic Auth is configured

### ✅ Step 2: Ingest → Redis

**Check Ingest Logs:**
```bash
# Should see:
[RedisStreamsAdapter] Published to topic: audio.call-456
```

**If not working:**
- Verify `REDIS_URL` is correct
- Check Redis connection in logs
- Verify `PUBSUB_ADAPTER=redis_streams`

### ✅ Step 3: Redis → ASR Worker

**Check ASR Worker Logs:**
```bash
# Should see:
[ASR Worker] Subscribed to audio topic: audio.call-456
[ASR Worker] Received audio frame: { interactionId: "call-456", seq: 1 }
```

**If not working:**
- Verify ASR Worker is running
- Check `REDIS_URL` matches Ingest service
- Verify ASR Worker subscribed to audio topics

### ✅ Step 4: ASR Worker → Redis (Transcripts)

**Check ASR Worker Logs:**
```bash
# Should see:
[MockProvider] Generated transcript: "Hello, I need help..."
[ASR Worker] Published transcript: { interactionId: "call-456", text: "Hello, I need help..." }
```

**If not working:**
- Verify `ASR_PROVIDER` is set (mock or deepgram)
- Check ASR Worker is processing audio
- Verify transcripts are being generated

### ✅ Step 5: Redis → Transcript Consumer

**Check Frontend Logs:**
```bash
# Should see:
[TranscriptConsumer] Auto-discovered transcript stream: { interactionId: "call-456" }
[TranscriptConsumer] Received transcript message: { text: "Hello...", seq: 1 }
```

**If not working:**
- Verify Transcript Consumer is running (check instrumentation.ts)
- Check `REDIS_URL` matches other services
- Verify stream discovery is working

### ✅ Step 6: Transcript Consumer → Frontend (SSE)

**Check Frontend Logs:**
```bash
# Should see:
[TranscriptConsumer] ✅ Forwarded transcript successfully
```

**Check Browser Console:**
- Open browser DevTools → Console
- Should see SSE events being received

### ✅ Step 7: Frontend → UI Display

**Check Browser:**
- Transcripts should appear in real-time
- Each line should show text, timestamp, and type

**If not working:**
- Verify SSE endpoint is working: `/api/events/stream?callId=call-456`
- Check browser console for errors
- Verify you subscribed with the correct `interactionId`

---

## 🐛 Troubleshooting

### Problem: No Connection from Exotel

**Symptoms:**
- No logs in Ingest service
- Exotel shows connection failed

**Solutions:**
1. Verify `SUPPORT_EXOTEL=true` in Ingest service
2. Check WebSocket URL is correct (wss://, not https://)
3. Verify port 8443 is open (or check Render's actual port)
4. Check IP whitelist or Basic Auth credentials

### Problem: Audio Received but No Transcripts

**Symptoms:**
- Ingest logs show audio frames
- ASR Worker logs show no activity

**Solutions:**
1. Verify ASR Worker is running
2. Check `REDIS_URL` matches in both services
3. Verify ASR Worker subscribed to audio topics
4. Check Redis connection in ASR Worker logs

### Problem: Transcripts Generated but Not in UI

**Symptoms:**
- ASR Worker logs show transcripts published
- UI shows no transcripts

**Solutions:**
1. Verify Transcript Consumer is running (check frontend logs)
2. Check you subscribed with correct `interactionId` (use `call_sid` from Exotel)
3. Verify SSE endpoint is accessible
4. Check browser console for SSE errors

### Problem: Wrong Interaction ID

**Symptoms:**
- Transcripts exist but not showing in UI
- Different ID in logs vs UI

**Solutions:**
1. **Find the correct ID:**
   - From **Ingest logs:** Look for `call_sid` or `stream_sid` from Exotel
   - From **ASR Worker logs:** Look for `interactionId` in published transcripts
   - From **Frontend logs:** Look for `interactionId` in transcript consumer

2. **Use the same ID everywhere:**
   - Exotel sends `call_sid` → Maps to `interaction_id` in our system
   - Use this ID in the UI subscription

---

## 📝 Quick Test Checklist

- [ ] Exotel configured with WebSocket URL
- [ ] Test call made from Exotel
- [ ] Ingest service receives connection (check logs)
- [ ] Audio frames published to Redis (check logs)
- [ ] ASR Worker receives audio (check logs)
- [ ] Transcripts generated (check logs)
- [ ] Transcripts published to Redis (check logs)
- [ ] Transcript Consumer discovers stream (check logs)
- [ ] Transcript Consumer forwards to API (check logs)
- [ ] UI subscribed to correct interaction ID
- [ ] Transcripts appear in UI in real-time

---

## 🎯 Expected Flow Summary

```
1. Exotel Call
   ↓
2. Exotel → WebSocket → Ingest Service (wss://rtaa-ingest.onrender.com:8443/v1/ingest)
   ↓
3. Ingest Service → Publishes audio to Redis Stream: audio.{call_sid}
   ↓
4. ASR Worker → Subscribes to audio.{call_sid} → Processes audio → Generates transcripts
   ↓
5. ASR Worker → Publishes transcripts to Redis Stream: transcript.{call_sid}
   ↓
6. Transcript Consumer → Auto-discovers transcript.{call_sid} → Subscribes
   ↓
7. Transcript Consumer → Forwards to /api/calls/ingest-transcript → Triggers SSE broadcast
   ↓
8. Frontend UI → Subscribes via SSE: /api/events/stream?callId={call_sid}
   ↓
9. UI → Displays transcripts in real-time
```

---

## 🚀 Next Steps

Once testing is successful:

1. **Switch to Real ASR Provider:**
   - Change `ASR_PROVIDER=deepgram` in ASR Worker
   - Add `DEEPGRAM_API_KEY` environment variable

2. **Configure Production URLs:**
   - Update Exotel with production domain
   - Update `NEXT_PUBLIC_BASE_URL` in Frontend

3. **Monitor Performance:**
   - Check Redis connection count
   - Monitor ASR processing latency
   - Verify transcript accuracy

---

## 📞 Support

If you encounter issues:

1. **Check all service logs** in Render Dashboard
2. **Verify environment variables** are set correctly
3. **Check Redis connection** in all services
4. **Verify interaction IDs** match across services

Good luck with testing! 🎉


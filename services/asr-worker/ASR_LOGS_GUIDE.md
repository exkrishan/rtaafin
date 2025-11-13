# ASR Worker Logs Guide

## Current Status Interpretation

### ✅ Healthy Status (What You're Seeing Now)

```json
{
  "status": "ok",
  "provider": "elevenlabs",
  "activeBuffers": 0,        // ← No active calls
  "activeConnections": 0,    // ← No ElevenLabs connections
  "subscriptions": 2         // ← Subscribed to audio_stream and call_end
}
```

**This is NORMAL when:**
- No Exotel call is currently active
- Waiting for a call to start
- System is idle

---

## What to Expect When a Call Starts

### 1. Audio Reception Logs

When Exotel sends audio, you'll see:

```
[ASRWorker] 📨 Message received from Redis for topic audio_stream {
  interaction_id: 'call-12345',
  seq: 1,
  has_audio: true,
  audio_length: 1600,
  timestamp: '2025-01-13T16:20:00.000Z'
}
```

### 2. Buffer Creation

```
[ASRWorker] Created new audio buffer for interaction call-12345
[ASRWorker] Buffer status: { chunks: 1, duration: 200ms }
```

### 3. ElevenLabs Connection

```
[ElevenLabsProvider] Creating connection for call-12345
[ElevenLabsProvider] Session started for call-12345
[ElevenLabsProvider] Connection ready for call-12345
```

### 4. Audio Processing

```
[ASRWorker] Processing buffer for call-12345 (chunks: 5, duration: 500ms)
[ElevenLabsProvider] Sending audio chunk (seq: 1, size: 8000 bytes)
```

### 5. Transcripts Received

```
[ElevenLabsProvider] Received PARTIAL_TRANSCRIPT: "Hello"
[ASRWorker] Published partial transcript {
  interaction_id: 'call-12345',
  text: 'Hello',
  seq: 1
}

[ElevenLabsProvider] Received COMMITTED_TRANSCRIPT: "Hello, how can I help you?"
[ASRWorker] Published final transcript {
  interaction_id: 'call-12345',
  text: 'Hello, how can I help you?',
  seq: 2
}
```

### 6. Health Status During Active Call

```json
{
  "status": "ok",
  "provider": "elevenlabs",
  "activeBuffers": 1,        // ← Active call!
  "activeConnections": 1,    // ← ElevenLabs connected!
  "buffers": ["call-12345"]
}
```

---

## How to View Logs

### Option 1: Monitor Script (Recommended)

```bash
cd services/asr-worker
./scripts/monitor-logs.sh --watch
```

Updates every 5 seconds showing:
- Health status
- Metrics
- Transcript consumer status

### Option 2: View Live Console Logs

Since the worker runs in background, restart in foreground:

```bash
# Stop background process
lsof -ti:3001 | xargs kill -9

# Restart in foreground (see all logs)
cd services/asr-worker
ELEVENLABS_API_KEY='sk_d687c22a3dbf04db3097f3791abcd39abba69058fe835e8b' \
ASR_PROVIDER=elevenlabs \
EXO_BRIDGE_ENABLED=true \
REDIS_URL='redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304' \
PUBSUB_ADAPTER=redis_streams \
npm run dev
```

### Option 3: Quick Status Check

```bash
# Health status
curl -s http://localhost:3001/health | python3 -m json.tool

# Metrics
curl -s http://localhost:3001/metrics | head -30
```

---

## Troubleshooting

### No Audio Received?

**Check 1: Is Ingest Service receiving from Exotel?**
```bash
# Check if Ingest Service is running
curl http://localhost:3000/health  # or your ingest service URL

# Check Ingest Service logs for:
# [exotel] New Exotel WebSocket connection
# [exotel] Published binary audio frame
```

**Check 2: Is audio in Redis?**
```bash
redis-cli -u 'redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304' \
  XREAD COUNT 10 STREAMS audio_stream 0
```

**Check 3: ASR Worker subscription**
```bash
curl -s http://localhost:3001/health | python3 -m json.tool
# Should show: "subscriptions": 2
```

### No Transcripts Generated?

**Check 1: ElevenLabs Connection**
- Look for: `[ElevenLabsProvider] Session started`
- If you see auth errors, check API key and subscription

**Check 2: Audio Format**
- Should be PCM16, 8000Hz, mono
- Check logs for format warnings

**Check 3: Buffer Processing**
- Look for: `[ASRWorker] Processing buffer`
- Should see chunks being sent to ElevenLabs

### Transcripts Generated But Not Showing in UI?

**Check Transcript Consumer:**
```bash
curl -s http://localhost:3000/api/transcripts/status | python3 -m json.tool
```

Should show:
- `isRunning: true`
- Subscription for your `interaction_id`
- `transcriptCount` increasing

---

## Key Log Patterns

### ✅ Success Pattern
```
[ASRWorker] 📨 Message received → Buffer created → ElevenLabs connected → 
Audio sent → Transcript received → Published → Consumer forwarded → UI updated
```

### ❌ Error Pattern
```
[ASRWorker] 📨 Message received → ❌ Error in handleAudioFrame
```

### ⚠️ Warning Pattern
```
[ASRWorker] ⚠️ WARNING: Published transcript with EMPTY text!
```

---

## Metrics to Watch

```bash
curl -s http://localhost:3001/metrics
```

Key metrics:
- `asr_audio_chunks_processed_total` - Should increase during calls
- `asr_errors_total` - Should stay at 0
- `asr_transcripts_generated_total` - Should increase with speech

---

## Next Steps

1. **Make a test call from Exotel**
2. **Watch the monitor script**: `./scripts/monitor-logs.sh --watch`
3. **Check health endpoint**: Should show `activeBuffers: 1` and `activeConnections: 1`
4. **Check transcripts**: Should appear in UI at `http://localhost:3000/live`




# ✅ Environment Variables Verification Checklist

## 🔍 How to Verify in Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select each service
3. Click **"Environment"** tab (left sidebar)
4. Verify each variable below

---

## 📋 Service 1: Ingest Service (`rtaa-ingest`)

### Required Variables

| Variable | Expected Value | Status | Notes |
|----------|---------------|--------|-------|
| `SUPPORT_EXOTEL` | `true` | ⬜ | **CRITICAL** - Must be `true` for Exotel |
| `REDIS_URL` | `redis://default:...@...` | ⬜ | Your Redis connection string |
| `PUBSUB_ADAPTER` | `redis_streams` | ⬜ | Must be `redis_streams` |
| `PORT` | (Auto-set by Render) | ⬜ | Don't manually set |

### Optional Variables

| Variable | Expected Value | Status | Notes |
|----------|---------------|--------|-------|
| `JWT_PUBLIC_KEY` | `-----BEGIN PUBLIC KEY-----...` | ⬜ | Only needed if not using Exotel |
| `BUFFER_DURATION_MS` | `3000` | ⬜ | Optional (default: 3000) |
| `ACK_INTERVAL` | `10` | ⬜ | Optional (default: 10) |

### ✅ Verification Commands

After setting variables, check logs:
```bash
# Should see in logs:
[server] supportExotel: true
[server] Pub/Sub adapter initialized: redis_streams
[RedisStreamsAdapter] Connected to Redis: redis://...
```

---

## 📋 Service 2: ASR Worker (`rtaa-asr-worker`)

### Required Variables

| Variable | Expected Value | Status | Notes |
|----------|---------------|--------|-------|
| `REDIS_URL` | `redis://default:...@...` | ⬜ | **SAME** as Ingest service |
| `PUBSUB_ADAPTER` | `redis_streams` | ⬜ | Must be `redis_streams` |
| `ASR_PROVIDER` | `mock` or `deepgram` | ⬜ | Use `mock` for testing |

### Conditional Variables

| Variable | Required When | Expected Value | Status |
|----------|--------------|----------------|--------|
| `DEEPGRAM_API_KEY` | `ASR_PROVIDER=deepgram` | Your Deepgram API key | ⬜ |

### Optional Variables

| Variable | Expected Value | Status | Notes |
|----------|---------------|--------|-------|
| `PORT` | `3001` | ⬜ | Optional (default: 3001) |
| `BUFFER_WINDOW_MS` | `300` | ⬜ | Optional (default: 300) |
| `REDIS_CONSUMER_GROUP` | `asr-worker` | ⬜ | Optional (default: asr-worker) |
| `REDIS_CONSUMER_NAME` | `asr-worker-1` | ⬜ | Optional (default: asr-worker-1) |

### ✅ Verification Commands

After setting variables, check logs:
```bash
# Should see in logs:
[ASR Worker] Subscribed to audio topics
[ASR Worker] Using provider: mock (or deepgram)
[RedisStreamsAdapter] Connected to Redis: redis://...
```

---

## 📋 Service 3: Frontend (`rtaa-frontend`)

### Required Variables

| Variable | Expected Value | Status | Notes |
|----------|---------------|--------|-------|
| `REDIS_URL` | `redis://default:...@...` | ⬜ | **SAME** as other services |
| `PUBSUB_ADAPTER` | `redis_streams` | ⬜ | Must be `redis_streams` |
| `NEXT_PUBLIC_BASE_URL` | `https://rtaa-frontend.onrender.com` | ⬜ | Your frontend URL |

### Optional Variables (for other features)

| Variable | Expected Value | Status | Notes |
|----------|---------------|--------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://...supabase.co` | ⬜ | For Supabase features |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | ⬜ | For Supabase features |
| `LLM_API_KEY` | `AIzaSy...` | ⬜ | For LLM features |
| `LLM_PROVIDER` | `gemini` | ⬜ | For LLM features |

### ✅ Verification Commands

After setting variables, check logs:
```bash
# Should see in logs:
[TranscriptConsumer] Initialized
[TranscriptConsumer] Stream discovery started
```

---

## 🔗 Critical: All Services Must Share Same Redis

**⚠️ IMPORTANT:** All three services (`rtaa-ingest`, `rtaa-asr-worker`, `rtaa-frontend`) **MUST** use the **SAME** `REDIS_URL`.

If they use different Redis instances, they won't be able to communicate!

---

## 📝 Quick Copy-Paste Checklist

### For Ingest Service:
```bash
SUPPORT_EXOTEL=true
REDIS_URL=redis://default:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT
PUBSUB_ADAPTER=redis_streams
```

### For ASR Worker:
```bash
REDIS_URL=redis://default:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT
PUBSUB_ADAPTER=redis_streams
ASR_PROVIDER=mock
# OR if using Deepgram:
# ASR_PROVIDER=deepgram
# DEEPGRAM_API_KEY=your_deepgram_key
```

### For Frontend:
```bash
REDIS_URL=redis://default:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT
PUBSUB_ADAPTER=redis_streams
NEXT_PUBLIC_BASE_URL=https://rtaa-frontend.onrender.com
```

---

## 🐛 Common Issues

### Issue 1: Services Can't Communicate

**Symptom:** Audio received but no transcripts

**Check:**
- [ ] All services have **SAME** `REDIS_URL`
- [ ] All services have `PUBSUB_ADAPTER=redis_streams`
- [ ] Redis is accessible from all services

### Issue 2: Exotel Connection Fails

**Symptom:** No connection from Exotel

**Check:**
- [ ] `SUPPORT_EXOTEL=true` in Ingest service
- [ ] WebSocket URL is correct
- [ ] IP whitelist or Basic Auth configured

### Issue 3: ASR Not Processing

**Symptom:** Audio frames received but no transcripts

**Check:**
- [ ] `ASR_PROVIDER` is set (mock or deepgram)
- [ ] If using Deepgram: `DEEPGRAM_API_KEY` is set
- [ ] ASR Worker is running and subscribed

---

## ✅ Final Verification

After setting all variables:

1. **Restart all services** (Render will auto-restart)
2. **Check logs** for each service:
   - Ingest: Should show `supportExotel: true`
   - ASR Worker: Should show `Subscribed to audio topics`
   - Frontend: Should show `TranscriptConsumer initialized`
3. **Test connection:**
   - Make a test call from Exotel
   - Check logs for audio frames
   - Check logs for transcripts
   - Check UI for transcript display

---

## 📞 Need Help?

If variables are set but services still don't work:

1. **Check Render Logs:**
   - Go to each service → Logs tab
   - Look for error messages
   - Check for connection errors

2. **Verify Redis Connection:**
   - All services should show: `Connected to Redis: redis://...`
   - If not, check `REDIS_URL` format

3. **Check Service Status:**
   - All services should show "Live" status
   - If "Failed", check logs for errors


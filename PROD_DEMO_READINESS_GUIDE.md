# 🎯 Production Demo Readiness Guide

## ⚠️ Important Notes

**Render Free Tier Services:**
- Services may sleep after 15 minutes of inactivity
- First request after sleep takes **30-60 seconds** to wake up
- This is normal behavior for free tier

**Before Demo:**
1. Wake up services by making a request 1-2 minutes before demo
2. Keep services active during demo (ping every 5-10 minutes)
3. Have backup plan if services are slow

---

## 🔍 Service URLs

| Service | URL | Health Endpoint |
|---------|-----|----------------|
| **Frontend** | `https://frontend-8jdd.onrender.com` | `/api/health` |
| **ASR Worker** | `https://rtaa-asr-worker.onrender.com` | `/health` |
| **Ingest** | `https://rtaa-ingest.onrender.com` | `/health` |

---

## ✅ Pre-Demo Testing Checklist

### 1. Wake Up Services (Do this 2-3 minutes before demo)

```bash
# Wake up Frontend
curl https://frontend-8jdd.onrender.com/api/health

# Wake up ASR Worker  
curl https://rtaa-asr-worker.onrender.com/health

# Wait 30-60 seconds for services to wake up
```

### 2. Test Frontend Service

```bash
# Health Check
curl https://frontend-8jdd.onrender.com/api/health
# Expected: {"status":"ok","service":"frontend"}

# Production UI
# Open in browser: https://frontend-8jdd.onrender.com/test-agent-assist
# Should load the production UI with auto-discovery
```

### 3. Test Transcript Consumer

```bash
curl https://frontend-8jdd.onrender.com/api/transcripts/status
# Expected: {"isRunning":true,"activeStreams":X}
```

**If consumer is not running:**
- Check Render logs for errors
- Verify `REDIS_URL` is set correctly
- Restart frontend service if needed

### 4. Test ASR Worker

```bash
curl https://rtaa-asr-worker.onrender.com/health
# Expected: {"status":"ok","elevenlabs":{...}}

curl https://rtaa-asr-worker.onrender.com/metrics
# Should show active connections and stats
```

### 5. Test Intent Detection & KB

```bash
curl -X POST https://frontend-8jdd.onrender.com/api/calls/ingest-transcript \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: default" \
  -d '{
    "callId": "test-demo-readiness",
    "seq": 1,
    "ts": "2025-01-17T12:00:00.000Z",
    "text": "Customer: I need to block my credit card due to fraud"
  }'

# Expected Response:
# {
#   "ok": true,
#   "intent": "credit_card_fraud",
#   "confidence": 0.95,
#   "articles": [...]
# }
```

**Check:**
- ✅ `intent` is not "unknown"
- ✅ `confidence` > 0.5
- ✅ `articles` array has items

### 6. Test Active Calls Discovery

```bash
curl "https://frontend-8jdd.onrender.com/api/calls/active?limit=10"
# Expected: {"calls":[...]}
```

### 7. Test KB Search

```bash
curl "https://frontend-8jdd.onrender.com/api/kb/search?q=credit+card+fraud&tenantId=default"
# Expected: {"articles":[...]}
```

---

## 🎬 Demo Flow

### Step 1: Open Production UI
1. Go to: `https://frontend-8jdd.onrender.com/test-agent-assist`
2. Verify page loads
3. Check "Auto-discover active calls" is enabled

### Step 2: Start Monitoring
1. **Option A - Auto-Discovery:**
   - Wait for auto-discovery to find active calls
   - Select a call from the dropdown
   
2. **Option B - Manual Entry:**
   - Enter Interaction ID manually
   - Click to start monitoring

### Step 3: Verify Real-Time Features
1. **Transcripts:**
   - Should appear in real-time in right panel
   - Updates as new transcript lines arrive
   
2. **KB Suggestions:**
   - Should appear when intent is detected
   - Updates based on conversation context
   
3. **Disposition:**
   - Should open automatically at end of call
   - Shows suggested disposition and notes

---

## 🐛 Troubleshooting

### Issue: Services Not Responding

**Symptoms:**
- `fetch failed` errors
- Timeout errors
- 502/503 errors

**Solutions:**
1. **Services are sleeping:**
   - Wait 30-60 seconds after first request
   - Services wake up automatically
   
2. **Services are down:**
   - Check Render dashboard
   - Check deployment logs
   - Restart service if needed

### Issue: Transcripts Not Appearing

**Check:**
1. Is ASR Worker running?
   ```bash
   curl https://rtaa-asr-worker.onrender.com/health
   ```

2. Is Transcript Consumer running?
   ```bash
   curl https://frontend-8jdd.onrender.com/api/transcripts/status
   ```

3. Is there an active call?
   ```bash
   curl https://frontend-8jdd.onrender.com/api/calls/active
   ```

4. Check Render logs for errors

### Issue: KB Suggestions Not Appearing

**Check:**
1. Is Gemini API key configured?
   ```bash
   curl https://frontend-8jdd.onrender.com/api/debug/intent
   ```

2. Is intent detection working?
   - Test with ingest-transcript API
   - Verify intent is not "unknown"

3. Are KB articles available?
   ```bash
   curl "https://frontend-8jdd.onrender.com/api/kb/search?q=test&tenantId=default"
   ```

### Issue: SSE Stream Not Working

**Check:**
1. Is Redis connected?
   - Check frontend logs
   - Verify `REDIS_URL` is set

2. Is transcript consumer publishing?
   - Check consumer status
   - Check consumer logs

---

## 📊 Environment Variables Checklist

### Frontend Service (Render)

**Required:**
- ✅ `REDIS_URL` - Redis connection string
- ✅ `PUBSUB_ADAPTER=redis_streams`
- ✅ `GEMINI_API_KEY` - Your Gemini API key
- ✅ `LLM_PROVIDER=gemini`
- ✅ `GEMINI_MODEL=gemini-2.0-flash`
- ✅ `SUPABASE_URL` - Supabase project URL
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Supabase service key

**Optional:**
- `NODE_ENV=production`
- `SERVICE_NAME=frontend`

### ASR Worker Service (Render)

**Required:**
- ✅ `ELEVENLABS_API_KEY` - ElevenLabs API key
- ✅ `ASR_PROVIDER=elevenlabs`
- ✅ `REDIS_URL` - Redis connection string
- ✅ `PUBSUB_ADAPTER=redis_streams`

---

## 🚀 Quick Pre-Demo Script

Save this as `wake-up-services.sh`:

```bash
#!/bin/bash
echo "🔔 Waking up Render services..."

echo "1. Frontend..."
curl -s https://frontend-8jdd.onrender.com/api/health > /dev/null
sleep 5

echo "2. ASR Worker..."
curl -s https://rtaa-asr-worker.onrender.com/health > /dev/null
sleep 5

echo "3. Testing transcript flow..."
curl -s -X POST https://frontend-8jdd.onrender.com/api/calls/ingest-transcript \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: default" \
  -d '{"callId":"wake-up-test","seq":1,"ts":"2025-01-17T12:00:00Z","text":"Test"}' > /dev/null

echo "✅ Services should be awake now!"
echo "⏳ Wait 30 seconds, then start demo"
```

Run: `bash wake-up-services.sh`

---

## 📝 Demo Day Checklist

**30 Minutes Before:**
- [ ] Wake up all services
- [ ] Test health endpoints
- [ ] Verify transcript consumer is running
- [ ] Test intent detection
- [ ] Test KB search
- [ ] Open production UI and verify it loads

**5 Minutes Before:**
- [ ] Wake up services again (if needed)
- [ ] Have production UI open and ready
- [ ] Have Interaction ID ready (or use auto-discovery)
- [ ] Test one transcript ingestion

**During Demo:**
- [ ] Monitor Render dashboard for errors
- [ ] Have backup plan if services are slow
- [ ] Keep services active (ping every 5-10 min)

---

## 🎯 Success Criteria

**Demo is ready if:**
- ✅ All services respond to health checks
- ✅ Production UI loads correctly
- ✅ Transcript consumer is running
- ✅ Intent detection returns valid intents (not "unknown")
- ✅ KB search returns articles
- ✅ Active calls API works

**Demo is working if:**
- ✅ Transcripts appear in real-time
- ✅ KB suggestions appear when intent detected
- ✅ Disposition modal opens at end of call
- ✅ All features work smoothly

---

## 📞 Emergency Contacts

If services fail during demo:
1. Check Render dashboard immediately
2. Restart services if needed
3. Use local demo (`/demo`) as backup
4. Have screenshots/videos ready as backup

---

**Last Updated:** 2025-01-17
**Status:** Ready for testing


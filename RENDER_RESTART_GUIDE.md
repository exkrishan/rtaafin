# 🔄 Render Service Restart Guide

**Purpose:** Close old Redis connections and restart services with new connection management code.

---

## 🎯 Why Restart?

- **Old connections** from before fixes are still open
- **Redis Cloud** has connection limit (~10-30 for free tier)
- **ASR worker** can't connect → can't consume audio → no transcripts
- **Restart closes** old connections immediately

---

## 📋 Step-by-Step Instructions

### Step 1: Open Render Dashboard

1. Go to: **https://dashboard.render.com**
2. Log in to your account
3. You should see your services listed

---

### Step 2: Restart Services (In Order)

#### A. Ingest Service

1. Click on **"ingest"** service (or your ingest service name)
2. Look for one of these options:
   - **"Restart"** button (if available) → Click it
   - **"Manual Deploy"** → **"Clear build cache & deploy"**
3. Wait for restart to complete (~1-2 minutes)
4. Check logs to confirm: `Your service is live 🎉`

#### B. ASR Worker

1. Click on **"asr-worker"** service (or your ASR worker service name)
2. Look for one of these options:
   - **"Restart"** button (if available) → Click it
   - **"Manual Deploy"** → **"Clear build cache & deploy"**
3. Wait for restart to complete (~1-2 minutes)
4. Check logs to confirm: `[ASRWorker] Server listening on port 10000`

#### C. Frontend (Next.js)

1. Click on **"frontend"** service (or your frontend service name)
2. Look for one of these options:
   - **"Restart"** button (if available) → Click it
   - **"Manual Deploy"** → **"Clear build cache & deploy"**
3. Wait for restart to complete (~2-5 minutes)
4. Check logs to confirm: `Ready in X seconds`

---

### Step 3: Verify Services Are Live

**Health Checks:**

```bash
# Ingest Service
curl https://rtaa-ingest.onrender.com/health
# Expected: {"status":"ok","service":"ingest"}

# ASR Worker
curl https://rtaa-asr-worker.onrender.com/health
# Expected: {"status":"ok","service":"asr-worker"}

# Frontend
curl https://rtaa-frontend.onrender.com/api/health
# Expected: {"status":"ok","service":"frontend"}
```

---

### Step 4: Check Logs for Success

**What to Look For:**

✅ **Good Signs:**
- `[RedisStreamsAdapter] Connected to Redis` (once, not repeatedly)
- `[RedisStreamsAdapter] Reusing existing Redis connection` (on subsequent operations)
- `[ASRWorker] Subscribing to audio topic: audio_stream`
- `[TranscriptConsumer] ✅ Transcript consumer started`
- No "max number of clients" errors
- No "Connection issue, retrying" spam

❌ **Bad Signs:**
- `ERR max number of clients reached` (still hitting limit)
- `Connection issue, retrying in 5s...` (still retrying)
- Multiple "Connected to Redis" messages (creating too many connections)

---

### Step 5: Test End-to-End

1. **Make NEW call from Exotel**
2. **Check ASR Worker logs:**
   - Should see: `[DeepgramProvider] ✅ Connection opened`
   - Should see: `[DeepgramProvider] 📝 Received transcript`
3. **Check Frontend logs:**
   - Should see: `[TranscriptConsumer] Received transcript message`
   - Should see: `✅ Forwarded transcript successfully`
4. **Check UI:**
   - Subscribe to interaction ID
   - Transcripts should appear in real-time

---

## 🔍 Troubleshooting

### Still Seeing Max Clients Error?

**Option 1: Wait Longer**
- Redis Cloud may take 5-10 minutes to close idle connections
- Wait 10-15 minutes and try again

**Option 2: Check Redis Cloud Dashboard**
- Go to Redis Cloud dashboard
- Check "Clients" tab
- See how many connections are active
- Manually close idle connections if possible

**Option 3: Upgrade Redis Plan**
- Free tier: ~10-30 connections
- Paid tier: More connections
- Consider upgrading if you need more capacity

### Services Not Restarting?

1. **Check Render Status:** https://status.render.com
2. **Check Service Logs:** Look for error messages
3. **Try Manual Deploy:** Instead of restart, do a fresh deploy
4. **Contact Render Support:** If services are stuck

---

## ✅ Success Criteria

After restart, you should see:

1. ✅ Services restart successfully
2. ✅ Redis connections: 1 per service (not 10+)
3. ✅ No "max clients" errors
4. ✅ ASR worker can consume audio
5. ✅ Transcripts flow end-to-end

---

## 📊 Expected Connection Count

**Before Fix:**
- Ingest: 1 connection + 1 per subscription = 5-10 connections
- ASR Worker: 1 connection + 1 per subscription = 5-10 connections
- Frontend: 1 connection + 1 per subscription = 5-10 connections
- **Total: 15-30+ connections** ❌

**After Fix:**
- Ingest: 1 connection (shared)
- ASR Worker: 1 connection (shared)
- Frontend: 1 connection (shared)
- **Total: 3 connections** ✅

---

## 🎯 Next Steps After Restart

1. **Wait 1-2 minutes** for all services to restart
2. **Verify health endpoints** (all should return 200 OK)
3. **Check logs** (should see clean connection messages)
4. **Make NEW call from Exotel**
5. **Test complete flow** (audio → ASR → transcripts → UI)

---

## 💡 Pro Tip

If you're still hitting max clients after restart:
- Check Redis Cloud dashboard for connection count
- Consider using a dedicated Redis instance (not shared)
- Or upgrade to a paid Redis Cloud plan


**Purpose:** Close old Redis connections and restart services with new connection management code.

---

## 🎯 Why Restart?

- **Old connections** from before fixes are still open
- **Redis Cloud** has connection limit (~10-30 for free tier)
- **ASR worker** can't connect → can't consume audio → no transcripts
- **Restart closes** old connections immediately

---

## 📋 Step-by-Step Instructions

### Step 1: Open Render Dashboard

1. Go to: **https://dashboard.render.com**
2. Log in to your account
3. You should see your services listed

---

### Step 2: Restart Services (In Order)

#### A. Ingest Service

1. Click on **"ingest"** service (or your ingest service name)
2. Look for one of these options:
   - **"Restart"** button (if available) → Click it
   - **"Manual Deploy"** → **"Clear build cache & deploy"**
3. Wait for restart to complete (~1-2 minutes)
4. Check logs to confirm: `Your service is live 🎉`

#### B. ASR Worker

1. Click on **"asr-worker"** service (or your ASR worker service name)
2. Look for one of these options:
   - **"Restart"** button (if available) → Click it
   - **"Manual Deploy"** → **"Clear build cache & deploy"**
3. Wait for restart to complete (~1-2 minutes)
4. Check logs to confirm: `[ASRWorker] Server listening on port 10000`

#### C. Frontend (Next.js)

1. Click on **"frontend"** service (or your frontend service name)
2. Look for one of these options:
   - **"Restart"** button (if available) → Click it
   - **"Manual Deploy"** → **"Clear build cache & deploy"**
3. Wait for restart to complete (~2-5 minutes)
4. Check logs to confirm: `Ready in X seconds`

---

### Step 3: Verify Services Are Live

**Health Checks:**

```bash
# Ingest Service
curl https://rtaa-ingest.onrender.com/health
# Expected: {"status":"ok","service":"ingest"}

# ASR Worker
curl https://rtaa-asr-worker.onrender.com/health
# Expected: {"status":"ok","service":"asr-worker"}

# Frontend
curl https://rtaa-frontend.onrender.com/api/health
# Expected: {"status":"ok","service":"frontend"}
```

---

### Step 4: Check Logs for Success

**What to Look For:**

✅ **Good Signs:**
- `[RedisStreamsAdapter] Connected to Redis` (once, not repeatedly)
- `[RedisStreamsAdapter] Reusing existing Redis connection` (on subsequent operations)
- `[ASRWorker] Subscribing to audio topic: audio_stream`
- `[TranscriptConsumer] ✅ Transcript consumer started`
- No "max number of clients" errors
- No "Connection issue, retrying" spam

❌ **Bad Signs:**
- `ERR max number of clients reached` (still hitting limit)
- `Connection issue, retrying in 5s...` (still retrying)
- Multiple "Connected to Redis" messages (creating too many connections)

---

### Step 5: Test End-to-End

1. **Make NEW call from Exotel**
2. **Check ASR Worker logs:**
   - Should see: `[DeepgramProvider] ✅ Connection opened`
   - Should see: `[DeepgramProvider] 📝 Received transcript`
3. **Check Frontend logs:**
   - Should see: `[TranscriptConsumer] Received transcript message`
   - Should see: `✅ Forwarded transcript successfully`
4. **Check UI:**
   - Subscribe to interaction ID
   - Transcripts should appear in real-time

---

## 🔍 Troubleshooting

### Still Seeing Max Clients Error?

**Option 1: Wait Longer**
- Redis Cloud may take 5-10 minutes to close idle connections
- Wait 10-15 minutes and try again

**Option 2: Check Redis Cloud Dashboard**
- Go to Redis Cloud dashboard
- Check "Clients" tab
- See how many connections are active
- Manually close idle connections if possible

**Option 3: Upgrade Redis Plan**
- Free tier: ~10-30 connections
- Paid tier: More connections
- Consider upgrading if you need more capacity

### Services Not Restarting?

1. **Check Render Status:** https://status.render.com
2. **Check Service Logs:** Look for error messages
3. **Try Manual Deploy:** Instead of restart, do a fresh deploy
4. **Contact Render Support:** If services are stuck

---

## ✅ Success Criteria

After restart, you should see:

1. ✅ Services restart successfully
2. ✅ Redis connections: 1 per service (not 10+)
3. ✅ No "max clients" errors
4. ✅ ASR worker can consume audio
5. ✅ Transcripts flow end-to-end

---

## 📊 Expected Connection Count

**Before Fix:**
- Ingest: 1 connection + 1 per subscription = 5-10 connections
- ASR Worker: 1 connection + 1 per subscription = 5-10 connections
- Frontend: 1 connection + 1 per subscription = 5-10 connections
- **Total: 15-30+ connections** ❌

**After Fix:**
- Ingest: 1 connection (shared)
- ASR Worker: 1 connection (shared)
- Frontend: 1 connection (shared)
- **Total: 3 connections** ✅

---

## 🎯 Next Steps After Restart

1. **Wait 1-2 minutes** for all services to restart
2. **Verify health endpoints** (all should return 200 OK)
3. **Check logs** (should see clean connection messages)
4. **Make NEW call from Exotel**
5. **Test complete flow** (audio → ASR → transcripts → UI)

---

## 💡 Pro Tip

If you're still hitting max clients after restart:
- Check Redis Cloud dashboard for connection count
- Consider using a dedicated Redis instance (not shared)
- Or upgrade to a paid Redis Cloud plan


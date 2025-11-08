# 🔑 Add Deepgram API Key to Render

## ⚠️ Security Warning

**DO NOT commit API keys to git!** API keys should only be set as environment variables in Render.

---

## ✅ Step-by-Step Instructions

### Step 1: Go to Render Dashboard

1. Open [Render Dashboard](https://dashboard.render.com)
2. Log in to your account

### Step 2: Find ASR Worker Service

1. Find the service named: **`rtaa-asr-worker`** (or similar)
2. Click on the service name to open it

### Step 3: Open Environment Tab

1. Click on **"Environment"** tab in the left sidebar (under "MANAGE")
2. You'll see a list of existing environment variables

### Step 4: Add Deepgram API Key

1. Click **"Add Environment Variable"** button
2. In the **"Key"** field, enter:
   ```
   DEEPGRAM_API_KEY
   ```
3. In the **"Value"** field, enter:
   ```
   d65326fff430ad13ad6ad78acfe305a8d8c8245e
   ```
4. Click **"Save Changes"**

### Step 5: Verify ASR Provider Setting

While you're in the Environment tab, also verify:

1. **`ASR_PROVIDER`** should be set to: `deepgram`
   - If it's not set or set to `mock`, add/update it:
     - Key: `ASR_PROVIDER`
     - Value: `deepgram`

### Step 6: Service Will Auto-Redeploy

After saving:
- Render will automatically redeploy the service
- Wait 5-10 minutes for deployment to complete
- Check logs to verify it's working

---

## ✅ Verification

### Check 1: Service Status

1. Go back to service overview
2. Status should show **"Live"** (not "Failed")
3. If it shows "Failed", check logs for errors

### Check 2: Logs

After deployment, check logs. You should see:

**✅ Success:**
```
[ASRWorker] Using ASR provider: deepgram
[DeepgramProvider] Initialized with API key
[ASRWorker] Subscribed to audio topics
```

**❌ Failure (if API key is wrong):**
```
[ASRWorker] ❌ CRITICAL: ASR_PROVIDER=deepgram but DEEPGRAM_API_KEY is not set!
```
OR
```
[DeepgramProvider] Error: Invalid API key
```

### Check 3: Health Endpoint

Once service is live, test the health endpoint:

```bash
curl https://rtaa-asr-worker.onrender.com/health
```

Should return:
```json
{"status":"ok","service":"asr-worker"}
```

---

## 📋 Complete Environment Variables for ASR Worker

Make sure these are set:

| Variable | Value | Required |
|---------|-------|----------|
| `ASR_PROVIDER` | `deepgram` | ✅ Yes |
| `DEEPGRAM_API_KEY` | `d65326fff430ad13ad6ad78acfe305a8d8c8245e` | ✅ Yes |
| `REDIS_URL` | `redis://default:...@...` | ✅ Yes |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes |

---

## 🚨 Important Notes

1. **Never commit API keys to git** - They should only be in Render environment variables
2. **API keys are sensitive** - Don't share them publicly
3. **Service will fail if key is missing** - We explicitly fail (no fallback to mock)
4. **Key is validated on startup** - Service won't start if key is invalid

---

## 🧪 Testing After Setup

1. **Wait for deployment** (~5-10 minutes)
2. **Check service status** - Should be "Live"
3. **Check logs** - Should show Deepgram provider initialized
4. **Make Exotel call** - Transcripts should be real (not fake mock transcripts)

---

## ✅ Summary

**What to do:**
1. Go to Render Dashboard → `rtaa-asr-worker` → Environment
2. Add `DEEPGRAM_API_KEY` = `d65326fff430ad13ad6ad78acfe305a8d8c8245e`
3. Verify `ASR_PROVIDER` = `deepgram`
4. Save and wait for redeploy
5. Check logs to verify it's working

**Expected result:**
- Service starts successfully
- Uses real Deepgram transcription
- No fallback to mock provider


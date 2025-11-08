# 🔧 Fix Exotel WebSocket Connection

## Problem

Logs show:
```
supportExotel: false
```

**Result:** Exotel connections are being rejected because:
1. Exotel protocol detection is disabled
2. Service requires JWT authentication (which Exotel doesn't send)
3. Connections fail at the `verifyClient` level

---

## ✅ Solution: Enable Exotel Support

### Step 1: Update Render Environment Variables

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your **`rtaa-ingest`** service
3. Click on **"Environment"** tab (in the left sidebar under "MANAGE")
4. Click **"Add Environment Variable"**
5. Add:
   - **Key:** `SUPPORT_EXOTEL`
   - **Value:** `true`
6. Click **"Save Changes"**

### Step 2: Service Will Auto-Redeploy

Render will automatically redeploy your service with the new environment variable.

### Step 3: Verify in Logs

After redeployment, check logs. You should see:
```
supportExotel: true
```

---

## 🔍 What This Does

When `SUPPORT_EXOTEL=true`:

1. **Protocol Detection:** Service detects Exotel connections automatically
2. **Authentication Bypass:** Skips JWT validation for Exotel connections
3. **Message Handling:** Processes Exotel's JSON message format
4. **Audio Processing:** Handles base64-encoded audio from Exotel

---

## 📋 Expected Logs After Fix

When Exotel connects, you should see:

```
[server] Exotel WebSocket upgrade request (IP whitelist/Basic Auth)
[exotel] Start event received: { stream_sid: "...", call_sid: "..." }
[exotel] Published audio frame: { stream_sid: "...", seq: 1 }
[exotel] Published audio frame: { stream_sid: "...", seq: 2 }
...
```

---

## 🧪 Test After Fix

1. **Check Logs:** Look for "Exotel WebSocket upgrade request"
2. **Make Test Call:** From Exotel dashboard
3. **Verify Audio:** Check for "Published audio frame" messages
4. **Check Redis:** Audio should be published to Redis Streams

---

## 🐛 If Still Not Working

### Check 1: Verify Environment Variable
- Go to Render → Environment tab
- Confirm `SUPPORT_EXOTEL=true` is set
- Service must be redeployed after adding env var

### Check 2: Check Connection Errors
Look for these in logs:
- `401 Unauthorized` - Authentication still failing
- `Connection refused` - Service not running
- `WebSocket upgrade failed` - Protocol detection issue

### Check 3: Verify Exotel Configuration
In Exotel dashboard:
- WebSocket URL: `wss://rtaa-ingest.onrender.com/v1/ingest`
- Authentication: Basic Auth or IP Whitelisting
- Audio Format: PCM16, 24000 Hz

---

## ✅ Quick Checklist

- [ ] `SUPPORT_EXOTEL=true` added to Render environment
- [ ] Service redeployed (automatic after env var change)
- [ ] Logs show `supportExotel: true`
- [ ] Exotel configured with correct WebSocket URL
- [ ] Test call made from Exotel
- [ ] Logs show "Exotel WebSocket upgrade request"
- [ ] Logs show "Published audio frame" messages

---

**After setting `SUPPORT_EXOTEL=true`, the service will accept Exotel connections!** 🚀


## Problem

Logs show:
```
supportExotel: false
```

**Result:** Exotel connections are being rejected because:
1. Exotel protocol detection is disabled
2. Service requires JWT authentication (which Exotel doesn't send)
3. Connections fail at the `verifyClient` level

---

## ✅ Solution: Enable Exotel Support

### Step 1: Update Render Environment Variables

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your **`rtaa-ingest`** service
3. Click on **"Environment"** tab (in the left sidebar under "MANAGE")
4. Click **"Add Environment Variable"**
5. Add:
   - **Key:** `SUPPORT_EXOTEL`
   - **Value:** `true`
6. Click **"Save Changes"**

### Step 2: Service Will Auto-Redeploy

Render will automatically redeploy your service with the new environment variable.

### Step 3: Verify in Logs

After redeployment, check logs. You should see:
```
supportExotel: true
```

---

## 🔍 What This Does

When `SUPPORT_EXOTEL=true`:

1. **Protocol Detection:** Service detects Exotel connections automatically
2. **Authentication Bypass:** Skips JWT validation for Exotel connections
3. **Message Handling:** Processes Exotel's JSON message format
4. **Audio Processing:** Handles base64-encoded audio from Exotel

---

## 📋 Expected Logs After Fix

When Exotel connects, you should see:

```
[server] Exotel WebSocket upgrade request (IP whitelist/Basic Auth)
[exotel] Start event received: { stream_sid: "...", call_sid: "..." }
[exotel] Published audio frame: { stream_sid: "...", seq: 1 }
[exotel] Published audio frame: { stream_sid: "...", seq: 2 }
...
```

---

## 🧪 Test After Fix

1. **Check Logs:** Look for "Exotel WebSocket upgrade request"
2. **Make Test Call:** From Exotel dashboard
3. **Verify Audio:** Check for "Published audio frame" messages
4. **Check Redis:** Audio should be published to Redis Streams

---

## 🐛 If Still Not Working

### Check 1: Verify Environment Variable
- Go to Render → Environment tab
- Confirm `SUPPORT_EXOTEL=true` is set
- Service must be redeployed after adding env var

### Check 2: Check Connection Errors
Look for these in logs:
- `401 Unauthorized` - Authentication still failing
- `Connection refused` - Service not running
- `WebSocket upgrade failed` - Protocol detection issue

### Check 3: Verify Exotel Configuration
In Exotel dashboard:
- WebSocket URL: `wss://rtaa-ingest.onrender.com/v1/ingest`
- Authentication: Basic Auth or IP Whitelisting
- Audio Format: PCM16, 24000 Hz

---

## ✅ Quick Checklist

- [ ] `SUPPORT_EXOTEL=true` added to Render environment
- [ ] Service redeployed (automatic after env var change)
- [ ] Logs show `supportExotel: true`
- [ ] Exotel configured with correct WebSocket URL
- [ ] Test call made from Exotel
- [ ] Logs show "Exotel WebSocket upgrade request"
- [ ] Logs show "Published audio frame" messages

---

**After setting `SUPPORT_EXOTEL=true`, the service will accept Exotel connections!** 🚀


# 🔍 Exotel Connection Debugging Guide

## Problem
Exotel call started but **no logs appear** in Render. Service is running but WebSocket connection isn't being established.

---

## ✅ Quick Checks

### 1. Verify Exotel WebSocket URL Configuration

In Exotel dashboard, ensure:
- **WebSocket URL:** `wss://rtaa-ingest.onrender.com/v1/ingest`
- **Protocol:** `wss://` (secure WebSocket)
- **Path:** `/v1/ingest` (must match exactly)

### 2. Check Render Environment Variables

Go to Render Dashboard → Environment tab, verify:
- ✅ `SUPPORT_EXOTEL=true` is set
- ✅ `REDIS_URL` is configured
- ✅ `PUBSUB_ADAPTER=redis_streams`

### 3. Test WebSocket Endpoint Manually

```bash
# Test if WebSocket endpoint is accessible
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://rtaa-ingest.onrender.com/v1/ingest
```

**Expected:** HTTP 101 Switching Protocols (if working)

---

## 📋 What to Look For in Logs

After the enhanced logging is deployed, you should see:

### ✅ Successful Connection
```
[server] WebSocket upgrade request received { url: '/v1/ingest', ... }
[server] ✅ Exotel WebSocket upgrade request accepted
[exotel] New Exotel WebSocket connection
[exotel] Processing binary frames with default config
[exotel] Published binary audio frame { seq: 100, ... }
```

### ❌ Connection Rejected
```
[server] WebSocket upgrade request received { ... }
[server] ❌ Authentication failed: ...
```

### ⚠️ No Connection Attempt
- **No logs at all** = Exotel isn't connecting
- Check Exotel dashboard configuration
- Verify WebSocket URL is correct
- Check Exotel's connection logs (if available)

---

## 🔧 Common Issues

### Issue 1: Wrong WebSocket URL
**Symptom:** No connection logs at all

**Solution:**
- Verify URL in Exotel: `wss://rtaa-ingest.onrender.com/v1/ingest`
- Check for typos (http vs https, wrong path)
- Ensure no trailing slash

### Issue 2: SUPPORT_EXOTEL Not Set
**Symptom:** Connection rejected with 401

**Solution:**
- Set `SUPPORT_EXOTEL=true` in Render
- Redeploy service
- Check logs show `supportExotel: true`

### Issue 3: Firewall/Network Issue
**Symptom:** Connection timeout

**Solution:**
- Check if Exotel's IP is whitelisted (if required)
- Verify Render service is accessible
- Test health endpoint: `curl https://rtaa-ingest.onrender.com/health`

### Issue 4: Exotel Not Sending Connection
**Symptom:** No logs, service is healthy

**Solution:**
- Check Exotel dashboard for connection errors
- Verify Exotel's WebSocket configuration
- Check Exotel's logs/events for connection attempts

---

## 🧪 Step-by-Step Debugging

### Step 1: Verify Service is Running
```bash
curl https://rtaa-ingest.onrender.com/health
```
Should return: `{"status":"healthy",...}`

### Step 2: Check Render Logs
1. Go to Render Dashboard
2. Select `rtaa-ingest` service
3. Click "Logs" tab
4. Look for:
   - `✅ Ingestion server listening on port 10000`
   - `supportExotel: true`
   - Any `WebSocket upgrade request` messages

### Step 3: Test WebSocket Manually
Use `wscat` or browser console to test:
```bash
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest
```

### Step 4: Check Exotel Configuration
- Verify WebSocket URL in Exotel dashboard
- Check Exotel's connection logs
- Verify Exotel is actually attempting to connect

### Step 5: Review Enhanced Logs
After redeploy, check for:
- `[server] WebSocket upgrade request received` - Shows connection attempt
- `[server] ✅ Exotel WebSocket upgrade request accepted` - Connection accepted
- `[exotel] New Exotel WebSocket connection` - Handler initialized

---

## 📊 Expected Log Flow

### Normal Flow
```
1. [server] ✅ Ingestion server listening on port 10000
2. [server] supportExotel: true
3. [server] WebSocket upgrade request received { url: '/v1/ingest', ... }
4. [server] ✅ Exotel WebSocket upgrade request accepted
5. [exotel] New Exotel WebSocket connection
6. [exotel] Processing binary frames with default config
7. [exotel] Published binary audio frame { seq: 100, ... }
```

### If No Logs Appear
- Exotel isn't connecting to the WebSocket endpoint
- Check Exotel dashboard configuration
- Verify WebSocket URL is correct
- Check Exotel's connection logs

---

## 🔗 Related Documentation

- `EXOTEL_WEBSOCKET_URL.md` - WebSocket URL configuration
- `FIX_EXOTEL_CONNECTION.md` - Enabling Exotel support
- `WEBSOCKET_TESTING_GUIDE.md` - Testing WebSocket connections

---

**After enhanced logging is deployed, check Render logs for detailed connection information!**


## Problem
Exotel call started but **no logs appear** in Render. Service is running but WebSocket connection isn't being established.

---

## ✅ Quick Checks

### 1. Verify Exotel WebSocket URL Configuration

In Exotel dashboard, ensure:
- **WebSocket URL:** `wss://rtaa-ingest.onrender.com/v1/ingest`
- **Protocol:** `wss://` (secure WebSocket)
- **Path:** `/v1/ingest` (must match exactly)

### 2. Check Render Environment Variables

Go to Render Dashboard → Environment tab, verify:
- ✅ `SUPPORT_EXOTEL=true` is set
- ✅ `REDIS_URL` is configured
- ✅ `PUBSUB_ADAPTER=redis_streams`

### 3. Test WebSocket Endpoint Manually

```bash
# Test if WebSocket endpoint is accessible
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://rtaa-ingest.onrender.com/v1/ingest
```

**Expected:** HTTP 101 Switching Protocols (if working)

---

## 📋 What to Look For in Logs

After the enhanced logging is deployed, you should see:

### ✅ Successful Connection
```
[server] WebSocket upgrade request received { url: '/v1/ingest', ... }
[server] ✅ Exotel WebSocket upgrade request accepted
[exotel] New Exotel WebSocket connection
[exotel] Processing binary frames with default config
[exotel] Published binary audio frame { seq: 100, ... }
```

### ❌ Connection Rejected
```
[server] WebSocket upgrade request received { ... }
[server] ❌ Authentication failed: ...
```

### ⚠️ No Connection Attempt
- **No logs at all** = Exotel isn't connecting
- Check Exotel dashboard configuration
- Verify WebSocket URL is correct
- Check Exotel's connection logs (if available)

---

## 🔧 Common Issues

### Issue 1: Wrong WebSocket URL
**Symptom:** No connection logs at all

**Solution:**
- Verify URL in Exotel: `wss://rtaa-ingest.onrender.com/v1/ingest`
- Check for typos (http vs https, wrong path)
- Ensure no trailing slash

### Issue 2: SUPPORT_EXOTEL Not Set
**Symptom:** Connection rejected with 401

**Solution:**
- Set `SUPPORT_EXOTEL=true` in Render
- Redeploy service
- Check logs show `supportExotel: true`

### Issue 3: Firewall/Network Issue
**Symptom:** Connection timeout

**Solution:**
- Check if Exotel's IP is whitelisted (if required)
- Verify Render service is accessible
- Test health endpoint: `curl https://rtaa-ingest.onrender.com/health`

### Issue 4: Exotel Not Sending Connection
**Symptom:** No logs, service is healthy

**Solution:**
- Check Exotel dashboard for connection errors
- Verify Exotel's WebSocket configuration
- Check Exotel's logs/events for connection attempts

---

## 🧪 Step-by-Step Debugging

### Step 1: Verify Service is Running
```bash
curl https://rtaa-ingest.onrender.com/health
```
Should return: `{"status":"healthy",...}`

### Step 2: Check Render Logs
1. Go to Render Dashboard
2. Select `rtaa-ingest` service
3. Click "Logs" tab
4. Look for:
   - `✅ Ingestion server listening on port 10000`
   - `supportExotel: true`
   - Any `WebSocket upgrade request` messages

### Step 3: Test WebSocket Manually
Use `wscat` or browser console to test:
```bash
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest
```

### Step 4: Check Exotel Configuration
- Verify WebSocket URL in Exotel dashboard
- Check Exotel's connection logs
- Verify Exotel is actually attempting to connect

### Step 5: Review Enhanced Logs
After redeploy, check for:
- `[server] WebSocket upgrade request received` - Shows connection attempt
- `[server] ✅ Exotel WebSocket upgrade request accepted` - Connection accepted
- `[exotel] New Exotel WebSocket connection` - Handler initialized

---

## 📊 Expected Log Flow

### Normal Flow
```
1. [server] ✅ Ingestion server listening on port 10000
2. [server] supportExotel: true
3. [server] WebSocket upgrade request received { url: '/v1/ingest', ... }
4. [server] ✅ Exotel WebSocket upgrade request accepted
5. [exotel] New Exotel WebSocket connection
6. [exotel] Processing binary frames with default config
7. [exotel] Published binary audio frame { seq: 100, ... }
```

### If No Logs Appear
- Exotel isn't connecting to the WebSocket endpoint
- Check Exotel dashboard configuration
- Verify WebSocket URL is correct
- Check Exotel's connection logs

---

## 🔗 Related Documentation

- `EXOTEL_WEBSOCKET_URL.md` - WebSocket URL configuration
- `FIX_EXOTEL_CONNECTION.md` - Enabling Exotel support
- `WEBSOCKET_TESTING_GUIDE.md` - Testing WebSocket connections

---

**After enhanced logging is deployed, check Render logs for detailed connection information!**


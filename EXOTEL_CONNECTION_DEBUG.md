# Exotel Connection Debugging Guide

## Problem
- **ASR Worker** is receiving JSON errors (old messages from Redis)
- **Ingest Service** shows NO logs when calls are active
- **Frontend** shows empty transcripts

## Root Cause Analysis

### The Issue
Exotel is **NOT connecting** to the Ingest service. If Exotel were connecting, we would see:
- `[server] HTTP request received` (for WebSocket upgrade)
- `[server] WebSocket upgrade request received`
- `[exotel] New Exotel WebSocket connection`

Since we see **NONE** of these logs, Exotel is not attempting to connect.

### Why This Happens
1. **Exotel Stream URL Not Configured**: Exotel needs to be configured with the WebSocket stream URL
2. **Wrong URL**: Exotel might be pointing to a different service/URL
3. **Network/Firewall**: Connection might be blocked
4. **Exotel Webhook Configuration**: The webhook/stream URL might not be set in Exotel dashboard

## Required Exotel Configuration

### WebSocket Stream URL
Exotel needs to be configured to stream audio to:
```
wss://rtaa-ingest.onrender.com/v1/ingest
```

**OR** (if using HTTP instead of WSS):
```
ws://rtaa-ingest.onrender.com/v1/ingest
```

### How to Configure in Exotel
1. Log into Exotel Dashboard
2. Go to **Settings** → **Webhooks** or **Streaming**
3. Find **Media Stream URL** or **WebSocket Stream URL**
4. Set it to: `wss://rtaa-ingest.onrender.com/v1/ingest`
5. Save configuration

### Authentication
The Ingest service accepts Exotel connections with:
- **IP Whitelisting** (if configured)
- **Basic Auth** (if configured)
- **No Auth** (if `SUPPORT_EXOTEL=true` - currently enabled)

## Verification Steps

### 1. Check Ingest Service is Reachable
```bash
curl https://rtaa-ingest.onrender.com/health
```

Expected response:
```json
{"status":"ok","service":"ingest","pubsub":true,"timestamp":"..."}
```

### 2. Check WebSocket Endpoint
```bash
# Test WebSocket connection (requires wscat or similar)
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest
```

### 3. Check Exotel Dashboard
- Verify the **Stream URL** is set correctly
- Check if there are any connection errors in Exotel logs
- Verify the call is actually using the stream/webhook

### 4. Monitor Ingest Service Logs
After configuring Exotel, make a test call and look for:
```
[server] HTTP request received
[server] WebSocket upgrade request received
[exotel] New Exotel WebSocket connection
[exotel] Start event received
[exotel] 🔍 Raw media event received
```

## Current Status

### What's Working
- ✅ Ingest service is running and healthy
- ✅ ASR Worker is running and processing messages
- ✅ Frontend is running and consuming transcripts
- ✅ Redis pub/sub is connected

### What's NOT Working
- ❌ Exotel is not connecting to Ingest service
- ❌ No audio is being ingested (hence empty transcripts)
- ❌ Old messages in Redis contain JSON instead of audio (from previous misconfiguration)

## Next Steps

1. **Configure Exotel Stream URL**:
   - Set Exotel's media stream URL to: `wss://rtaa-ingest.onrender.com/v1/ingest`
   - Save and test with a new call

2. **Verify Connection**:
   - Make a test call
   - Check Ingest service logs for connection attempts
   - Should see `[server] HTTP request received` and `[exotel] New Exotel WebSocket connection`

3. **Monitor for Errors**:
   - Once connected, check for JSON errors in Ingest logs
   - The validation code will catch if Exotel sends JSON instead of audio
   - Fix any protocol mismatches

4. **Clear Old Messages** (Optional):
   - Old messages in Redis will continue to error
   - They won't affect new calls once Exotel is properly configured
   - Can be cleared manually if needed

## Expected Logs After Fix

When Exotel connects successfully, you should see:

```
[server] HTTP request received { method: 'GET', url: '/v1/ingest', upgrade: 'websocket', ... }
[server] WebSocket upgrade request received { ... }
[server] ✅ Exotel WebSocket upgrade request accepted
[exotel] New Exotel WebSocket connection
[exotel] Start event received { stream_sid: '...', call_sid: '...', ... }
[exotel] 🔍 Raw media event received { ... }
[exotel] ✅ First audio frame decoded successfully { ... }
```

If you see JSON errors instead:
```
[exotel] ❌ CRITICAL: Decoded audio buffer contains JSON text!
```

This means Exotel is sending JSON in the payload - we'll need to fix the Exotel handler to extract audio correctly.

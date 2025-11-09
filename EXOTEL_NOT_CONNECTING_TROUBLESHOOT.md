# Exotel Not Connecting - Troubleshooting Guide

## Current Situation
- ✅ URL is set in Exotel: `wss://rtaa-ingest.onrender.com/v1/ingest`
- ✅ Service is running and healthy
- ❌ **No WebSocket connection attempts in logs**

## Why This Happens

Even though the URL is set, Exotel might not be connecting because:

### 1. Stream Feature Not Enabled
Exotel may require you to **enable streaming** for each call or in your account settings.

**Check:**
- Exotel Dashboard → Settings → Features → Enable "Media Streaming" or "ExoStreamKit"
- When making a call, ensure streaming is enabled for that specific call
- Check if there's a per-call setting to enable streaming

### 2. Call Not Using Stream URL
The URL might be set, but individual calls might not be configured to use it.

**Check:**
- When initiating a call via API, ensure you're passing the stream URL
- Check if there's a call-level configuration that overrides the account-level setting
- Verify the call flow/IVR is configured to use streaming

### 3. Exotel API Configuration
If you're using Exotel's API to make calls, you need to pass the stream URL in the API request.

**Example API call:**
```json
{
  "from": "+1234567890",
  "to": "+0987654321",
  "stream_url": "wss://rtaa-ingest.onrender.com/v1/ingest"
}
```

### 4. Network/Firewall Issues
Exotel's servers might not be able to reach Render's servers.

**Check:**
- Test if Exotel can reach the service: `curl https://rtaa-ingest.onrender.com/health` (from Exotel's perspective)
- Check if there are any firewall rules blocking Exotel's IPs
- Verify Render allows WebSocket connections

### 5. Exotel Account Type/Plan
Some Exotel features might require a specific plan or account type.

**Check:**
- Verify your Exotel plan supports media streaming
- Contact Exotel support to confirm streaming is enabled for your account

## Diagnostic Steps

### Step 1: Verify WebSocket Endpoint Works
Test the WebSocket endpoint manually:

```bash
# Install wscat if needed
npm install -g wscat

# Test connection
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest
```

If this works, the service is fine - the issue is Exotel configuration.

### Step 2: Check Exotel Dashboard
1. **Go to Exotel Dashboard**
2. **Check Call Logs:**
   - Look for recent calls
   - Check if there are any connection errors
   - See if streaming is enabled for those calls

3. **Check Stream Configuration:**
   - Settings → Media Streaming or ExoStreamKit
   - Verify the URL is saved correctly
   - Check if there's an "Enable" toggle

### Step 3: Make a Test Call
1. **Initiate a test call** through Exotel
2. **Monitor Ingest Service Logs** in real-time
3. **Look for:**
   - `[server] 🔌 WebSocket upgrade attempt detected`
   - `[server] 🔌 WebSocket upgrade request received`
   - `[exotel] New Exotel WebSocket connection`

### Step 4: Check Exotel API/Webhook Configuration
If you're using Exotel's API:

1. **Verify API Request:**
   - Check if you're including `stream_url` in the request
   - Ensure the URL is correct in your code

2. **Check Webhook Configuration:**
   - Some Exotel setups use webhooks instead of direct streaming
   - Verify if you need to configure webhooks separately

## What to Look For in Logs

### If Exotel Connects Successfully:
```
[server] 🔌 WebSocket upgrade attempt detected in HTTP request
[server] 🔌 WebSocket upgrade request received
[server] ✅ Exotel WebSocket upgrade request accepted
[exotel] New Exotel WebSocket connection
[exotel] Start event received
```

### If Connection Fails:
- You might see connection errors in Exotel's dashboard
- Check Exotel's logs/error messages
- Look for timeout or connection refused errors

## Next Steps

1. **Contact Exotel Support:**
   - Ask them to verify streaming is enabled for your account
   - Request help configuring the stream URL
   - Ask if there are any account-level restrictions

2. **Check Exotel Documentation:**
   - Review Exotel's streaming/ExoStreamKit documentation
   - Look for setup guides or configuration examples
   - Check for any required headers or authentication

3. **Test with Exotel's Test Tools:**
   - Use Exotel's testing/sandbox environment if available
   - Test the connection in a controlled environment

4. **Verify Call Flow:**
   - Ensure your call flow/IVR is configured to use streaming
   - Check if streaming needs to be enabled per call type

## Alternative: Check Exotel's Actual Behavior

Exotel might be:
- Using a different protocol (not WebSocket)
- Sending data via webhooks instead of streaming
- Requiring additional configuration we're not aware of

**Action:** Check Exotel's documentation or contact support to understand:
- How Exotel actually sends media streams
- What protocol/format it uses
- What configuration is required

---

**Current Status:** Service is ready and waiting. The issue is likely in Exotel's configuration or account settings.


# Exotel WebSocket URL Configuration Verification

## ✅ Configuration Status

### Current Setup
- **Endpoint Path**: `/v1/ingest` ✅
- **Exotel Bridge**: ENABLED ✅
- **Service Status**: Healthy ✅
- **Port**: 5000 (local), production port varies

---

## 📋 Exotel Requirements (from [Exotel Documentation](https://support.exotel.com/support/solutions/articles/3000108630-working-with-the-stream-applet))

### 1. Endpoint Configuration

**Option A: Direct WebSocket URL (Recommended)**
```
wss://your-domain.com/v1/ingest
```

**Option B: Dynamic Endpoint (HTTPS that returns WSS URL)**
```
https://your-domain.com/get-stream-url
```
Must return:
```json
{
  "url": "wss://your-domain.com/v1/ingest"
}
```

### 2. Authentication Methods

**Method 1: IP Whitelisting (Recommended)**
- Contact Exotel: hello@exotel.com to get IP ranges
- No credentials needed in URL
- Most secure option

**Method 2: Basic Authentication**
- **In URL**: `wss://user:pass@your-domain.com/v1/ingest`
- **In Header**: `Authorization: Basic base64(user:pass)`
- Exotel sends credentials in headers (not in URL)

### 3. Sample Rate Support

Exotel supports query parameters:
- **8 kHz** (default): `wss://your-domain.com/v1/ingest?sample-rate=8000`
- **16 kHz**: `wss://your-domain.com/v1/ingest?sample-rate=16000`
- **24 kHz**: `wss://your-domain.com/v1/ingest?sample-rate=24000`

**Default**: 8 kHz if not specified

### 4. Media Format

- **Encoding**: raw/slin (16-bit, 8kHz, mono PCM little-endian)
- **Format**: Base64 encoded in JSON `media.payload` field
- **Chunk Size**: Minimum 3.2k (100ms), Maximum 100k

---

## 🔍 Our Service Configuration

### Endpoint Path
```
✅ /v1/ingest
```
**Matches Exotel requirement**

### Protocol Support
- ✅ WebSocket (ws://)
- ✅ Secure WebSocket (wss://) - if SSL certificates configured
- ✅ HTTP/HTTPS health check endpoint

### Authentication
- ✅ IP Whitelisting support (when `SUPPORT_EXOTEL=true`)
- ✅ Basic Auth support (via `detectExotelProtocol()`)
- ✅ No JWT required for Exotel connections

### Sample Rate Handling
- ✅ Accepts 8kHz (default)
- ✅ Handles sample rate from Exotel `start` event
- ✅ Forces 8kHz for telephony (corrects invalid rates)

### Media Format
- ✅ Accepts base64-encoded PCM16 audio
- ✅ Validates PCM16 format
- ✅ Publishes to Redis `audio_stream` topic

---

## 📝 Exotel Dashboard Configuration

### For Production Deployment

**In Exotel Dashboard → Stream Applet:**

1. **URL Configuration:**
   ```
   wss://your-production-domain.com/v1/ingest
   ```
   OR (if using dynamic endpoint):
   ```
   https://your-production-domain.com/get-stream-url
   ```

2. **Authentication:**
   - If using IP whitelisting: No credentials needed
   - If using Basic Auth: Configure in Exotel dashboard

3. **Custom Parameters (Optional):**
   ```
   wss://your-domain.com/v1/ingest?param1=value1&param2=value2
   ```
   - Maximum 3 custom parameters
   - Total length ≤ 256 characters

### For Local Testing

**Use ngrok or similar tunnel:**
```bash
# Start ngrok tunnel
ngrok http 5000

# Use the ngrok URL in Exotel:
wss://your-ngrok-id.ngrok.io/v1/ingest
```

---

## ✅ Verification Checklist

### Service Configuration
- [x] Endpoint path: `/v1/ingest`
- [x] Exotel Bridge: ENABLED
- [x] SUPPORT_EXOTEL: true (or IP whitelisted)
- [x] Service listening on correct port
- [x] Health endpoint responding

### Exotel Dashboard Configuration
- [ ] Stream Applet URL configured correctly
- [ ] Authentication method configured (IP whitelist or Basic Auth)
- [ ] Sample rate specified (optional, defaults to 8kHz)
- [ ] Custom parameters configured (if needed)

### Connection Test
- [ ] Make test call from Exotel
- [ ] Check Ingest Service logs for: `[exotel] New Exotel WebSocket connection`
- [ ] Verify `start` event received
- [ ] Verify `media` events received
- [ ] Check ASR Worker receives audio frames
- [ ] Verify transcripts generated

---

## 🔧 Troubleshooting

### Issue: No WebSocket Connection

**Check 1: Exotel URL Configuration**
```bash
# Verify your service is accessible
curl https://your-domain.com/health
```

**Check 2: Ingest Service Logs**
Look for:
```
[server] 🔌 WebSocket upgrade request received
[exotel] New Exotel WebSocket connection
```

**Check 3: Firewall/Network**
- Ensure port is open
- Check if Exotel IPs are whitelisted (if using IP whitelisting)

### Issue: Connection Established But No Audio

**Check 1: Exotel Protocol**
Verify Exotel is sending:
- `connected` event
- `start` event with `media_format`
- `media` events with base64 payload

**Check 2: Ingest Service Logs**
Look for:
```
[exotel] Start event received
[exotel] Published binary audio frame
```

**Check 3: Redis**
```bash
# Check if audio is in Redis
redis-cli XREAD COUNT 10 STREAMS audio_stream 0
```

### Issue: Transcripts Not Generated

**Check 1: ASR Worker Status**
```bash
curl http://localhost:3001/health
# Should show: activeBuffers > 0, activeConnections > 0
```

**Check 2: ASR Worker Logs**
Look for:
```
[ASRWorker] 📨 Message received from Redis
[ElevenLabsProvider] Session started
[ASRWorker] Published partial transcript
```

**Check 3: Transcript Consumer**
```bash
curl http://localhost:3000/api/transcripts/status
# Should show subscription for your interaction_id
```

---

## 📊 Current Status

### Service Health
```json
{
  "status": "healthy",
  "service": "ingest",
  "exotelBridge": "enabled",
  "exotelMetrics": {
    "framesIn": 300,
    "bytesIn": 96000,
    "activeBuffers": 0
  }
}
```

### Interactions with 0 Transcripts
Found **9 interactions** with 0 transcripts:
- `call_3b6d26390f0061e4`
- `call-1762531874253`
- `call-1762672029333`
- `call-1762532332133`
- `call-123456789099`
- ... (4 more)

**Possible Reasons:**
1. No audio received from Exotel
2. Audio received but not processed
3. ElevenLabs authentication failed
4. Call ended before audio processing

---

## 🚀 Next Steps

1. **Verify Exotel Dashboard Configuration:**
   - Check Stream Applet URL matches: `wss://your-domain.com/v1/ingest`
   - Verify authentication method (IP whitelist or Basic Auth)

2. **Make Test Call:**
   - Monitor Ingest Service logs
   - Monitor ASR Worker logs
   - Check transcript consumer status

3. **Check for Errors:**
   - Ingest Service: Connection errors, authentication failures
   - ASR Worker: ElevenLabs connection errors, audio processing errors
   - Transcript Consumer: Forwarding errors

---

## 📚 References

- [Exotel Stream Applet Documentation](https://support.exotel.com/support/solutions/articles/3000108630-working-with-the-stream-applet)
- Exotel Support: hello@exotel.com or WhatsApp: 08088919888





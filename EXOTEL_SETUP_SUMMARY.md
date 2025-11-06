# 🚀 Exotel Integration - Setup Summary

## What You Need to Tell Exotel

### 1. WebSocket Endpoint URL

**For Exotel Stream/Voicebot Applet:**
```
wss://your-domain.com:8443/v1/ingest
```

**With Sample Rate (Recommended):**
```
wss://your-domain.com:8443/v1/ingest?sample-rate=16000
```

**Options:**
- `?sample-rate=8000` - PSTN quality (default)
- `?sample-rate=16000` - Enhanced quality (recommended)
- `?sample-rate=24000` - HD quality

### 2. Authentication Method

**Option A: IP Whitelisting (Recommended)**
- Contact Exotel: `hello@exotel.com` to get their IP ranges
- Whitelist those IPs in your firewall/load balancer
- No credentials needed

**Option B: Basic Authentication**
- Configure in Exotel: `wss://API_KEY:API_TOKEN@your-domain.com:8443/v1/ingest`
- We'll need to implement Basic Auth handler (optional)

### 3. Protocol Support

**Tell Exotel:**
- ✅ We support **Unidirectional Streams** (Stream Applet)
- ✅ We support **Bidirectional Streams** (Voicebot Applet)
- ✅ We handle Exotel's JSON message protocol
- ✅ We decode base64 audio payloads
- ✅ We support configurable sample rates (8kHz, 16kHz, 24kHz)

---

## What We've Implemented

### ✅ Exotel Protocol Handler

- **File:** `services/ingest/src/exotel-handler.ts`
- **Features:**
  - Handles Exotel's JSON message protocol
  - Decodes base64 audio to binary
  - Maps Exotel format to our internal format
  - Publishes to Redis pub/sub

### ✅ Automatic Protocol Detection

- Detects Exotel vs our protocol automatically
- Exotel: No JWT or Basic Auth
- Our Protocol: JWT Bearer token

### ✅ Configuration

- Set `SUPPORT_EXOTEL=true` in `.env.local`
- Service automatically handles both protocols

---

## Exotel Applet Configuration

### Stream Applet (Unidirectional)

**In Exotel Dashboard:**
1. Go to App Bazaar → Stream Applet
2. Configure:
   - **Action:** Start
   - **URL:** `wss://your-domain.com:8443/v1/ingest?sample-rate=16000`
   - **Next Applet:** (your choice)

### Voicebot Applet (Bidirectional)

**In Exotel Dashboard:**
1. Go to App Bazaar → Voicebot Applet
2. Configure:
   - **URL:** `wss://your-domain.com:8443/v1/ingest?sample-rate=16000`
   - **Authentication:** IP Whitelist (or Basic Auth)
   - **Sample Rate:** 16kHz (recommended)
   - **Custom Parameters:** (optional, max 3)
   - **Record:** (optional)
   - **Next Applet:** (your choice)

---

## Message Flow

### Exotel → Our Service

```
1. Exotel connects: wss://your-domain.com:8443/v1/ingest
   (IP whitelisted, no auth header)

2. Exotel sends: {"event": "connected"}

3. Exotel sends: {
     "event": "start",
     "stream_sid": "stream-123",
     "start": {
       "call_sid": "call-456",
       "sample_rate": "16000",
       ...
     }
   }

4. Exotel sends: {
     "event": "media",
     "media": {
       "payload": "<base64_audio>",
       ...
     }
   }
   (repeated continuously)

5. Exotel sends: {"event": "stop", ...}
```

### Our Service Processing

```
1. Receives Exotel messages
2. Decodes base64 audio
3. Converts to internal format:
   - call_sid → interaction_id
   - account_sid → tenant_id
   - base64 → binary Buffer
4. Publishes to Redis pub/sub
5. ASR Worker processes audio
6. Generates transcripts
```

---

## Testing Checklist

- [ ] Set `SUPPORT_EXOTEL=true` in `.env.local`
- [ ] Restart ingestion service
- [ ] Configure Exotel Applet with WebSocket URL
- [ ] Make test call through Exotel
- [ ] Verify connection in logs: `tail -f /tmp/rtaa-ingest.log`
- [ ] Check audio frames received
- [ ] Verify ASR processing: `curl http://localhost:3001/metrics`

---

## Quick Start

### 1. Enable Exotel Support

```bash
# Already done - SUPPORT_EXOTEL=true is set
```

### 2. Configure Exotel

In Exotel Dashboard:
- Stream/Voicebot Applet URL: `wss://your-domain.com:8443/v1/ingest?sample-rate=16000`
- Authentication: IP Whitelist (contact Exotel for IPs)

### 3. Test

- Make a test call
- Check logs: `tail -f /tmp/rtaa-ingest.log | grep exotel`
- Verify audio processing

---

## Key Differences from Our Protocol

| Feature | Exotel | Our Protocol |
|--------|--------|--------------|
| Auth | IP Whitelist/Basic Auth | JWT Bearer |
| Messages | All JSON | JSON + Binary |
| Audio | Base64 in JSON | Binary frames |
| Sample Rate | 8kHz default | 24kHz default |

**Our service handles both automatically!**

---

## Documentation

- **Full Guide:** `EXOTEL_INTEGRATION_GUIDE.md`
- **Quick Reference:** This file
- **Exotel Docs:** https://support.exotel.com

---

## Support

**For Exotel:**
- Email: hello@exotel.com
- WhatsApp: 08088919888

**For RTAA:**
- Check logs: `/tmp/rtaa-ingest.log`
- Health check: `http://localhost:8443/health`


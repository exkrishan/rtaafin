# 📡 Exotel AgentStream Integration Guide

## Overview

This guide explains how to configure Exotel's AgentStream/Voicebot Applet to stream audio to the RTAA WebSocket Ingestion Service.

---

## Exotel Configuration

### Step 1: Enable Exotel Protocol Support

Update `.env.local`:
```bash
SUPPORT_EXOTEL=true
```

### Step 2: Configure WebSocket Endpoint in Exotel

In Exotel Dashboard → App Bazaar → Stream Applet (Unidirectional) or Voicebot Applet (Bidirectional):

**Option A: Direct WebSocket URL (Static)**
```
wss://your-domain.com:8443/v1/ingest
```

**Option B: Dynamic Endpoint (Recommended)**
```
https://your-domain.com/api/ingest/exotel-endpoint
```

This endpoint should return:
```json
{
  "url": "wss://your-domain.com:8443/v1/ingest"
}
```

### Step 3: Authentication

Exotel supports two authentication methods:

#### Method 1: IP Whitelisting (Recommended)

1. Contact Exotel: `hello@exotel.com` to get their IP ranges
2. Whitelist Exotel IPs in your firewall/load balancer
3. No credentials needed in URL

#### Method 2: Basic Authentication

Configure in Exotel:
```
wss://API_KEY:API_TOKEN@your-domain.com:8443/v1/ingest
```

Exotel will send:
```
Authorization: Basic base64(API_KEY:API_TOKEN)
```

---

## Protocol Differences

### Exotel Protocol vs Our Protocol

| Aspect | Exotel | Our Protocol |
|--------|--------|--------------|
| **Auth** | IP Whitelist or Basic Auth | JWT Bearer Token |
| **Messages** | JSON strings | JSON (start) + Binary (audio) |
| **Start Event** | JSON with stream_sid, call_sid | JSON with interaction_id |
| **Audio Format** | Base64 in JSON | Binary frames |
| **Sample Rate** | 8kHz default (configurable) | 24kHz default |

### Exotel Message Flow

```
1. Exotel connects to wss://your-domain.com:8443/v1/ingest
   (No JWT, uses IP whitelist or Basic Auth)

2. Exotel sends: {"event": "connected"}

3. Exotel sends: {
     "event": "start",
     "stream_sid": "...",
     "start": {
       "call_sid": "...",
       "sample_rate": "8000",
       ...
     }
   }

4. Exotel sends: {
     "event": "media",
     "media": {
       "payload": "<base64_audio>",
       "chunk": 1,
       "timestamp": "100"
     }
   }

5. Exotel sends: {"event": "stop", ...}
```

---

## Sample Rate Configuration

Exotel supports configurable sample rates via query parameter:

**8 kHz (Default - PSTN Quality):**
```
wss://your-domain.com:8443/v1/ingest?sample-rate=8000
```

**16 kHz (Enhanced Quality):**
```
wss://your-domain.com:8443/v1/ingest?sample-rate=16000
```

**24 kHz (HD Quality):**
```
wss://your-domain.com:8443/v1/ingest?sample-rate=24000
```

**Best Practice:** Use 16 kHz for most integrations (balanced quality vs bandwidth)

---

## Custom Parameters

Exotel allows up to 3 custom parameters in the URL:

```
wss://your-domain.com:8443/v1/ingest?param1=value1&param2=value2&param3=value3
```

These are passed in the `start` event's `custom_parameters` field.

**Limitations:**
- Maximum 3 custom parameters
- Total length ≤ 256 characters

---

## Audio Format

### Exotel Sends:
- **Encoding:** PCM16 (16-bit Linear PCM)
- **Sample Rate:** 8kHz (default), 16kHz, or 24kHz (configurable)
- **Channels:** Mono (1)
- **Byte Order:** Little-endian
- **Format:** Base64 encoded in JSON `media.payload` field

### Our Service Handles:
- Decodes base64 to binary
- Converts to our internal format
- Publishes to Redis pub/sub
- ASR Worker processes at configured sample rate

---

## Implementation Details

### Automatic Protocol Detection

The service automatically detects Exotel vs our protocol:

1. **No Authorization header** → Exotel (IP whitelisted)
2. **Basic Auth** → Exotel
3. **Bearer Token** → Our protocol (JWT)

### Message Handling

- **Exotel:** JSON messages handled by `ExotelHandler`
- **Our Protocol:** Binary frames handled by existing `handleConnection`

### Data Mapping

Exotel format → Our format:
```
stream_sid/call_sid → interaction_id
account_sid → tenant_id
media.payload (base64) → audio (Buffer)
media.timestamp → timestamp_ms
```

---

## Configuration Checklist

- [ ] Set `SUPPORT_EXOTEL=true` in `.env.local`
- [ ] Configure Exotel IP whitelisting (or Basic Auth)
- [ ] Set WebSocket URL in Exotel Applet
- [ ] Configure sample rate (8kHz/16kHz/24kHz)
- [ ] Test connection with Exotel
- [ ] Verify audio frames are received
- [ ] Check ASR processing

---

## Testing

### 1. Enable Exotel Support

```bash
# Update .env.local
echo "SUPPORT_EXOTEL=true" >> .env.local
```

### 2. Restart Ingestion Service

```bash
./stop-all-services.sh
./start-all-services.sh
```

### 3. Test with Exotel

Use Exotel's test flow or simulator:
- Configure Stream/Voicebot Applet
- Make a test call
- Check logs: `tail -f /tmp/rtaa-ingest.log`

### 4. Verify Audio Processing

```bash
# Check ASR metrics
curl http://localhost:3001/metrics | grep asr_audio_chunks

# Check logs
tail -f /tmp/rtaa-ingest.log | grep -E "exotel|Exotel"
```

---

## Exotel Applet Configuration

### Stream Applet (Unidirectional)

**Parameters:**
1. **Action:** Start
2. **URL:** `wss://your-domain.com:8443/v1/ingest?sample-rate=16000`
3. **Next Applet:** (your next applet)

### Voicebot Applet (Bidirectional)

**Parameters:**
1. **URL:** `wss://your-domain.com:8443/v1/ingest?sample-rate=16000`
2. **Authentication:** IP Whitelist (or Basic Auth)
3. **Sample Rate:** 16kHz (recommended)
4. **Custom Parameters:** (optional, max 3)
5. **Record:** (optional checkbox)
6. **Next Applet:** (your next applet)

---

## Message Examples

### Connected Event
```json
{
  "event": "connected"
}
```

### Start Event
```json
{
  "event": "start",
  "sequence_number": 1,
  "stream_sid": "stream-123",
  "start": {
    "stream_sid": "stream-123",
    "call_sid": "call-456",
    "account_sid": "account-789",
    "from": "+1234567890",
    "to": "+0987654321",
    "custom_parameters": {
      "param1": "value1"
    },
    "media_format": {
      "encoding": "pcm16",
      "sample_rate": "16000"
    }
  }
}
```

### Media Event
```json
{
  "event": "media",
  "sequence_number": 3,
  "stream_sid": "stream-123",
  "media": {
    "chunk": 2,
    "timestamp": "100",
    "payload": "base64_encoded_audio_data..."
  }
}
```

### Stop Event
```json
{
  "event": "stop",
  "sequence_number": 10,
  "stream_sid": "stream-123",
  "stop": {
    "call_sid": "call-456",
    "account_sid": "account-789",
    "reason": "callended"
  }
}
```

---

## Troubleshooting

### Connection Refused

**Check:**
1. Is `SUPPORT_EXOTEL=true` set?
2. Is service running on port 8443?
3. Are Exotel IPs whitelisted?

### No Audio Received

**Check:**
1. Are Exotel messages being received? (check logs)
2. Is start event received?
3. Are media events being processed?

### Sample Rate Mismatch

**Issue:** Exotel sends 8kHz, ASR expects 24kHz

**Solution:**
- Configure Exotel to use 16kHz or 24kHz
- Or update ASR worker to handle 8kHz

---

## Next Steps

1. **Enable Exotel Support:** Set `SUPPORT_EXOTEL=true`
2. **Configure Exotel:** Set WebSocket URL in Applet
3. **Test Connection:** Make test call through Exotel
4. **Verify Flow:** Check logs and metrics
5. **Production:** Deploy with proper IP whitelisting

---

## Support

For Exotel-specific issues:
- Contact Exotel: `hello@exotel.com`
- Exotel Documentation: https://support.exotel.com

For RTAA integration issues:
- Check logs: `tail -f /tmp/rtaa-ingest.log`
- Check metrics: `curl http://localhost:8443/health`


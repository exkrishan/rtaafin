# 📡 ExoStreamKit WebSocket Integration Guide

## Overview

This document provides the information needed to integrate ExoStreamKit with the RTAA WebSocket Ingestion Service.

---

## WebSocket Endpoint Details

### Connection URL

**Development/Staging:**
```
wss://your-domain.com:8443/v1/ingest
```

**Local Development:**
```
ws://localhost:8443/v1/ingest
```

**Production:**
```
wss://your-production-domain.com:8443/v1/ingest
```

### Connection Protocol

- **Protocol:** WebSocket (WS) or Secure WebSocket (WSS)
- **Path:** `/v1/ingest`
- **Authentication:** JWT Bearer Token (required)

---

## Authentication

### JWT Token Requirements

**Header Format:**
```
Authorization: Bearer <JWT_TOKEN>
```

**JWT Token Claims:**
```json
{
  "tenant_id": "string",        // Required: Tenant identifier
  "interaction_id": "string",    // Required: Unique interaction/call ID
  "iat": number,                 // Required: Issued at (Unix timestamp)
  "exp": number                  // Required: Expiration (Unix timestamp)
}
```

**Token Algorithm:** RS256 (RSA Signature with SHA-256)

**Public Key:** Provided separately (for token validation)

### How to Get JWT Token

1. **Generate JWT Token** using the private key:
   ```bash
   node scripts/generate-test-jwt.js
   ```

2. **Or integrate JWT generation** in your system:
   - Use RS256 algorithm
   - Sign with the private key
   - Include required claims (tenant_id, interaction_id)

---

## Message Protocol

### 1. Start Event (Text Message - Required First)

Send this JSON message immediately after WebSocket connection:

```json
{
  "event": "start",
  "interaction_id": "string",      // Required: Unique interaction ID
  "tenant_id": "string",           // Required: Tenant identifier
  "sample_rate": 24000,             // Required: Audio sample rate (Hz)
  "encoding": "pcm16"               // Required: Audio encoding format
}
```

**Response:**
```json
{
  "event": "started",
  "interaction_id": "string"
}
```

### 2. Audio Frames (Binary Messages)

After receiving `started` event, send binary audio frames:

- **Format:** PCM16 (16-bit PCM)
- **Sample Rate:** As specified in start event (typically 24000 Hz)
- **Channels:** Mono (1 channel)
- **Frame Size:** ~200ms chunks recommended
- **Byte Order:** Little-endian

**Example Frame Size:**
- 24kHz sample rate
- 200ms chunk = 4800 samples
- PCM16 = 2 bytes per sample
- **Frame size = 9,600 bytes**

### 3. Acknowledgment Messages

The server sends ACK messages every 10 frames:

```json
{
  "event": "ack",
  "seq": 10
}
```

**Use ACKs to:**
- Verify frames are received
- Monitor connection health
- Implement flow control

---

## Connection Flow

```
1. ExoStreamKit
   └─> Connect to wss://host:8443/v1/ingest
       └─> Include: Authorization: Bearer <JWT_TOKEN>

2. Server
   └─> Validates JWT token
       └─> Accepts connection

3. ExoStreamKit
   └─> Sends start event (JSON)
       {
         "event": "start",
         "interaction_id": "call-123",
         "tenant_id": "tenant-abc",
         "sample_rate": 24000,
         "encoding": "pcm16"
       }

4. Server
   └─> Responds with started event
       {
         "event": "started",
         "interaction_id": "call-123"
       }

5. ExoStreamKit
   └─> Sends binary audio frames (PCM16)
       └─> ~200ms chunks
       └─> Continuous stream

6. Server
   └─> Sends ACK every 10 frames
       {
         "event": "ack",
         "seq": 10
       }
```

---

## Audio Format Specifications

### Required Format

- **Encoding:** PCM16 (Linear PCM, 16-bit)
- **Sample Rate:** 24000 Hz (configurable, must match start event)
- **Channels:** Mono (1 channel)
- **Byte Order:** Little-endian
- **Frame Duration:** ~200ms recommended (configurable)

### Frame Size Calculation

```
Frame Size (bytes) = Sample Rate × Frame Duration (seconds) × 2 bytes/sample × Channels

Example (24kHz, 200ms, mono):
= 24000 × 0.2 × 2 × 1
= 9,600 bytes
```

### Supported Sample Rates

- 8000 Hz
- 16000 Hz
- 24000 Hz (recommended)
- 48000 Hz

---

## Error Handling

### Connection Errors

**401 Unauthorized:**
- Invalid or missing JWT token
- Token expired
- Invalid token signature

**400 Bad Request:**
- Invalid start event format
- Missing required fields
- Unsupported encoding

**Connection Closed:**
- Network issues
- Server shutdown
- Timeout

### Reconnection Strategy

1. **Exponential Backoff:** Wait 1s, 2s, 4s, 8s before retry
2. **Max Retries:** 5 attempts
3. **New JWT Token:** Generate fresh token for each reconnection
4. **Resume from Last ACK:** Track last acknowledged sequence number

---

## Configuration Parameters

### ExoStreamKit Configuration

```javascript
{
  "websocket": {
    "url": "wss://your-domain.com:8443/v1/ingest",
    "protocols": [],
    "headers": {
      "Authorization": "Bearer <JWT_TOKEN>"
    },
    "reconnect": true,
    "reconnectInterval": 2000,
    "maxReconnectAttempts": 5
  },
  "audio": {
    "sampleRate": 24000,
    "encoding": "pcm16",
    "channels": 1,
    "frameDuration": 200,  // milliseconds
    "byteOrder": "little-endian"
  }
}
```

---

## Testing

### Test Connection

```bash
# Generate JWT token
node scripts/generate-test-jwt.js

# Test WebSocket connection (using provided script)
cd services/ingest
JWT_TOKEN="<token>" ./scripts/simulate_exotel_client.sh
```

### Health Check

```bash
# Check if ingestion service is running
curl http://localhost:8443/health

# Response:
# {"status":"ok","service":"ingest"}
```

---

## Security Considerations

### TLS/SSL

- **Production:** Use WSS (wss://) for encrypted connections
- **Development:** WS (ws://) is acceptable for local testing
- **Certificate:** Ensure valid SSL certificate for production

### JWT Token Security

1. **Token Expiration:** Set reasonable expiration (e.g., 1 hour)
2. **Token Rotation:** Generate new tokens periodically
3. **Secure Storage:** Never expose private keys
4. **Token Validation:** Server validates token signature and expiration

### Network Security

- **Firewall Rules:** Allow connections from ExoStreamKit servers
- **Rate Limiting:** Implement rate limits to prevent abuse
- **IP Whitelisting:** Optional - whitelist ExoStreamKit IPs

---

## Monitoring & Observability

### Metrics Endpoint

```bash
# Check service metrics (if available)
curl http://localhost:8443/metrics
```

### Logs

Service logs include:
- Connection events
- Authentication status
- Frame processing
- Errors and warnings

### Key Metrics to Monitor

- **Connection Count:** Active WebSocket connections
- **Frames Received:** Total audio frames received
- **ACKs Sent:** Acknowledgment messages sent
- **Errors:** Connection and processing errors
- **Latency:** Frame processing latency

---

## Integration Checklist

- [ ] **WebSocket URL:** `wss://your-domain.com:8443/v1/ingest`
- [ ] **Authentication:** JWT token with required claims
- [ ] **Start Event:** Send JSON start event after connection
- [ ] **Audio Format:** PCM16, 24kHz, mono, little-endian
- [ ] **Frame Size:** ~200ms chunks (9,600 bytes at 24kHz)
- [ ] **ACK Handling:** Monitor ACK messages for flow control
- [ ] **Error Handling:** Implement reconnection logic
- [ ] **TLS/SSL:** Use WSS for production
- [ ] **Testing:** Test connection and audio streaming

---

## Example Integration Code

### JavaScript/TypeScript

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('wss://your-domain.com:8443/v1/ingest', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

ws.on('open', () => {
  // Send start event
  ws.send(JSON.stringify({
    event: 'start',
    interaction_id: 'call-123',
    tenant_id: 'tenant-abc',
    sample_rate: 24000,
    encoding: 'pcm16'
  }));
});

ws.on('message', (data: Buffer | string) => {
  if (typeof data === 'string') {
    const msg = JSON.parse(data);
    if (msg.event === 'started') {
      // Start sending audio frames
      startSendingAudio();
    } else if (msg.event === 'ack') {
      console.log(`ACK received: seq=${msg.seq}`);
    }
  }
});

function startSendingAudio() {
  // Send PCM16 audio frames
  const audioFrame = getAudioFrame(); // 9,600 bytes for 200ms @ 24kHz
  ws.send(audioFrame, { binary: true });
  
  // Continue sending frames
  setTimeout(startSendingAudio, 200);
}
```

---

## Support & Troubleshooting

### Common Issues

1. **401 Unauthorized:**
   - Check JWT token is valid and not expired
   - Verify token includes required claims
   - Ensure Authorization header format is correct

2. **Connection Refused:**
   - Verify service is running
   - Check firewall/network rules
   - Verify port 8443 is accessible

3. **Audio Not Processing:**
   - Verify audio format matches specification
   - Check frame size is correct
   - Ensure start event was sent first

### Contact

For integration support, provide:
- Connection logs
- Error messages
- JWT token generation method
- Audio format details

---

## Quick Reference

| Parameter | Value |
|-----------|-------|
| **WebSocket URL** | `wss://your-domain.com:8443/v1/ingest` |
| **Auth Header** | `Authorization: Bearer <JWT_TOKEN>` |
| **Audio Format** | PCM16, 24kHz, Mono |
| **Frame Size** | ~9,600 bytes (200ms @ 24kHz) |
| **ACK Interval** | Every 10 frames |
| **Protocol** | WebSocket (WS/WSS) |

---

## Next Steps

1. **Get JWT Public Key:** Request the public key for token validation
2. **Test Connection:** Use provided test scripts to verify connectivity
3. **Configure ExoStreamKit:** Update ExoStreamKit with WebSocket URL and format
4. **Test Audio Streaming:** Send test audio frames and verify ACKs
5. **Monitor:** Set up monitoring for connection health and errors

---

**Last Updated:** 2024-11-06


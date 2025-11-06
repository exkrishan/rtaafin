# 📡 ExoStreamKit Integration - Quick Reference

## What to Tell ExoStreamKit

### 1. WebSocket Endpoint

```
wss://your-domain.com:8443/v1/ingest
```

**For Local Testing:**
```
ws://localhost:8443/v1/ingest
```

---

### 2. Authentication

**Header Required:**
```
Authorization: Bearer <JWT_TOKEN>
```

**JWT Token Requirements:**
- Algorithm: RS256
- Claims:
  - `tenant_id` (string, required)
  - `interaction_id` (string, required)
  - `iat` (number, required - issued at timestamp)
  - `exp` (number, required - expiration timestamp)

**How to Get Token:**
- We'll provide JWT public key for validation
- ExoStreamKit generates tokens using private key
- Or we can provide a token generation service

---

### 3. Connection Flow

**Step 1: Connect**
```
Connect to: wss://your-domain.com:8443/v1/ingest
Header: Authorization: Bearer <JWT_TOKEN>
```

**Step 2: Send Start Event (JSON)**
```json
{
  "event": "start",
  "interaction_id": "unique-call-id",
  "tenant_id": "tenant-identifier",
  "sample_rate": 24000,
  "encoding": "pcm16"
}
```

**Step 3: Wait for Started Response**
```json
{
  "event": "started",
  "interaction_id": "unique-call-id"
}
```

**Step 4: Send Audio Frames (Binary)**
- Format: PCM16, 24kHz, Mono
- Frame size: ~9,600 bytes (200ms chunks)
- Send continuously

**Step 5: Receive ACKs**
```json
{
  "event": "ack",
  "seq": 10
}
```
- Received every 10 frames
- Use for flow control

---

### 4. Audio Format Specifications

| Parameter | Value |
|-----------|-------|
| **Encoding** | PCM16 (Linear PCM, 16-bit) |
| **Sample Rate** | 24000 Hz |
| **Channels** | Mono (1 channel) |
| **Byte Order** | Little-endian |
| **Frame Duration** | 200ms (recommended) |
| **Frame Size** | 9,600 bytes (at 24kHz, 200ms) |

**Calculation:**
```
Frame Size = Sample Rate × Duration × Bytes per Sample × Channels
           = 24000 × 0.2 × 2 × 1
           = 9,600 bytes
```

---

### 5. Message Types

#### Outgoing (ExoStreamKit → Server)

**Start Event (Text/JSON):**
```json
{
  "event": "start",
  "interaction_id": "call-123",
  "tenant_id": "tenant-abc",
  "sample_rate": 24000,
  "encoding": "pcm16"
}
```

**Audio Frames (Binary):**
- Raw PCM16 audio data
- ~9,600 bytes per frame (200ms @ 24kHz)
- Send continuously after start event

#### Incoming (Server → ExoStreamKit)

**Started Event (Text/JSON):**
```json
{
  "event": "started",
  "interaction_id": "call-123"
}
```

**ACK Event (Text/JSON):**
```json
{
  "event": "ack",
  "seq": 10
}
```
- Sent every 10 frames
- `seq` = sequence number of last frame in batch

---

### 6. Error Handling

**401 Unauthorized:**
- Invalid/missing JWT token
- Token expired
- Solution: Generate new token

**400 Bad Request:**
- Invalid start event format
- Missing required fields
- Solution: Check JSON format

**Connection Closed:**
- Network issues
- Server shutdown
- Solution: Implement reconnection with exponential backoff

---

### 7. Configuration Example

```json
{
  "websocket": {
    "url": "wss://your-domain.com:8443/v1/ingest",
    "headers": {
      "Authorization": "Bearer <JWT_TOKEN>"
    },
    "reconnect": true,
    "reconnectInterval": 2000
  },
  "audio": {
    "sampleRate": 24000,
    "encoding": "pcm16",
    "channels": 1,
    "frameDuration": 200
  }
}
```

---

## Checklist for ExoStreamKit Team

- [ ] WebSocket URL: `wss://your-domain.com:8443/v1/ingest`
- [ ] Authentication: JWT Bearer token in Authorization header
- [ ] Start Event: Send JSON start event after connection
- [ ] Audio Format: PCM16, 24kHz, Mono, Little-endian
- [ ] Frame Size: ~9,600 bytes (200ms @ 24kHz)
- [ ] ACK Handling: Monitor ACK messages
- [ ] Error Handling: Implement reconnection logic
- [ ] TLS: Use WSS (wss://) for production

---

## Support Information

**Health Check:**
```
GET http://your-domain.com:8443/health
Response: {"status":"ok","service":"ingest"}
```

**Test Script:**
```bash
# Generate JWT token
node scripts/generate-test-jwt.js

# Test connection
cd services/ingest
JWT_TOKEN="<token>" ./scripts/simulate_exotel_client.sh
```

---

## Quick Summary for ExoStreamKit

**Tell them:**

1. **Endpoint:** `wss://your-domain.com:8443/v1/ingest`
2. **Auth:** JWT Bearer token in `Authorization` header
3. **Protocol:** 
   - First: Send JSON start event
   - Then: Send binary PCM16 audio frames
4. **Format:** PCM16, 24kHz, Mono, ~9,600 bytes per frame
5. **ACKs:** Server sends ACK every 10 frames

**That's it!** Full details in `EXOSTREAMKIT_INTEGRATION.md`


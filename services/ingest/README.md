# WebSocket Audio Ingestion Service

A secure WebSocket service for ingesting PCM16 audio frames from ExoStreamKit/Exotel and publishing them to a pub/sub layer.

## Overview

This service provides a WebSocket endpoint (`wss://<host>:<PORT>/v1/ingest`) that:
- Accepts JSON metadata messages (start events)
- Receives binary PCM16 audio frames (~200ms chunks)
- Authenticates connections using JWT (RS256)
- Publishes audio frames to Redis pub/sub
- Sends ACK messages every N frames

## Quick Start

### Prerequisites

- Node.js 18+ or Docker
- Redis (for pub/sub)

### Local Development

1. **Install dependencies:**
   ```bash
   cd services/ingest
   npm install
   ```

2. **Set environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your JWT_PUBLIC_KEY and other settings
   ```

3. **Start Redis:**
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

4. **Run the service:**
   ```bash
   npm run dev
   ```

   The service will start on `ws://localhost:8443/v1/ingest`

### Docker Compose (Recommended)

1. **Set environment variables:**
   ```bash
   export JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
   ```

2. **Start services:**
   ```bash
   docker-compose up
   ```

3. **Run simulation script:**
   ```bash
   ./scripts/simulate_exotel_client.sh
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | WebSocket server port | `8443` |
| `JWT_PUBLIC_KEY` | RS256 public key (PEM format) | Required |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_CHANNEL` | Redis pub/sub channel | `audio:frames` |
| `BUFFER_DURATION_MS` | Audio buffer duration | `3000` |
| `ACK_INTERVAL` | ACK every N frames | `10` |
| `SSL_KEY_PATH` | Path to SSL private key (optional) | - |
| `SSL_CERT_PATH` | Path to SSL certificate (optional) | - |
| `EXO_BRIDGE_ENABLED` | Enable Exotel→Deepgram bridge feature | `false` |
| `EXO_MAX_BUFFER_MS` | Max buffer duration for fallback (100-10000ms) | `500` |
| `EXO_IDLE_CLOSE_S` | Idle timeout before closing connection (1-300s) | `10` |

## API

### WebSocket Endpoint

**URL:** `ws://<host>:<PORT>/v1/ingest`

**Authentication:** JWT token in `Authorization` header:
```
Authorization: Bearer <jwt-token>
```

### Messages

#### Start Event (Client → Server)

```json
{
  "event": "start",
  "interaction_id": "int-123",
  "tenant_id": "tenant-abc",
  "sample_rate": 24000,
  "encoding": "pcm16"
}
```

**Response:**
```json
{
  "event": "started",
  "interaction_id": "int-123"
}
```

#### Binary Audio Frame (Client → Server)

Raw PCM16 binary data (~200ms chunks, typically 9600 bytes at 24kHz).

**Response (every N frames):**
```json
{
  "event": "ack",
  "seq": 10
}
```

### Pub/Sub Message Format

Audio frames are published to Redis with the following structure:

```json
{
  "tenant_id": "tenant-abc",
  "interaction_id": "int-123",
  "seq": 42,
  "timestamp_ms": 1699123456789,
  "sample_rate": 24000,
  "encoding": "pcm16",
  "audio": "<base64-encoded-binary>"
}
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Test

The integration test simulates a WebSocket client:
```bash
npm test -- integration.test.ts
```

### Manual Testing

Use the simulation script:
```bash
./scripts/simulate_exotel_client.sh [audio_file.pcm]
```

Example with custom audio file:
```bash
WS_URL=ws://localhost:8443/v1/ingest \
JWT_TOKEN=your-jwt-token \
./scripts/simulate_exotel_client.sh /path/to/audio.pcm
```

## Architecture

```
┌─────────────┐
│   Client    │
│ (Exotel)    │
└──────┬──────┘
       │ WebSocket (WSS)
       │ JWT Auth
       ▼
┌─────────────┐
│   Ingest    │
│   Service   │
└──────┬──────┘
       │
       │ Publish
       ▼
┌─────────────┐
│    Redis    │
│   Pub/Sub   │
└─────────────┘
```

## Features

- ✅ JWT authentication (RS256)
- ✅ Binary PCM16 frame handling
- ✅ Circular buffer (configurable duration)
- ✅ ACK messages every N frames
- ✅ Async pub/sub publishing (non-blocking)
- ✅ Structured JSON logging
- ✅ Graceful shutdown
- ✅ Docker support

## Development

### Project Structure

```
services/ingest/
├── src/
│   ├── server.ts          # WebSocket server
│   ├── auth.ts            # JWT authentication
│   ├── pubsub-adapter.dev.ts  # Redis pub/sub
│   └── types.ts           # TypeScript types
├── tests/
│   ├── auth.test.ts       # Auth unit tests
│   ├── pubsub.test.ts     # Pub/sub unit tests
│   └── integration.test.ts # Integration tests
├── scripts/
│   └── simulate_exotel_client.sh  # Test client
├── Dockerfile
├── docker-compose.yml
└── README.md
```

### Building

```bash
npm run build
```

### Running Production Build

```bash
npm start
```

## Security Notes

- **POC Only**: This is a proof-of-concept implementation
- **JWT Validation**: Currently validates token but doesn't enforce tenant/interaction matching
- **SSL/TLS**: Optional for POC; required for production
- **Rate Limiting**: Not implemented (add for production)
- **Connection Limits**: Not implemented (add for production)

## Production Hardening (Future)

- [ ] Enforce tenant/interaction_id matching from JWT
- [ ] Add rate limiting per connection
- [ ] Add connection limits
- [ ] Add metrics/monitoring
- [ ] Add health check endpoint
- [ ] Implement connection pooling
- [ ] Add retry logic for pub/sub failures
- [ ] Add circuit breaker for Redis
- [ ] Implement graceful degradation

## Troubleshooting

### Connection Refused

- Check if Redis is running: `docker ps | grep redis`
- Verify port is not in use: `lsof -i :8443`

### Authentication Failed

- Verify `JWT_PUBLIC_KEY` is set correctly
- Check token format: `Bearer <token>`
- Ensure token is not expired

### No ACK Messages

- Check `ACK_INTERVAL` setting (default: 10)
- Verify frames are being sent as binary
- Check WebSocket connection is still open

## License

ISC


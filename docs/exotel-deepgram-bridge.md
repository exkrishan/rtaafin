# Exotel → Deepgram Live STT Bridge

## Overview

The Exotel → Deepgram bridge enables real-time speech-to-text transcription for Exotel Stream Applet audio streams. This feature connects Exotel's WebSocket audio streams to Deepgram's live transcription API, providing low-latency transcriptions for agent assist and call analytics.

## Architecture

```
┌─────────────────┐
│  Exotel Stream  │
│     Applet      │
└────────┬────────┘
         │ WebSocket (JSON events + base64 PCM16)
         │ Protocol: connected → start → media → stop
         ▼
┌─────────────────┐
│  Ingest Service │
│  (exotel-handler)│
└────────┬────────┘
         │ Decode base64 → Raw PCM16
         │ Publish to pub/sub
         ▼
┌─────────────────┐
│  Pub/Sub Layer  │
│ (Redis Streams) │
└────────┬────────┘
         │ Subscribe to audio frames
         ▼
┌─────────────────┐
│   ASR Worker    │
│ (Deepgram STT)  │
└────────┬────────┘
         │ Publish transcripts
         ▼
┌─────────────────┐
│  Frontend/API   │
│   (SSE/Events)  │
└─────────────────┘
```

## Feature Flag

The bridge is controlled by the `EXO_BRIDGE_ENABLED` environment variable:

- `EXO_BRIDGE_ENABLED=false` (default): Bridge disabled, normal operation
- `EXO_BRIDGE_ENABLED=true`: Bridge enabled, processes Exotel streams

## Configuration

### Ingest Service

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `EXO_BRIDGE_ENABLED` | Enable Exotel bridge | `false` | `true`/`false` |
| `EXO_MAX_BUFFER_MS` | Max buffer duration for fallback | `500` | 100-10000ms |
| `EXO_IDLE_CLOSE_S` | Idle timeout before closing | `10` | 1-300s |

### ASR Worker

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `EXO_BRIDGE_ENABLED` | Enable Exotel bridge | `false` | `true`/`false` |
| `EXO_IDLE_CLOSE_S` | Idle timeout for Deepgram connection | `10` | 1-300s |
| `EXO_EARLY_AUDIO_FILTER` | Filter early audio (ringing, etc.) | `true` | `true`/`false` |
| `DG_MODEL` | Deepgram model | `nova-3` | `nova-2`, `nova-3`, etc. |
| `DG_ENCODING` | Audio encoding | `linear16` | `linear16`, `mulaw`, etc. |
| `DG_SAMPLE_RATE` | Audio sample rate (Hz) | Auto-detected | 8000, 16000, 24000 |
| `DG_CHANNELS` | Audio channels | `1` | 1 (mono), 2 (stereo) |
| `DG_SMART_FORMAT` | Enable smart formatting | `true` | `true`/`false` |
| `DG_DIARIZE` | Enable speaker diarization | `false` | `true`/`false` |

## Exotel Protocol

The Exotel Stream Applet sends the following events via WebSocket:

### 1. `connected` Event

```json
{
  "event": "connected",
  "stream_sid": "stream_abc123",
  "call_sid": "call_xyz789"
}
```

### 2. `start` Event

```json
{
  "event": "start",
  "stream_sid": "stream_abc123",
  "call_sid": "call_xyz789"
}
```

### 3. `media` Event (Repeated)

```json
{
  "event": "media",
  "stream_sid": "stream_abc123",
  "call_sid": "call_xyz789",
  "media": {
    "payload": "<base64-encoded-PCM16-audio>"
  }
}
```

**Audio Format:**
- Encoding: PCM16 (16-bit signed integers, little-endian)
- Sample Rate: 8000 Hz (configurable)
- Channels: 1 (mono)
- Frame Duration: ~20ms per frame
- Frame Size: 320 bytes (8000 Hz × 0.02s × 2 bytes)

### 4. `stop` Event

```json
{
  "event": "stop",
  "stream_sid": "stream_abc123",
  "call_sid": "call_xyz789"
}
```

## Data Flow

1. **Exotel → Ingest**: Exotel sends JSON events + base64-encoded PCM16 audio
2. **Ingest Processing**:
   - Decodes base64 to raw PCM16 Buffer
   - Validates audio format (PCM16, 8kHz, mono)
   - Publishes to pub/sub as `AudioFrame` message
   - Falls back to bounded buffer if pub/sub fails
3. **Pub/Sub → ASR Worker**: ASR worker subscribes to audio frames
4. **ASR Processing**:
   - Buffers audio frames (200-500ms windows)
   - Sends to Deepgram via WebSocket (raw bytes, not base64)
   - Receives transcripts (partial + final)
   - Publishes transcripts to pub/sub
5. **Frontend**: Consumes transcripts via SSE or WebSocket

## Key Features

### 1. Bounded Buffer Fallback

If pub/sub publishing fails, the ingest service maintains a time-bounded in-memory buffer:

- **Max Duration**: `EXO_MAX_BUFFER_MS` (default: 500ms)
- **Behavior**: Drops oldest frames when buffer exceeds max duration
- **Recovery**: Attempts to republish buffered frames when pub/sub recovers

### 2. Idle Timeout

Both services implement idle timeout to prevent resource leaks:

- **Ingest**: Closes WebSocket connection after `EXO_IDLE_CLOSE_S` seconds of no audio
- **ASR Worker**: Closes Deepgram connection after `EXO_IDLE_CLOSE_S` seconds of no audio

### 3. Early-Audio Filtering

The ASR worker can filter early audio (ringing, silence) before speech is detected:

- **Enabled**: `EXO_EARLY_AUDIO_FILTER=true` (default)
- **Behavior**: Suppresses transcripts until:
  - Speech is detected (non-empty transcript, not "um"/"uh"), OR
  - 2 seconds have passed since first frame
- **Purpose**: Reduces false transcripts from call setup noise

### 4. Latency Metrics

The ASR worker tracks transcription latency:

- **First Interim Latency**: Time from first audio send to first interim transcript
- **Average Latency**: Rolling average of send-to-transcript time
- **Metrics Endpoint**: Available at `/metrics` (Prometheus format)

## Testing

### Local Testing

1. **Start services with bridge enabled:**

```bash
# Terminal 1: Ingest Service
cd services/ingest
EXO_BRIDGE_ENABLED=true npm run dev

# Terminal 2: ASR Worker
cd services/asr-worker
EXO_BRIDGE_ENABLED=true ASR_PROVIDER=deepgram DEEPGRAM_API_KEY=your-key npm run dev
```

2. **Run simulator:**

```bash
cd services/ingest
ts-node scripts/simulate-exotel-stream.ts --duration 10 --sample-rate 8000
```

3. **Monitor logs:**

- Ingest service: Look for `[exotel]` prefixed logs
- ASR worker: Look for `[DeepgramProvider]` and `[ASRWorker]` logs

### Health Checks

**Ingest Service:**
```bash
curl http://localhost:8443/health | jq '.exotelBridge'
```

**ASR Worker:**
```bash
curl http://localhost:3001/health | jq '.deepgram'
```

## Troubleshooting

### No Transcripts Received

1. **Check feature flags:**
   ```bash
   # Both services must have EXO_BRIDGE_ENABLED=true
   echo $EXO_BRIDGE_ENABLED
   ```

2. **Check Deepgram connection:**
   ```bash
   # Look for connection open logs
   grep "Connection opened" services/asr-worker/logs
   ```

3. **Check audio format:**
   - Verify sample rate matches (default: 8000 Hz)
   - Verify encoding is PCM16
   - Check for format validation errors in logs

### Empty Transcripts

1. **Check early-audio filter:**
   ```bash
   # Disable if needed
   EXO_EARLY_AUDIO_FILTER=false
   ```

2. **Check audio quality:**
   - Verify audio is not all zeros (silence)
   - Check sample rate matches actual audio
   - Verify PCM16 format is correct

### Connection Timeouts

1. **Check idle timeout:**
   ```bash
   # Increase if needed
   EXO_IDLE_CLOSE_S=30
   ```

2. **Check KeepAlive:**
   - Deepgram requires KeepAlive messages every 3 seconds
   - Check logs for KeepAlive success/failure

### Pub/Sub Failures

1. **Check Redis connection:**
   ```bash
   redis-cli ping
   ```

2. **Check bounded buffer:**
   - Look for `bufferDrops` in health endpoint
   - Increase `EXO_MAX_BUFFER_MS` if needed

## Metrics

### Ingest Service Metrics

Available at `/health` endpoint:

```json
{
  "exotelBridge": "enabled",
  "exotelMetrics": {
    "framesIn": 1500,
    "bytesIn": 480000,
    "bufferDrops": 0,
    "publishFailures": 0,
    "bufferDepth": 0,
    "activeBuffers": 1
  }
}
```

### ASR Worker Metrics

Available at `/metrics` endpoint (Prometheus format):

```
# Deepgram connection metrics
deepgram_connections_created_total 5
deepgram_connections_closed_total 2
deepgram_audio_chunks_sent_total 1500
deepgram_transcripts_received_total 1200
deepgram_average_latency_ms 250
deepgram_first_interim_latency_ms{quantile="p50"} 180
```

## Rollback Plan

If issues occur, disable the bridge:

1. **Set feature flag to false:**
   ```bash
   EXO_BRIDGE_ENABLED=false
   ```

2. **Restart services:**
   ```bash
   # Ingest service
   cd services/ingest && npm restart
   
   # ASR worker
   cd services/asr-worker && npm restart
   ```

3. **Verify:**
   - Check health endpoints show bridge as "disabled"
   - Verify normal operation resumes

## Production Checklist

- [ ] Feature flag set to `true` in production environment
- [ ] Deepgram API key configured and validated
- [ ] Redis pub/sub layer healthy and monitored
- [ ] Idle timeout configured appropriately (10-30s)
- [ ] Early-audio filter enabled (default: true)
- [ ] Metrics endpoint monitored for latency/errors
- [ ] Health checks configured in load balancer
- [ ] Rollback plan documented and tested
- [ ] WebSocket security (TLS, IP allowlist) configured
- [ ] Connection limits and rate limiting configured

## References

- [Exotel Stream Applet Documentation](https://developer.exotel.com/api/stream-applet)
- [Deepgram Live Transcription API](https://developers.deepgram.com/docs/live-transcription)
- [Ingest Service README](../services/ingest/README.md)
- [ASR Worker README](../services/asr-worker/README.md)
- [Acceptance Testing Guide](./exotel-bridge-acceptance-testing.md)
- [Security & Rollout Plan](./exotel-bridge-security-rollout.md)


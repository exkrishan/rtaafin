# ASR Worker Service

A streaming Automatic Speech Recognition (ASR) worker that consumes audio frames from pub/sub, processes them through pluggable ASR providers, and publishes transcript events.

## Overview

The ASR worker:
- Subscribes to `audio.{tenant_id}` or `audio_stream` topics
- Buffers incoming audio frames (configurable 200-500ms window)
- Processes audio through ASR provider (mock, Deepgram, or Whisper)
- Publishes transcript events to `transcript.{interaction_id}` topics
- Exposes Prometheus metrics at `/metrics`

## Quick Start

### Local Development

```bash
cd services/asr-worker
npm install
npm run dev
```

### Docker Compose

```bash
docker-compose -f docker-compose.asr.yml up
```

### Demo Script

```bash
PUBSUB_ADAPTER=in_memory ts-node scripts/asr_worker_demo.ts
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port (for metrics/health) | `3001` |
| `ASR_PROVIDER` | ASR provider: `mock`, `deepgram`, `whisper` | `mock` |
| `DEEPGRAM_API_KEY` | Deepgram API key (required for deepgram) | - |
| `BUFFER_WINDOW_MS` | Audio buffer window (200-500ms) | `300` |
| `PUBSUB_ADAPTER` | Pub/sub adapter: `redis_streams`, `kafka`, `in_memory` | `redis_streams` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_CONSUMER_GROUP` | Redis consumer group | `asr-worker` |
| `REDIS_CONSUMER_NAME` | Redis consumer name | `asr-worker-1` |
| `EXO_BRIDGE_ENABLED` | Enable Exotel→Deepgram bridge feature | `false` |
| `EXO_IDLE_CLOSE_S` | Idle timeout before closing Deepgram connection (1-300s) | `10` |
| `DG_MODEL` | Deepgram model (e.g., `nova-3`, `nova-2`) | `nova-3` |
| `DG_ENCODING` | Audio encoding (`linear16`, `mulaw`, etc.) | `linear16` |
| `DG_SAMPLE_RATE` | Audio sample rate (Hz) | Auto-detected |
| `DG_CHANNELS` | Audio channels (1=mono, 2=stereo) | `1` |
| `DG_SMART_FORMAT` | Enable smart formatting | `true` |
| `DG_DIARIZE` | Enable speaker diarization | `false` |
| `EXO_EARLY_AUDIO_FILTER` | Filter early audio (ringing, etc.) | `true` |

## ASR Providers

### Mock Provider (Default)

Generates deterministic fake transcripts for testing.

```bash
export ASR_PROVIDER=mock
```

**Features:**
- ✅ No external dependencies
- ✅ Fast and deterministic
- ✅ Perfect for testing

### Deepgram Provider

Uses Deepgram streaming SDK for real-time speech recognition.

```bash
export ASR_PROVIDER=deepgram
export DEEPGRAM_API_KEY=your-api-key
```

**Features:**
- ✅ Real-time streaming recognition
- ✅ High accuracy
- ✅ Multiple language support
- ⚠️ Requires API key

### Whisper Local Provider (Optional)

Uses whisper.cpp for local speech recognition.

```bash
export ASR_PROVIDER=whisper
export WHISPER_PATH=/path/to/whisper
export WHISPER_MODEL_PATH=/path/to/model.bin
```

**Features:**
- ✅ No API costs
- ✅ Privacy (local processing)
- ⚠️ Requires model files
- ⚠️ Higher latency

## Architecture

```
┌─────────────┐
│   Ingest    │
│   Service   │
└──────┬──────┘
       │ Publish audio frames
       ▼
┌─────────────┐
│   Pub/Sub   │
│  (Redis/Kafka)│
└──────┬──────┘
       │ Subscribe
       ▼
┌─────────────┐
│ ASR Worker  │
│  (Buffer +  │
│   Process)  │
└──────┬──────┘
       │ Publish transcripts
       ▼
┌─────────────┐
│   Pub/Sub   │
│  (Redis/Kafka)│
└──────┬──────┘
       │ Subscribe
       ▼
┌─────────────┐
│  UI/Archive │
│   Services  │
└─────────────┘
```

## Message Flow

### Audio Frame (Input)

```json
{
  "tenant_id": "tenant-123",
  "interaction_id": "int-456",
  "seq": 1,
  "timestamp_ms": 1699123456789,
  "sample_rate": 24000,
  "encoding": "pcm16",
  "audio": "<base64-encoded-buffer>"
}
```

### Transcript Event (Output)

```json
{
  "interaction_id": "int-456",
  "tenant_id": "tenant-123",
  "seq": 1,
  "type": "partial",
  "text": "Hello, I need help",
  "confidence": 0.95,
  "timestamp_ms": 1699123457000
}
```

## Metrics

Prometheus metrics are exposed at `http://localhost:3001/metrics`:

- `asr_audio_chunks_processed_total` - Counter: Total audio chunks processed
- `asr_first_partial_latency_ms` - Gauge: Latency to first partial transcript
- `asr_errors_total` - Counter: Total ASR errors
- `asr_last_error` - Gauge: Last error message

### Example Metrics Output

```
# HELP asr_audio_chunks_processed_total Total number of audio chunks processed
# TYPE asr_audio_chunks_processed_total counter
asr_audio_chunks_processed_total 42

# HELP asr_first_partial_latency_ms Latency to first partial transcript in milliseconds
# TYPE asr_first_partial_latency_ms gauge
asr_first_partial_latency_ms 250

# HELP asr_errors_total Total number of ASR errors
# TYPE asr_errors_total counter
asr_errors_total 0
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Test

```bash
npm test -- integration.test.ts
```

### Manual Testing

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Start ASR worker
PUBSUB_ADAPTER=redis_streams ASR_PROVIDER=mock npm run dev

# In another terminal, publish audio frames
# (Use ingest service or pubsub_demo script)
```

## Buffer Configuration

The worker buffers audio frames before processing:

- **Default**: 300ms window
- **Range**: 200-500ms (configurable via `BUFFER_WINDOW_MS`)
- **Behavior**: Processes buffer when window expires or on final transcript

**Trade-offs:**
- Smaller window: Lower latency, more API calls
- Larger window: Higher latency, fewer API calls, better accuracy

## Health Check

Health endpoint: `http://localhost:3001/health`

```json
{
  "status": "ok",
  "service": "asr-worker"
}
```

## Troubleshooting

### No Transcripts Appearing

1. Check worker is subscribed to correct topic:
   ```bash
   # Check logs for subscription message
   ```

2. Verify audio frames are being published:
   ```bash
   # Use Redis CLI to check stream
   redis-cli XRANGE audio_stream - +
   ```

3. Check ASR provider is working:
   ```bash
   # Test with mock provider first
   export ASR_PROVIDER=mock
   ```

### High Latency

1. Reduce buffer window:
   ```bash
   export BUFFER_WINDOW_MS=200
   ```

2. Check ASR provider latency (Deepgram vs local)

3. Monitor metrics:
   ```bash
   curl http://localhost:3001/metrics | grep latency
   ```

### Errors

1. Check error metrics:
   ```bash
   curl http://localhost:3001/metrics | grep errors
   ```

2. Check worker logs for detailed error messages

3. Verify ASR provider configuration (API keys, etc.)

## Development

### Project Structure

```
services/asr-worker/
├── src/
│   ├── index.ts              # Main worker
│   ├── types.ts              # TypeScript types
│   ├── metrics.ts            # Metrics collector
│   └── providers/
│       ├── index.ts           # Provider factory
│       ├── mockProvider.ts    # Mock provider
│       ├── deepgramProvider.ts # Deepgram provider
│       └── whisperLocalProvider.ts # Whisper provider
├── tests/
│   ├── mockProvider.test.ts  # Unit tests
│   ├── integration.test.ts    # Integration tests
│   └── metrics.test.ts       # Metrics tests
├── Dockerfile
├── docker-compose.asr.yml
└── README.md
```

### Adding a New Provider

1. Implement `AsrProvider` interface:
   ```typescript
   class MyProvider implements AsrProvider {
     async sendAudioChunk(audio: Buffer, opts: {...}): Promise<Transcript> {
       // Your implementation
     }
     async close(): Promise<void> {
       // Cleanup
     }
   }
   ```

2. Add to factory in `src/providers/index.ts`

3. Add tests in `tests/`

## Production Considerations

- **Scaling**: Run multiple worker instances with same consumer group
- **Monitoring**: Use Prometheus metrics for alerting
- **Error Handling**: Implement retry logic and dead letter queues
- **Resource Limits**: Set memory/CPU limits in Docker/K8s
- **Logging**: Use structured logging (JSON) for production

## License

ISC


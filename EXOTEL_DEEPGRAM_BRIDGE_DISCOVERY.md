# Exotel → Deepgram Live STT - Discovery Notes

**Date:** 2025-01-09  
**Branch:** `feat/exotel-deepgram-bridge`  
**Purpose:** Document existing architecture and patterns before implementing Exotel→Deepgram bridge

---

## 1. Environment & Configuration Loading

### ingest Service (`services/ingest/`)

**Config Loading:**
- Location: `services/ingest/src/server.ts` (lines 24-28)
- Pattern: Uses `dotenv` to load from `../../../.env.local` (project root)
- Validation: `services/ingest/src/config-validator.ts` - validates PORT, BUFFER_DURATION_MS, ACK_INTERVAL, PUBSUB_ADAPTER, REDIS_URL, JWT_PUBLIC_KEY, SSL certs

**Existing Env Vars:**
- `PORT` (default: 5000)
- `BUFFER_DURATION_MS` (default: 3000)
- `ACK_INTERVAL` (default: 10)
- `PUBSUB_ADAPTER` (default: redis_streams, options: redis_streams|kafka|in_memory)
- `REDIS_URL` (required if PUBSUB_ADAPTER=redis_streams)
- `JWT_PUBLIC_KEY` (required unless SUPPORT_EXOTEL=true)
- `SSL_KEY_PATH`, `SSL_CERT_PATH` (optional, for WSS)
- `SUPPORT_EXOTEL` (default: false, enables Exotel protocol detection)

### asr-worker Service (`services/asr-worker/`)

**Config Loading:**
- Location: `services/asr-worker/src/index.ts` (line 16)
- Pattern: Uses `dotenv` to load from `../../../.env.local` (project root)
- No separate validator - validates in constructor (fails fast if DEEPGRAM_API_KEY missing)

**Existing Env Vars:**
- `PORT` (default: 3001)
- `ASR_PROVIDER` (default: mock, options: mock|deepgram|whisper)
- `DEEPGRAM_API_KEY` (required if ASR_PROVIDER=deepgram)
- `DEEPGRAM_MODEL` (default: nova-2, used in deepgramProvider.ts line 203)
- `DEEPGRAM_LANGUAGE` (default: en-US)
- `DEEPGRAM_SMART_FORMAT` (default: true, checks !== 'false')
- `DEEPGRAM_INTERIM_RESULTS` (default: true, checks !== 'false')
- `DEEPGRAM_KEEPALIVE_INTERVAL_MS` (default: 3000)
- `DEEPGRAM_KEEPALIVE_ENABLED` (default: true)
- `DEEPGRAM_MAX_RECONNECT_ATTEMPTS` (default: 3)
- `INITIAL_CHUNK_DURATION_MS` (default: 200)
- `CONTINUOUS_CHUNK_DURATION_MS` (default: 100)
- `MAX_CHUNK_DURATION_MS` (default: 250)
- `MIN_AUDIO_DURATION_MS` (default: 200)
- `ASR_CHUNK_MIN_MS` (default: 100)
- `BUFFER_WINDOW_MS` (default: 1000)
- `STALE_BUFFER_TIMEOUT_MS` (default: 5000)
- `PUBSUB_ADAPTER` (default: redis_streams)
- `REDIS_URL` (required if PUBSUB_ADAPTER=redis_streams)

---

## 2. WebSocket Server/Client Utilities

### ingest Service

**WS Server:**
- Library: `ws` (WebSocketServer, WebSocket)
- Location: `services/ingest/src/server.ts`
- Endpoint: `/v1/ingest` (WSS if SSL configured)
- Exotel Detection: `detectExotelProtocol()` method (lines 369-391)
  - Checks Authorization header: Basic Auth = Exotel, Bearer = JWT
  - No auth header = might be IP whitelisted Exotel (if SUPPORT_EXOTEL=true)
- Exotel Handler: `services/ingest/src/exotel-handler.ts`
  - Handles JSON protocol: connected, start, media, stop, dtmf, mark
  - Decodes base64 audio payloads
  - Publishes AudioFrame to pub/sub

### asr-worker Service

**No WS Server** - Only subscribes to pub/sub topics

**Deepgram Client:**
- Library: `@deepgram/sdk` (createClient, LiveTranscriptionEvents)
- Location: `services/asr-worker/src/providers/deepgramProvider.ts`
- Connection: Uses SDK's `client.listen.live()` method
- WebSocket URL: Constructed internally by SDK (cannot directly inspect)
- Connection State: Managed per interactionId with reconnection logic

---

## 3. Audio Utilities & STT Code

### Audio Format

**Exotel Format:**
- Encoding: PCM16 (16-bit signed integers, little-endian)
- Sample Rate: 8000 Hz
- Channels: 1 (mono)
- Delivery: Base64-encoded in JSON `media.payload` field
- Validation: `services/ingest/src/exotel-handler.ts` (lines 239-296)
  - Validates PCM16 format (samples in range [-32768, 32767])
  - Validates sample rate calculation
  - Logs warnings for format mismatches

**Deepgram Format:**
- Encoding: linear16 (same as PCM16)
- Sample Rate: 8000 Hz (configured in connection config)
- Channels: 1 (mono)
- Delivery: Raw bytes (Buffer) sent via `connection.send()`

### STT Code

**Deepgram Provider:**
- Location: `services/asr-worker/src/providers/deepgramProvider.ts`
- Features:
  - Live transcription with interim/final results
  - Connection pooling (reuses connections per interactionId)
  - KeepAlive mechanism (JSON text frames every 3s)
  - Reconnection logic (max 3 attempts)
  - Audio queue when socket not ready
  - Metrics tracking

**Transcript Publishing:**
- Topic: `transcript.{interactionId}` (via `transcriptTopic()` helper)
- Format: `TranscriptMessage` interface (interaction_id, tenant_id, seq, type, text, confidence, timestamp_ms)

---

## 4. Feature Flags

**Current Pattern:**
- Boolean env vars: `SUPPORT_EXOTEL` (checks `=== 'true'`)
- No centralized flag system
- Flags checked at service startup/initialization

**Pattern to Follow:**
- Use boolean env vars with `=== 'true'` check
- Default to `false` for new features
- Log flag status on startup

---

## 5. Logging & Metrics

### Logging

**Current System:**
- Uses `console.log`, `console.error`, `console.warn`, `console.info`, `console.debug`
- No structured logging library (Winston/Pino)
- Logs include structured JSON for key events
- Rate-limited logging for high-frequency events (e.g., every 10th frame)

**Pattern:**
- Prefix logs with service name: `[exotel]`, `[DeepgramProvider]`, `[ASRWorker]`
- Use emoji indicators: ✅ success, ❌ error, ⚠️ warning, 📤 send, 📥 receive
- Never log API keys or full transcripts at info level

### Metrics

**Current System:**
- Location: `services/asr-worker/src/metrics.ts`
- Format: Prometheus text format
- Exposed: HTTP endpoint `/metrics` (port 3001)
- Collector: `MetricsCollector` class with counters, gauges, histograms

**Existing Metrics:**
- `asr_audio_chunks_processed_total` (counter)
- `asr_transcripts_generated_total` (counter)
- `asr_errors_total` (counter)
- `asr_buffer_depth_bytes` (gauge)
- `asr_processing_latency_ms` (histogram)

**Pattern to Follow:**
- Use Prometheus format
- Add counters for new events (exotel.frames_in, deepgram.frames_out)
- Add gauges for buffer depth
- Add histograms for latency (first_interim_ms, final_ms)

---

## 6. Message Bus (Pub/Sub)

### Current System

**Abstraction:**
- Location: `lib/pubsub/`
- Interface: `PubSubAdapter` with `publish()`, `subscribe()`, `ack()`, `close()`
- Factory: `createPubSubAdapterFromEnv()` - reads PUBSUB_ADAPTER env var

**Adapters:**
1. **Redis Streams** (default, recommended)
   - Uses `ioredis` (optional dependency)
   - Consumer groups with ACK semantics
   - Topic format: `audio.{tenant_id}` or `audio_stream`
   - Stream trimming: MAXLEN ~ 1000

2. **Kafka**
   - Uses `kafkajs` (optional dependency)
   - Consumer groups
   - Topic format: same as Redis

3. **In-Memory**
   - No external dependencies
   - Synchronous delivery
   - Perfect for unit tests
   - Messages lost on restart

### Topic Naming

**Helpers:** `lib/pubsub/topics.ts`
- `audioTopic({ tenantId?, useStreams? })` → `audio.{tenantId}` or `audio_stream`
- `transcriptTopic(interactionId)` → `transcript.{interactionId}`
- `intentTopic(interactionId)` → `intent.{interactionId}`
- `callEndTopic()` → `call_end`

### Current Usage

**ingest Service:**
- Publishes: `AudioFrame` via `pubsub.publish(frame)` (uses audioTopic internally)
- Publishes: Call end events via `pubsub.publishToTopic(callEndTopic(), message)`

**asr-worker Service:**
- Subscribes: `audioTopic({ useStreams: true })` → `audio_stream`
- Subscribes: `callEndTopic()` → `call_end`
- Publishes: Transcripts to `transcriptTopic(interactionId)`

---

## 7. Health & Readiness Endpoints

### ingest Service

**Endpoint:** `GET /health`
- Location: `services/ingest/src/server.ts` (lines 160-200)
- Response: `{ status: 'healthy'|'degraded'|'unhealthy', pubsub: boolean, timestamp: number }`
- Checks: Pub/sub adapter exists and is healthy

### asr-worker Service

**Endpoint:** `GET /health`
- Location: `services/asr-worker/src/index.ts` (lines 97-120)
- Response: `{ status: 'healthy'|'degraded'|'unhealthy', provider: string, activeConnections: number, ... }`
- Checks: ASR provider exists, active Deepgram connections

**Metrics Endpoint:** `GET /metrics`
- Location: `services/asr-worker/src/index.ts` (lines 94-96)
- Response: Prometheus text format
- Content: All metrics from MetricsCollector

---

## 8. Key Implementation Notes

### Exotel Handler Current Behavior

1. **Protocol Handling:**
   - Receives JSON messages: `connected`, `start`, `media`, `stop`, `dtmf`, `mark`
   - `start` event: Extracts `stream_sid`, `call_sid`, `account_sid`, `media_format`, `custom_parameters`
   - `media` event: Decodes base64 payload → Buffer, validates PCM16 format
   - `stop` event: Publishes call end message, cleans up state

2. **Audio Publishing:**
   - Creates `AudioFrame` object with: tenant_id, interaction_id, seq, timestamp_ms, sample_rate, encoding, audio (Buffer)
   - Calls `this.pubsub.publish(frame)` - uses internal topic routing
   - No bounded buffering currently - fails if pub/sub is down

3. **State Management:**
   - Per-connection state stored in `Map<string, ExotelConnectionState>`
   - Key: `stream_sid`
   - State includes: streamSid, callSid, accountSid, sampleRate, encoding, seq, lastChunk, started

### Deepgram Provider Current Behavior

1. **Connection Management:**
   - One connection per `interactionId` (reused if exists and ready)
   - Connection pooling with locks to prevent race conditions
   - Reconnection logic (max 3 attempts) on errors

2. **Audio Streaming:**
   - Buffers audio chunks until minimum duration (100ms for continuous, 200ms for initial)
   - Sends raw bytes via `connection.send(audioBuffer)`
   - Queues audio if socket not ready (pendingAudioQueue)

3. **Transcript Handling:**
   - Receives interim and final transcripts from Deepgram
   - Publishes to `transcript.{interactionId}` topic
   - Tracks latency (first interim, final)

4. **KeepAlive:**
   - Sends JSON text frame `{"type": "KeepAlive"}` every 3s
   - Required to prevent Deepgram timeout (1011 error)

---

## 9. Gaps to Address

1. **Feature Flag System:**
   - Need to add `EXO_BRIDGE_ENABLED` flag check in both services
   - Should disable Exotel processing if flag is false

2. **Bounded Buffering:**
   - Currently no fallback if pub/sub fails
   - Need in-memory ring buffer per callId (max EXO_MAX_BUFFER_MS)

3. **Idle Timeout:**
   - No automatic Deepgram connection closure on idle
   - Need to track last frame time and close after EXO_IDLE_CLOSE_S

4. **Early-Audio Filtering:**
   - No filtering of ringing/early audio before bridge
   - Need simple VAD or timestamp-based filtering

5. **Metrics:**
   - Missing Exotel-specific metrics (frames_in, bytes_in)
   - Missing Deepgram-specific metrics (frames_out, latency breakdown)

6. **Deepgram Config:**
   - Currently uses `DEEPGRAM_MODEL` (default nova-2)
   - Need to support `DG_MODEL` (default nova-3) for new bridge
   - Need to add `DG_DIARIZE` support

---

## 10. Security Considerations

### Current Auth Pattern

**ingest Service:**
- JWT authentication for standard clients (Bearer token)
- Exotel: IP whitelisting or Basic Auth (no JWT required)
- Detection: `detectExotelProtocol()` checks Authorization header

### TLS/WSS

- SSL certificates: `SSL_KEY_PATH`, `SSL_CERT_PATH` (optional)
- Render handles HTTPS termination in production
- Local dev: HTTP/WS (not recommended for production)

### IP Allowlisting

- Not currently implemented in code
- Should be handled at infrastructure level (load balancer/firewall)
- Document requirement for Exotel IP ranges

---

## 11. Testing & Development

### Current Test Files

- `services/ingest/tests/` - Unit tests for pub/sub, auth
- `services/asr-worker/tests/` - Integration tests for Deepgram, metrics
- `scripts/test-websocket-asr-single-process.ts` - Single-process test harness

### Simulator Needs

- Need script to simulate Exotel Stream protocol
- Should send: connected → start → media (base64) → stop
- Should use 8kHz mono PCM16 audio file
- Should connect to `/v1/ingest` endpoint

---

## 12. Rollback Strategy

### Feature Flag Rollback

- Set `EXO_BRIDGE_ENABLED=false` in both services
- All new code paths gated by flag check
- Existing functionality unaffected when flag is false

### Code Rollback

- All changes isolated to feature flag branches
- Can revert branch cleanly
- No breaking changes to existing APIs

---

## Summary

The existing architecture is well-suited for the Exotel→Deepgram bridge:

✅ **Exotel handler already exists** and correctly handles protocol  
✅ **Deepgram provider already exists** and has live STT working  
✅ **Pub/sub abstraction** supports Redis/Kafka/in-memory  
✅ **Audio format validation** already in place  
✅ **Health endpoints** exist for monitoring  

**Gaps to fill:**
- Feature flag system for gradual rollout
- Bounded buffering for resilience
- Idle timeout for resource cleanup
- Early-audio filtering for quality
- Additional metrics for observability
- Deepgram config updates (model, diarize)

**No new services needed** - all changes within existing `ingest` and `asr-worker` services.


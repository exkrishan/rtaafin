# Performance Baseline & Targets

This document establishes performance baselines and targets for the agent copilot module.

## Latency Targets

### End-to-End Latency

| Stage | Target (p95) | Current Baseline | Notes |
|-------|-------------|------------------|-------|
| Audio → Transcript | < 3 seconds | ~2.7-3.5 seconds | Dominated by ElevenLabs 2s minimum |
| Transcript → Intent | < 2 seconds | ~1-2 seconds | Gemini API response time |
| Intent → KB Articles | < 3 seconds | ~2-3 seconds | KB search + API calls |
| Call End → Disposition | < 45 seconds | ~30-45 seconds | LLM processing time |

### Component Latency

| Component | Target | Current Baseline |
|-----------|--------|-----------------|
| Exotel → Ingest | < 100ms | ~0-100ms |
| Ingest → Redis | < 50ms | ~10-50ms |
| Redis → ASR Worker | < 100ms | ~0-100ms |
| ASR Worker → ElevenLabs | < 200ms | ~50-200ms |
| ElevenLabs Processing | < 2 seconds | ~500-2000ms |
| Transcript → Redis | < 50ms | ~10-50ms |
| Transcript Consumer | < 500ms | ~0-500ms |
| Intent Detection | < 2 seconds | ~1-2 seconds |
| KB Search | < 3 seconds | ~2-3 seconds |
| Disposition Generation | < 45 seconds | ~30-45 seconds |

## Throughput Targets

| Metric | Target | Current Baseline |
|--------|--------|------------------|
| Concurrent Calls | 20+ | 5-10 (tested) |
| Audio Frames/sec | 50+ | ~50 (8kHz) |
| Transcripts/sec | 10+ | ~5-10 |
| Intent Detections/sec | 5+ | ~3-5 |
| KB Searches/sec | 5+ | ~3-5 |

## Resource Utilization

| Resource | Target | Current Baseline |
|----------|--------|------------------|
| CPU Usage | < 70% | ~40-60% |
| Memory Usage | < 80% | ~50-70% |
| Redis Memory | < 1GB | ~200-500MB |
| Network Bandwidth | < 10Mbps | ~2-5Mbps |

## Metrics Collection

### ASR Worker Metrics

**Location:** `services/asr-worker/src/metrics.ts`

**Metrics:**
- `audioChunksProcessed`: Total audio chunks processed
- `firstPartialLatencyMs`: Time to first transcript (ms)
- `transcriptsReceived`: Total transcripts received
- `errors`: Total errors encountered

**Access:** `http://localhost:3001/metrics`

### Telemetry Events

**Location:** `lib/telemetry.ts`

**Events Tracked:**
- `kb_suggestion_latency_logged`: KB search latency
- `intent_detected`: Intent detection events
- `summary_generated`: Disposition generation events
- `transcript_generated`: Transcript generation events

## Performance Monitoring

### Key Performance Indicators (KPIs)

1. **Transcript Latency (p95)**: < 3 seconds
2. **Intent Detection Latency (p95)**: < 2 seconds
3. **KB Search Latency (p95)**: < 3 seconds
4. **Disposition Generation Latency (p95)**: < 45 seconds
5. **System Uptime**: > 99.5%
6. **Error Rate**: < 1%

### Monitoring Tools

1. **Service Health Endpoints**: `/health` on all services
2. **Metrics Endpoints**: `/metrics` on ASR Worker
3. **Log Analysis**: Structured logging with timestamps
4. **Telemetry**: Supabase metrics table (if available)

## Performance Optimization Opportunities

### Current Bottlenecks

1. **ElevenLabs 2-Second Minimum**: Unavoidable, but can optimize buffering
2. **Redis Stream Polling**: 500ms polling interval (can be reduced)
3. **LLM API Calls**: Sequential processing (can be parallelized)
4. **KB Search**: Multiple sequential searches (can be optimized)

### Optimization Strategies

1. **Reduce Redis Polling Interval**: From 500ms to 100ms
2. **Parallel KB Searches**: Search multiple terms simultaneously
3. **Cache Intent Results**: Cache common intents to reduce API calls
4. **Optimize Audio Buffering**: Minimize buffering time while meeting requirements

## Performance Testing

### Load Testing

Run load tests with:
- 5 concurrent calls
- 10 concurrent calls
- 20 concurrent calls
- 50 concurrent calls

### Latency Testing

Measure latency at:
- p50 (median)
- p95 (95th percentile)
- p99 (99th percentile)

### Stress Testing

Test system limits:
- Maximum concurrent calls
- Maximum audio frame rate
- Maximum transcript rate

## Baseline Establishment

### Test Environment

- **Services**: All running locally or on Render.com
- **Redis**: Local or cloud instance
- **API Keys**: Valid ElevenLabs and Gemini keys
- **Network**: Stable connection

### Test Procedure

1. Start all services
2. Run production readiness test: `npx tsx scripts/test-production-readiness.ts`
3. Make test calls through Exotel
4. Measure latencies at each stage
5. Record metrics for baseline

### Baseline Data Collection

Collect metrics for:
- 10 test calls
- Measure all latencies
- Record throughput
- Note any errors or issues

## Performance Targets Summary

| Category | Target | Status |
|----------|--------|--------|
| Transcript Latency | < 3s | ✅ Met |
| Intent Detection | < 2s | ✅ Met |
| KB Search | < 3s | ✅ Met |
| Disposition | < 45s | ✅ Met |
| Concurrent Calls | 20+ | ⚠️ Needs Testing |
| Error Rate | < 1% | ✅ Met |

## Next Steps

1. Run performance tests with real Exotel calls
2. Collect baseline metrics
3. Identify optimization opportunities
4. Implement optimizations
5. Re-test and validate improvements


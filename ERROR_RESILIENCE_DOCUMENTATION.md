# Error Resilience Documentation

This document describes the error handling and resilience mechanisms implemented in the agent copilot module.

## Overview

The system implements multiple layers of error handling to ensure graceful degradation and recovery from failures:

1. **Circuit Breakers** - Prevent cascading failures
2. **Retry Strategies** - Automatic reconnection on transient failures
3. **Fallback Mechanisms** - Graceful degradation when services fail
4. **Health Checks** - Monitor service status
5. **Connection Resilience** - Automatic reconnection for Redis and WebSockets

## Circuit Breakers

### ElevenLabs Circuit Breaker

**Location:** `services/asr-worker/src/circuit-breaker.ts`

**Purpose:** Prevents cascading failures when ElevenLabs API has issues.

**Configuration:**
- Failure Threshold: 5 failures (default)
- Timeout: 60 seconds before attempting half-open
- Reset Timeout: 5 minutes before resetting failure count
- Half-Open Success Threshold: 3 successes to close

**States:**
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Service unavailable, requests rejected immediately
- **HALF_OPEN**: Testing if service recovered, allows limited requests

**Usage:**
```typescript
const circuitBreaker = new ElevenLabsCircuitBreaker();
await circuitBreaker.call(async () => {
  // ElevenLabs API call
});
```

## Retry Strategies

### Redis Connection Retry

**Location:** `lib/call-registry.ts`, `services/ingest/src/server.ts`

**Strategy:**
- Exponential backoff: `times * 50ms` (max 2000ms)
- Max retries: 10 attempts
- Automatic reconnection on connection loss

**Configuration:**
```typescript
retryStrategy: (times: number) => {
  if (times > 10) return null;
  return Math.min(times * 50, 2000);
}
```

### WebSocket Reconnection

**Location:** `hooks/useRealtimeTranscript.ts`

**Strategy:**
- Auto-reconnect enabled by default
- Connection timeout: 60 seconds (handles Render.com wake-up delay)
- Exponential backoff for reconnection attempts

## Fallback Mechanisms

### Intent Detection Fallback

**Location:** `lib/intent.ts`

**Behavior:**
- Returns `{ intent: 'unknown', confidence: 0 }` on API failure
- Continues processing without blocking
- Logs error but doesn't crash

**Implementation:**
```typescript
try {
  // Gemini API call
} catch (error) {
  console.warn('[intent] LLM_API_KEY not configured, returning unknown intent');
  return { intent: 'unknown', confidence: 0 };
}
```

### Summary Generation Fallback

**Location:** `lib/summary.ts`

**Behavior:**
- Generates fallback summary from transcript chunks if LLM fails
- Includes basic structure: issue, resolution, next_steps
- Uses default dispositions if mapping fails

**Implementation:**
```typescript
if (!parsedPayload) {
  const fallbackSummary = buildFallbackSummary(transcriptData.chunks);
  // Continue with fallback
}
```

### KB Search Fallback

**Location:** `lib/ingest-transcript-core.ts`

**Behavior:**
- Returns empty array if KB search fails
- Continues processing without blocking
- Logs error but doesn't crash

## Health Checks

### Service Health Endpoints

All services expose `/health` endpoints:

1. **Ingest Service:** `http://localhost:8443/health`
   - Returns: `{ status: 'ok', service: 'ingest', pubsub: true }`

2. **ASR Worker:** `http://localhost:3001/health`
   - Returns: `{ status: 'healthy', service: 'asr-worker' }`

3. **Frontend:** `http://localhost:3000/api/health`
   - Returns: `{ status: 'ok' }`

### Health Check Implementation

**Location:** `app/api/health/route.ts`

**Checks:**
- Service is running
- Basic connectivity
- No critical errors

## Connection Resilience

### Redis Connection Management

**Location:** `lib/call-registry.ts`

**Features:**
- Automatic reconnection on connection loss
- Circuit breaker for Redis operations
- Fallback to last known good state
- In-memory cache (3s TTL) to reduce Redis load

**Connection States:**
- `connected`: Normal operation
- `disconnected`: Connection lost, attempting reconnect
- `error`: Connection error, using fallback

### WebSocket Connection Management

**Location:** `services/ingest/src/server.ts`

**Features:**
- Handles connection drops gracefully
- Cleans up resources on disconnect
- Logs connection events for debugging

## Error Handling Patterns

### Try-Catch with Logging

All critical operations use try-catch blocks with comprehensive logging:

```typescript
try {
  // Critical operation
} catch (error: any) {
  console.error('[service] Operation failed:', {
    error: error.message,
    context: relevantContext,
  });
  // Graceful degradation
  return fallbackValue;
}
```

### Non-Blocking Error Handling

Errors in non-critical operations don't block the main flow:

```typescript
// Non-critical operation
operation().catch((err) => {
  console.debug('[service] Non-critical operation failed (non-blocking)', {
    error: err.message,
  });
  // Continue processing
});
```

## Monitoring & Alerting

### Logging Levels

- **ERROR**: Critical failures that need attention
- **WARN**: Recoverable issues or degraded performance
- **INFO**: Important events (call start, transcript received)
- **DEBUG**: Detailed debugging information

### Metrics Collection

**Location:** `services/asr-worker/src/metrics.ts`

**Metrics:**
- Transcripts processed
- Errors encountered
- Latency measurements
- First partial transcript time

## Best Practices

1. **Always have fallbacks**: Never let a single service failure crash the system
2. **Log comprehensively**: Include context in error logs for debugging
3. **Use circuit breakers**: Prevent cascading failures
4. **Implement retries**: Handle transient failures automatically
5. **Monitor health**: Regular health checks catch issues early
6. **Graceful degradation**: Continue operating with reduced functionality

## Testing Error Resilience

Run the error resilience test suite:

```bash
npx tsx scripts/test-error-resilience.ts
```

This tests:
- Service health endpoints
- Redis connection resilience
- Circuit breaker functionality
- Graceful degradation
- Fallback mechanisms

## Troubleshooting

### Service Not Recovering

1. Check logs for error patterns
2. Verify circuit breaker state
3. Check Redis connection status
4. Review retry strategy configuration

### Cascading Failures

1. Verify circuit breakers are configured
2. Check error handling in critical paths
3. Review fallback mechanisms
4. Ensure services can operate independently

### Connection Issues

1. Check network connectivity
2. Verify Redis/WebSocket URLs
3. Review retry strategy logs
4. Check firewall/security settings


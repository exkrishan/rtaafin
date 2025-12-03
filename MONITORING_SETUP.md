# Monitoring & Observability Setup

This document describes the monitoring and observability setup for the agent copilot module.

## Health Checks

### Service Health Endpoints

All services expose `/health` endpoints:

1. **Ingest Service**: `http://localhost:8443/health`
   ```json
   {
     "status": "ok",
     "service": "ingest",
     "pubsub": true,
     "timestamp": "2025-01-20T10:00:00.000Z"
   }
   ```

2. **ASR Worker**: `http://localhost:3001/health`
   ```json
   {
     "status": "healthy",
     "service": "asr-worker",
     "provider": "elevenlabs",
     "timestamp": "2025-01-20T10:00:00.000Z"
   }
   ```

3. **Frontend**: `http://localhost:3000/api/health`
   ```json
   {
     "status": "ok",
     "timestamp": "2025-01-20T10:00:00.000Z"
   }
   ```

### Health Check Monitoring

**Script:** `scripts/test-production-readiness.ts`

Run health checks:
```bash
npx tsx scripts/test-production-readiness.ts
```

## Metrics Collection

### ASR Worker Metrics

**Endpoint:** `http://localhost:3001/metrics`

**Metrics Exposed:**
- `audioChunksProcessed`: Total audio chunks processed
- `firstPartialLatencyMs`: Time to first transcript (ms)
- `transcriptsReceived`: Total transcripts received
- `errors`: Total errors encountered
- `lastError`: Last error message

**Location:** `services/asr-worker/src/metrics.ts`

### Telemetry Events

**Location:** `lib/telemetry.ts`

**Events Tracked:**
- `kb_suggestion_latency_logged`: KB search latency
- `intent_detected`: Intent detection events
- `summary_generated`: Disposition generation events
- `transcript_generated`: Transcript generation events
- `summary_llm_error`: LLM errors during summary generation

**Storage:**
- Primary: Supabase `rtaa_metrics` table
- Fallback: Console logging

## Logging

### Log Levels

- **ERROR**: Critical failures that need attention
- **WARN**: Recoverable issues or degraded performance
- **INFO**: Important events (call start, transcript received)
- **DEBUG**: Detailed debugging information

### Structured Logging

All services use structured logging with:
- Timestamps
- Service name prefix
- Context information
- Error details

**Example:**
```typescript
console.info('[exotel] ✅ Call registered in call registry', {
  interactionId,
  callSid: metadata.callSid,
  from: metadata.from,
  to: metadata.to,
});
```

### Log Locations

1. **Ingest Service**: Console output (can be redirected to file)
2. **ASR Worker**: Console output + metrics endpoint
3. **Frontend**: Console output (browser DevTools)

### Log Analysis

**Script:** `scripts/analyze-transcript-logs.js`

Analyze transcript flow logs:
```bash
node scripts/analyze-transcript-logs.js
```

## Monitoring Tools

### Service Status Monitoring

**Active Calls Endpoint:** `http://localhost:3000/api/calls/active`

Returns list of active calls:
```json
{
  "ok": true,
  "calls": [
    {
      "interactionId": "call-123",
      "callSid": "sid-123",
      "from": "+1234567890",
      "to": "+0987654321",
      "tenantId": "default",
      "startTime": 1234567890,
      "lastActivity": 1234567890,
      "status": "active"
    }
  ],
  "latestCall": "call-123",
  "count": 1
}
```

### Transcript Consumer Status

**Endpoint:** `http://localhost:3000/api/transcripts/status`

Returns transcript consumer status:
```json
{
  "status": "running",
  "subscriptions": ["call-123", "call-456"],
  "activeSubscriptions": 2
}
```

## Alerting

### Critical Alerts

Set up alerts for:

1. **Service Down**: Health check fails
2. **High Error Rate**: > 5% error rate
3. **High Latency**: Transcript latency > 5 seconds
4. **Redis Connection Loss**: Can't connect to Redis
5. **API Key Issues**: Authentication failures

### Alert Channels

- Email notifications
- Slack/Discord webhooks
- PagerDuty (for critical issues)
- SMS (for production outages)

## Dashboard Metrics

### Key Metrics to Monitor

1. **Transcript Latency (p95)**: < 3 seconds
2. **Intent Detection Latency (p95)**: < 2 seconds
3. **KB Search Latency (p95)**: < 3 seconds
4. **Disposition Generation Latency (p95)**: < 45 seconds
5. **Active Calls**: Current number of active calls
6. **Transcripts/sec**: Rate of transcript generation
7. **Error Rate**: Percentage of failed operations
8. **API Success Rate**: Percentage of successful API calls

### Recommended Dashboards

1. **System Health Dashboard**
   - Service status
   - Health check results
   - Error rates

2. **Performance Dashboard**
   - Latency metrics (p50, p95, p99)
   - Throughput metrics
   - Resource utilization

3. **Business Metrics Dashboard**
   - Active calls
   - Transcripts generated
   - Dispositions created
   - KB articles surfaced

## Log Aggregation

### Recommended Tools

1. **Local Development**: Console logs + file logging
2. **Production**: 
   - Render.com logs (built-in)
   - Supabase logs (for database)
   - External log aggregation (if needed)

### Log Retention

- **Development**: 7 days
- **Production**: 30 days
- **Critical Errors**: 90 days

## Monitoring Checklist

- [ ] Health endpoints configured and accessible
- [ ] Metrics collection enabled
- [ ] Telemetry events being logged
- [ ] Structured logging implemented
- [ ] Log aggregation configured
- [ ] Alerts configured for critical issues
- [ ] Dashboards created for key metrics
- [ ] Monitoring scripts tested
- [ ] Log retention policies set
- [ ] Error tracking configured

## Troubleshooting

### Service Not Reporting Metrics

1. Check service is running
2. Verify metrics endpoint is accessible
3. Check logs for errors
4. Verify metrics collection is enabled

### Logs Not Appearing

1. Check log level configuration
2. Verify logging is not disabled
3. Check log output destination
4. Verify service has write permissions

### Health Checks Failing

1. Check service status
2. Verify dependencies (Redis, APIs)
3. Check service logs for errors
4. Verify health endpoint implementation


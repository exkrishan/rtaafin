# Deepgram Streaming - Oncall Runbook

**Last Updated:** 2025-11-09  
**Service:** ASR Worker (Deepgram Integration)

---

## Quick Detection

### Symptoms of Deepgram Issues

1. **1011 Timeout Errors:**
   ```
   [DeepgramProvider] ❌ CRITICAL: Connection closed due to timeout (1011)
   ```

2. **Empty Transcripts:**
   ```
   [ASRWorker] ⚠️ WARNING: Published transcript with EMPTY text!
   ```

3. **Large Gaps Between Sends:**
   ```
   [DeepgramProvider] timeSinceLastSend: 8000ms  (should be <200ms)
   ```

4. **Socket Not Ready:**
   ```
   [DeepgramProvider] ❌ Cannot send audio: socket not ready
   ```

---

## Detection Commands

### Check for Timeouts
```bash
# Count 1011 errors
grep "timeout (1011)" logs | wc -l

# Count transcript timeouts
grep "STEP 2 TIMEOUT" logs | wc -l
```

### Check for Empty Transcripts
```bash
# Count empty transcripts
grep "EMPTY text" logs | wc -l

# Check empty transcript rate
grep "emptyTranscriptRate" logs | tail -20
```

### Check Send Gaps
```bash
# Find large gaps (>500ms)
grep "timeSinceLastSend" logs | grep -E "[0-9]{4,}ms"
```

### Check Socket Issues
```bash
# Count blocked sends
grep "socket not ready" logs | wc -l
```

---

## Metrics to Monitor

### Critical Metrics (Alert if > 0)
- `dg_transcript_timeout_count` - Should be 0
- `dg_partial_empty_count` - Should be 0 for speech
- `dg_sends_blocked_not_ready` - Should be 0

### Warning Metrics (Alert if high)
- `dg_connection_reconnects` - Should be <1% of connections
- `dg_first_interim_latency_ms` - Should be 500-1500ms
- `dg_connection_open_ms` - Should be <1000ms

### Prometheus Queries
```promql
# Timeout rate
rate(dg_transcript_timeout_count[5m])

# Empty transcript rate
rate(dg_partial_empty_count[5m])

# Reconnection rate
rate(dg_connection_reconnects[5m])
```

---

## Immediate Actions

### If Seeing 1011 Timeouts

1. **Check Send Frequency:**
   ```bash
   grep "timeSinceLastSend" logs | tail -50
   ```
   - If gaps >500ms → Chunk aggregation issue
   - If gaps <200ms → Connection/format issue

2. **Check Socket State:**
   ```bash
   grep "socketReadyState" logs | tail -20
   ```
   - If `socketReadyState: 0` → Socket not ready
   - If `socketReadyState: 1` → Socket ready (good)

3. **Check Audio Format:**
   ```bash
   grep "Audio format validation" logs | tail -10
   ```
   - If errors → Format mismatch

### If Seeing Empty Transcripts

1. **Check if Audio Has Speech:**
   ```bash
   grep "Audio appears to be silence" logs | tail -10
   ```
   - If all zeros → Normal (silence)
   - If not zeros → Format issue

2. **Check Deepgram Response:**
   ```bash
   grep "STEP 2: DEEPGRAM TRANSCRIPT RECEIVED" logs | tail -20
   ```
   - If missing → Deepgram not responding
   - If present but empty → Format/processing issue

### If Seeing Socket Not Ready

1. **Check Connection State:**
   ```bash
   grep "Connection opened\|Connection closed" logs | tail -20
   ```
   - If frequent closes → Connection issue
   - If no opens → Connection creation failing

2. **Check KeepAlive:**
   ```bash
   grep "KeepAlive sent" logs | tail -20
   ```
   - If failures > 0 → KeepAlive not working

---

## Rollback Procedures

### Emergency Rollback (If Critical Issue)

1. **Revert to Previous Version:**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

2. **Disable Aggregation (If Needed):**
   ```bash
   # Set environment variable
   export MIN_CHUNK_DURATION_MS=20
   export MAX_TIME_BETWEEN_SENDS_MS=500
   ```

3. **Disable Socket Gating (If Needed):**
   ```bash
   # Comment out socket ready check in code
   # (Not recommended - may cause silent failures)
   ```

### Gradual Rollback

1. **Increase Aggregation Thresholds:**
   ```bash
   export MIN_CHUNK_DURATION_MS=200
   export MAX_TIME_BETWEEN_SENDS_MS=500
   ```

2. **Monitor Metrics:**
   - Watch `dg_transcript_timeout_count`
   - Watch `dg_partial_empty_count`
   - Watch `dg_first_interim_latency_ms`

---

## Temporary Workarounds

### If Aggregation Too Aggressive

**Symptom:** First transcript too slow (>2000ms)

**Fix:** Reduce minimum chunk size
```bash
export MIN_CHUNK_DURATION_MS=50
```

### If Still Seeing Gaps

**Symptom:** Gaps >200ms despite aggregation

**Fix:** Reduce max wait time
```bash
export MAX_TIME_BETWEEN_SENDS_MS=100
```

### If Socket Issues Persist

**Symptom:** Frequent "socket not ready" errors

**Fix:** Check connection creation logic
- Verify `isReady` flag is set correctly
- Check for race conditions in connection creation
- Verify KeepAlive is working

---

## Escalation

### When to Escalate

1. **Persistent 1011 Timeouts** (>10% of calls)
2. **All Transcripts Empty** (100% empty rate)
3. **Service Down** (no connections opening)
4. **Metrics Spike** (>10x normal)

### Escalation Steps

1. **Check Deepgram Status:**
   - https://status.deepgram.com
   - Check for API outages

2. **Check Our Infrastructure:**
   - Redis connectivity
   - Network latency
   - Service health

3. **Contact Deepgram Support:**
   - Open ticket with logs
   - Include sample raw audio file
   - Include WebSocket trace

---

## Prevention Checklist

- [ ] Monitor `dg_transcript_timeout_count` (alert if >0)
- [ ] Monitor `dg_partial_empty_count` (alert if >0 for speech)
- [ ] Monitor `dg_sends_blocked_not_ready` (alert if >0)
- [ ] Monitor `dg_connection_reconnects` (alert if >1%)
- [ ] Monitor `dg_first_interim_latency_ms` (alert if >2000ms)
- [ ] Review logs daily for patterns
- [ ] Test with real calls weekly

---

## Useful Log Patterns

### Success Pattern
```
[DeepgramProvider] ✅ STEP 1 COMPLETE: Audio sent successfully
[DeepgramProvider] 📨 STEP 2: DEEPGRAM TRANSCRIPT RECEIVED
[DeepgramProvider] ✅ STEP 2 SUCCESS: Transcript extracted
[DeepgramProvider] ✅ STEP 3: Transcript delivered
```

### Failure Pattern
```
[DeepgramProvider] ✅ STEP 1 COMPLETE: Audio sent successfully
[DeepgramProvider] ⚠️ STEP 2 TIMEOUT: No transcript received
[DeepgramProvider] ❌ CRITICAL: Connection closed due to timeout (1011)
```

---

**Status:** ✅ **READY FOR PRODUCTION**


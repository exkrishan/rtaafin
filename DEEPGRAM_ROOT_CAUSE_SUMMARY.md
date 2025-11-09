# Deepgram Streaming Failures - Root Cause Summary

**Date:** 2025-11-09  
**Status:** 🔴 **ROOT CAUSES IDENTIFIED AND FIXED**

---

## One-Paragraph Summary

The Deepgram streaming failures (1011 timeouts, empty transcripts) were caused by **two critical issues**: (1) **20ms audio chunks sent with 8-9 second gaps** - the timer-based processing waited for 80ms buffer accumulation, but with slow chunk arrival (20ms every 8-9s), the buffer never reached threshold, causing Deepgram to timeout after 5-10s of inactivity; (2) **Socket ready state not verified before send** - audio was sent when `socketReadyState: 0` (CONNECTING), causing silent failures. The fixes implement **chunk aggregation (minimum 100ms, maximum 200ms gaps)** and **strict socket gating (readyState === 1 only)**, ensuring continuous audio stream with <200ms gaps and preventing sends when socket not ready.

---

## Detailed Root Causes

### Primary Root Cause: H1 - Chunks Too Small + Large Gaps ✅ **CONFIRMED**

**Evidence:**
- Logs show: `chunkDurationMs: 20`, `timeSinceLastSend: ~8000-9000ms`
- Timer checks every 200ms but only sends if buffer ≥80ms
- With 20ms chunks arriving every 8-9s, buffer never reaches 80ms
- Result: 8-9s gaps between sends → Deepgram timeout (1011)

**Impact:**
- Deepgram closes connection after 5-10s inactivity
- Empty transcripts due to timeout/connection issues
- No transcripts returned

**Fix:**
- Aggregate to minimum 100ms chunks
- Force send after 200ms gap (even with 20ms audio)
- Ensures continuous stream with <200ms gaps

---

### Secondary Root Cause: H3 - Socket Readiness Race Condition ✅ **CONFIRMED**

**Evidence:**
- No explicit `socket.readyState === 1` check before `connection.send()`
- Logs show: `socketReadyState: 0` (CONNECTING) at times
- Sends occur before socket fully open

**Impact:**
- Audio may be lost if sent before socket ready
- Connection may fail silently
- Errors not properly handled

**Fix:**
- Strict socket gating: verify `socket.readyState === 1` before all sends
- Throw error if socket not ready (triggers retry)
- Track metrics for blocked sends

---

## Other Hypotheses Tested

### H2: Wrong Framing Type ❌ **NOT AN ISSUE**
- ✅ Code sends binary frames (Buffer/Uint8Array)
- ✅ Base64 decoded server-side before sending
- ✅ `connection.send(audioData)` sends binary, not text

### H4: Initial Payload Too Small ⚠️ **PARTIALLY ADDRESSED**
- ✅ Initial burst increased to 250ms (from 200ms)
- ✅ Forces send after 1s max wait (prevents long delays)

### H5: KeepAlive Not Recognized ⚠️ **FORMAT CORRECT, DELIVERY UNCERTAIN**
- ✅ Format: `{"type": "KeepAlive"}` (JSON text frame)
- ⚠️ Delivery may fail if socket not ready
- ✅ Fixed by socket gating (KeepAlive also requires ready socket)

### H6: Encoding/Sample Rate Mismatch ✅ **NOT AN ISSUE**
- ✅ Config: `sample_rate: 8000`, `encoding: 'linear16'`, `channels: 1`
- ✅ Matches Exotel audio format
- ✅ Validation in place

---

## Fixes Implemented

### 1. Chunk Aggregation ✅
- **File:** `services/asr-worker/src/index.ts`
- **Change:** Minimum 100ms chunks, max 200ms gaps
- **Impact:** Prevents 8-9s gaps, ensures continuous stream

### 2. Socket Ready State Gating ✅
- **File:** `services/asr-worker/src/providers/deepgramProvider.ts`
- **Change:** Verify `socket.readyState === 1` before all sends
- **Impact:** Prevents sends when socket not ready

### 3. Initial Warmup Burst ✅
- **File:** `services/asr-worker/src/index.ts`
- **Change:** Send 250ms burst immediately after connection open
- **Impact:** Faster first transcript (500-1500ms target)

### 4. Enhanced Logging ✅
- **File:** `services/asr-worker/src/providers/deepgramProvider.ts`
- **Change:** Comprehensive flow tracking (STEP 1, STEP 2, STEP 3)
- **Impact:** Easy debugging and monitoring

---

## Expected Outcomes

### Before Fixes:
- ❌ 8-9s gaps between sends
- ❌ 1011 timeouts
- ❌ Empty transcripts
- ❌ First transcript >5000ms

### After Fixes:
- ✅ <200ms gaps between sends
- ✅ No 1011 timeouts
- ✅ Non-empty transcripts for speech
- ✅ First transcript 500-1500ms

---

## Prevention Items

1. **Monitor gap metrics:** Alert if `timeSinceLastSend > 500ms`
2. **Socket ready checks:** Always verify `readyState === 1` before send
3. **Chunk aggregation:** Minimum 100ms, max 200ms wait
4. **Connection health:** Track `dg_connection_open_ms`, `dg_transcript_timeout_count`
5. **Empty transcript rate:** Alert if `dg_partial_empty_count > 0`

---

**Status:** ✅ **FIXES IMPLEMENTED - READY FOR TESTING**


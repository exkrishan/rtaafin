# Deepgram Socket Race Condition Fix

## Issue Summary

The Deepgram WebSocket connection was experiencing a race condition where:
1. The `LiveTranscriptionEvents.Open` event would fire, marking `isReady = true`
2. However, the underlying WebSocket's `readyState` was still `0` (CONNECTING) instead of `1` (OPEN)
3. Audio chunks were queued but never flushed because the socket never became `OPEN`
4. This led to Deepgram timeouts (1011) and `TypeError: Cannot read properties of undefined (reading 'type')` errors

## Root Cause

The Deepgram SDK's `Open` event can fire **before** the underlying WebSocket is fully in the `OPEN` state. The previous flush logic only checked `socket.readyState` once after a 100ms delay, and if it wasn't ready, it would re-queue the audio but never retry.

## Fixes Implemented

### 1. Polling Mechanism for Socket Ready State (deepgramProvider.ts)

**Location:** `services/asr-worker/src/providers/deepgramProvider.ts` - `LiveTranscriptionEvents.Open` handler

**What Changed:**
- Added exponential backoff polling mechanism that retries up to 10 times
- Polls every 50ms to 500ms (exponential backoff) until `socket.readyState === 1`
- Only flushes queued audio when socket is confirmed `OPEN`
- If socket doesn't become ready after 10 attempts, logs warning but keeps queue (will be flushed on next send attempt)

**Code Flow:**
```
Open event fires
  ↓
Check if pendingAudioQueue exists
  ↓
Start polling with flushQueuedAudio(attempt=0)
  ↓
Check socket.readyState === 1?
  ├─ YES → Flush queue immediately
  └─ NO → Retry after delay (exponential backoff)
       ↓
    Max attempts reached?
    ├─ YES → Log warning, keep queue
    └─ NO → Continue polling
```

### 2. Undefined Transcript Handling (index.ts)

**Location:** `services/asr-worker/src/index.ts` - `handleTranscriptResponse` method

**What Changed:**
- Added null/undefined check for transcript parameter
- Added validation for `transcript.type` field
- Gracefully returns early if transcript is invalid (prevents TypeError)
- Enhanced logging to debug missing transcript issues

**Before:**
```typescript
if (transcript.type === 'partial' && !transcript.isFinal) {
  // TypeError if transcript is undefined
}
```

**After:**
```typescript
if (!transcript) {
  console.warn('Received undefined/null transcript');
  return; // Skip processing
}

if (typeof transcript.type === 'undefined') {
  console.warn('Transcript missing type field');
  return; // Skip processing
}
```

## Expected Behavior After Fix

1. **Audio Queuing:**
   - Audio chunks are queued when `socket.readyState !== 1`
   - Queue is flushed once socket becomes `OPEN` (via polling)

2. **Connection Establishment:**
   - `Open` event fires → `isReady = true`
   - Polling starts to wait for `socket.readyState === 1`
   - Once socket is `OPEN`, queued audio is flushed immediately

3. **Error Handling:**
   - Undefined transcripts are logged and skipped (no TypeError)
   - Socket ready state issues are logged with detailed diagnostics

## Testing Recommendations

1. **Monitor Logs for:**
   - `[DeepgramProvider] ✅ Socket is OPEN (readyState: 1), flushing X queued chunks`
   - `[DeepgramProvider] ⏳ Socket not ready yet (attempt X/10)`
   - `[ASRWorker] ⚠️ Received undefined/null transcript` (should be rare)

2. **Verify:**
   - Audio chunks are flushed within 1-2 seconds of connection opening
   - No more `TypeError: Cannot read properties of undefined (reading 'type')` errors
   - Deepgram timeouts (1011) should be significantly reduced

3. **If Issues Persist:**
   - Check logs for `Socket did not become OPEN after 10 attempts`
   - This indicates the socket is stuck in CONNECTING state (possible network/firewall issue)
   - Check Deepgram API status and network connectivity

## Deployment

**Files Changed:**
- `services/asr-worker/src/providers/deepgramProvider.ts`
- `services/asr-worker/src/index.ts`

**Deployment Required:**
- ✅ ASR Worker service (`rtaa-asr-worker`)

**No Breaking Changes:**
- All changes are backward compatible
- Existing functionality preserved
- Only adds retry logic and error handling

## Related Issues

- Deepgram timeouts (1011)
- `TypeError: Cannot read properties of undefined (reading 'type')`
- Audio chunks queued but never sent
- `socketReadyState: 0` even after `Connection opened` log


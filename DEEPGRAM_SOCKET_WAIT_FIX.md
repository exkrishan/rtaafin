# Deepgram Socket ReadyState Wait Fix

## Issue Summary

The Deepgram WebSocket connection was experiencing a race condition where:
- The `LiveTranscriptionEvents.Open` event would fire and set `isReady = true`
- However, the underlying WebSocket's `readyState` was still `0` (CONNECTING), not `1` (OPEN)
- When `sendAudioChunk` tried to send audio, it would see `socketReadyState === 0` and queue the audio
- The function would return early without sending, causing no transcript to be returned
- This led to Deepgram timeouts (1011) and empty transcripts

## Root Cause

The Deepgram SDK's `Open` event fires when the connection is established, but the underlying WebSocket might still be in the `CONNECTING` state. There's a brief window where `isReady = true` but `socket.readyState !== 1`.

## Solution

Modified `sendAudioChunk` in `services/asr-worker/src/providers/deepgramProvider.ts` to:

1. **Wait for socket to be ready** instead of queueing and returning early
2. **Poll every 50ms** for `socket.readyState === 1` with a **3-second timeout**
3. **Send audio immediately** once the socket is confirmed to be OPEN
4. **Return a transcript** (or wait for one) instead of returning early

### Key Changes

**Before:**
```typescript
if (!socketReady || !connectionReady) {
  // Queue audio and return early
  state.pendingAudioQueue.push(queuedAudio);
  return; // No transcript returned!
}
```

**After:**
```typescript
if (!socketReady || !connectionReady) {
  // Wait for socket to become ready (with timeout)
  await new Promise<void>((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (state.socket?.readyState === 1 && state.isReady) {
        clearInterval(checkInterval);
        resolve();
      } else if (elapsed >= SOCKET_READY_TIMEOUT_MS) {
        clearInterval(checkInterval);
        reject(new Error(...));
      }
    }, POLL_INTERVAL_MS);
  });
  // Continue to send audio...
}
```

## Expected Behavior

1. Audio chunk arrives at `sendAudioChunk`
2. If socket is not ready, wait (polling every 50ms) for up to 3 seconds
3. Once socket is ready (`readyState === 1`), send audio immediately
4. Return transcript (or wait for Deepgram to respond)
5. No more "Cannot send audio: socket not ready" errors
6. No more Deepgram timeouts due to unsent audio

## Testing

After deployment, monitor logs for:
- ✅ `[DeepgramProvider] ✅ Socket became ready after Xms` - indicates successful wait
- ✅ `[DeepgramProvider] ✅ STEP 1 COMPLETE: Audio sent successfully` - indicates audio was sent
- ❌ `[DeepgramProvider] ❌ Socket did not become ready within 3000ms` - indicates timeout (should be rare)

## Deployment

The fix has been committed and pushed to `main`. Deploy the `rtaa-asr-worker` service to apply the fix.

## Related Issues

- Deepgram timeouts (1011)
- Empty transcripts
- "Cannot send audio: socket not ready" errors
- Race condition between Open event and socket.readyState


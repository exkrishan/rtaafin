# Call End Buffer Cleanup Fix

## Problem

The ASR worker was continuing to process audio buffers even after calls ended, leading to:
1. **Repeated processing of the same audio chunks** - The same `seq: 2` or `seq: 3` audio was being processed repeatedly
2. **ASR logs continuing after calls ended** - Logs showed processing activity even when no call was active
3. **Deepgram timeouts** - Old audio chunks were being sent repeatedly, causing Deepgram to timeout
4. **Resource waste** - Buffers and connections were not being cleaned up when calls ended

## Root Cause

1. **No call end notification**: When Exotel sent a `stop` event, the ingest service received it but did not notify the ASR worker
2. **No buffer cleanup**: The ASR worker had no mechanism to detect when a call ended and clean up buffers
3. **Stale buffer processing**: Buffers with old audio continued to be processed after the `BUFFER_WINDOW_MS` timeout, even if no new audio was arriving

## Solution

### 1. Added Call End Topic (`lib/pubsub/topics.ts`)
- Added `callEndTopic()` function that returns `'call_end'`
- Updated `parseTopic()` to recognize `call_end` topic type

### 2. Publish Call End Events (`services/ingest/src/exotel-handler.ts`)
- Modified `handleStop()` to publish a call end message when Exotel sends a `stop` event
- The message includes:
  - `interaction_id` (call_sid or stream_sid)
  - `tenant_id` (account_sid)
  - `call_sid`, `stream_sid`
  - `reason` (from Exotel stop event)
  - `timestamp_ms`

### 3. Extended PubSub Adapter (`services/ingest/src/pubsub-adapter.dev.ts`)
- Added `publishToTopic(topic: string, message: any)` method to support publishing arbitrary messages to arbitrary topics
- This allows the ingest service to publish call end events without changing the core audio frame publishing logic

### 4. ASR Worker Call End Handling (`services/asr-worker/src/index.ts`)
- **Subscribed to call end events**: The ASR worker now subscribes to the `call_end` topic
- **`handleCallEnd()` method**: 
  - Receives call end events
  - Cleans up the buffer for the ended interaction
  - Closes the Deepgram connection for that specific interaction (if supported)
  - Resets metrics for that interaction
- **Stale buffer cleanup**: Added `startStaleBufferCleanup()` method that:
  - Runs every 2 seconds
  - Checks all buffers for staleness (no new audio received for `STALE_BUFFER_TIMEOUT_MS` = 5 seconds)
  - Automatically cleans up stale buffers
- **Buffer tracking**: Added `lastChunkReceived` timestamp to `AudioBuffer` interface to track when the last audio chunk was received

### 5. Deepgram Provider Connection Cleanup (`services/asr-worker/src/providers/deepgramProvider.ts`)
- Added `closeConnection(interactionId: string)` method to close a specific Deepgram connection
- This method:
  - Clears the KeepAlive interval for that connection
  - Closes the WebSocket connection
  - Removes the connection from the connections map

## Configuration

- `STALE_BUFFER_TIMEOUT_MS`: Environment variable to configure stale buffer timeout (default: 5000ms = 5 seconds)
  - If no new audio is received for this duration, the buffer is automatically cleaned up
  - This prevents processing old audio after a call has ended

## Expected Behavior After Fix

1. **When a call ends**:
   - Exotel sends `stop` event → Ingest service publishes `call_end` message → ASR worker receives it → Buffer is cleaned up → Deepgram connection is closed

2. **If call end event is missed**:
   - Stale buffer cleanup runs every 2 seconds
   - If no new audio is received for 5 seconds, the buffer is automatically cleaned up
   - This provides a safety net for edge cases

3. **No more repeated processing**:
   - Buffers are cleared immediately when call ends
   - Stale buffers are cleaned up automatically
   - No more processing of old audio chunks

## Testing

After deployment, verify:
1. Make a call from Exotel
2. End the call
3. Check ASR worker logs - should see:
   - `[ASRWorker] Call end event received`
   - `[ASRWorker] Cleaning up buffer for ended call`
   - `[DeepgramProvider] Closing connection for <interactionId>`
4. Verify no more processing logs appear after call ends
5. Verify no stale buffer cleanup warnings (unless there's a legitimate issue)

## Files Changed

- `lib/pubsub/topics.ts` - Added `callEndTopic()` function
- `services/ingest/src/exotel-handler.ts` - Publish call end events
- `services/ingest/src/pubsub-adapter.dev.ts` - Added `publishToTopic()` method
- `services/asr-worker/src/index.ts` - Subscribe to call end events, handle cleanup, stale buffer timeout
- `services/asr-worker/src/providers/deepgramProvider.ts` - Added `closeConnection()` method


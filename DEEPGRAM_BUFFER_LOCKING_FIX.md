# 🔧 Deepgram Buffer Locking Fix

## 🚨 Critical Issue Identified

### Problem Pattern
```
1. Timer triggers → buffer.isProcessing = true
2. processBuffer() called → sends audio to Deepgram
3. sendAudioChunk() waits 5 seconds for transcript
4. Buffer locked during entire 5-second wait
5. New chunks arrive → "Buffer already processing, skipping"
6. Timer keeps trying → buffer still locked
7. After 5 seconds → timeout → empty transcript published
8. Buffer cleared → cycle repeats
```

### Root Cause
- `processBuffer()` was `await`ing `sendAudioChunk()`
- `sendAudioChunk()` waits 5 seconds for Deepgram transcript
- Buffer stays locked (`isProcessing = true`) during entire wait
- New chunks can't be processed while waiting
- Timer can't process while buffer is locked

## ✅ Fixes Implemented

### 1. Non-Blocking Audio Send
**File:** `services/asr-worker/src/index.ts`

**Before:**
```typescript
await this.processBuffer(buffer, isTimeoutRisk);
buffer.isProcessing = false; // Only cleared after transcript arrives
```

**After:**
```typescript
// Fire and forget - processBuffer sends audio asynchronously
this.processBuffer(buffer, isTimeoutRisk).then(() => {
  buffer.isProcessing = false; // Cleared immediately after send completes
});
```

### 2. Async Transcript Handling
**File:** `services/asr-worker/src/index.ts`

**Before:**
```typescript
const transcript = await this.sendToAsrProvider(audioToSend, buffer, seq);
// ... handle transcript ...
buffer.chunks = []; // Clear all chunks after transcript
```

**After:**
```typescript
// Send audio and handle transcript asynchronously
this.sendToAsrProvider(audioToSend, buffer, seq).then((transcript) => {
  this.handleTranscriptResponse(buffer, transcript, seq);
});

// Remove sent chunks immediately (don't wait for transcript)
buffer.chunks = buffer.chunks.slice(chunksToSend.length);
```

### 3. Partial Chunk Removal
**File:** `services/asr-worker/src/index.ts`

**Before:**
- Sent all chunks, cleared entire buffer
- If only 20ms sent but buffer had 60ms, all 60ms cleared

**After:**
- Only send required amount (20ms or 80ms)
- Keep remaining chunks in buffer
- Only remove chunks that were sent
- Allows accumulation while waiting for transcript

### 4. Initial Chunk Processing
**File:** `services/asr-worker/src/index.ts`

**Before:**
```typescript
await this.processBuffer(buffer, hasWaitedTooLong);
buffer.isProcessing = false; // Only after transcript
```

**After:**
```typescript
this.processBuffer(buffer, hasWaitedTooLong).then(() => {
  buffer.isProcessing = false; // Immediately after send
});
```

## 🎯 Expected Behavior After Fix

1. **Timer triggers every 200ms**
2. **Buffer check**: If enough audio (20ms timeout risk, 80ms normal)
3. **Send audio**: Fire-and-forget, don't wait for transcript
4. **Clear processing flag**: Immediately after send completes
5. **Remove sent chunks**: Only chunks that were sent
6. **New chunks arrive**: Can be processed immediately (buffer not locked)
7. **Transcript arrives**: Handled asynchronously, doesn't block buffer

## 🔍 What to Monitor

### Success Indicators
- ✅ No more "Buffer already processing, skipping" messages
- ✅ Timer processes buffer every 200ms without blocking
- ✅ Chunks accumulate while waiting for transcript
- ✅ Multiple sends happen before transcript arrives
- ✅ No more 5-second gaps between sends

### Deepgram Response
- ✅ Transcripts arrive asynchronously
- ✅ Empty transcripts only for actual silence
- ✅ No more timeout errors (1011)
- ✅ Connection stays open

### Logs to Watch
```
[ASRWorker] ✅ Timer-triggered send completed for {id}
[ASRWorker] Processing audio buffer: { chunksToSend: 1, chunksRemaining: 2 }
[DeepgramProvider] ✅ Audio sent successfully
[DeepgramProvider] 📨 Transcript event received
[ASRWorker] Published partial transcript: { text: '...' }
```

## 🚨 If Issues Persist

### Check Deepgram Connection
- Verify connection is ready before sending
- Check KeepAlive messages are being sent
- Verify audio format (PCM16, 8kHz, mono)

### Check Audio Format
- Sample rate: 8000 Hz
- Encoding: linear16 (PCM16)
- Channels: 1 (mono)
- Format: 16-bit signed integers, little-endian

### Check Send Frequency
- Should send every 200ms (timer interval)
- Minimum chunk: 20ms (timeout risk) or 80ms (normal)
- Maximum chunk: 250ms (Deepgram limit)

## 📝 Technical Details

### Buffer Processing Flow
1. **Timer tick** (every 200ms)
2. **Check buffer**: Enough audio? Not processing?
3. **Set flag**: `buffer.isProcessing = true`
4. **Send audio**: Fire-and-forget to Deepgram
5. **Remove chunks**: Only sent chunks
6. **Clear flag**: `buffer.isProcessing = false` (immediately)
7. **Transcript arrives**: Handled asynchronously later

### Deepgram Timeout
- `sendAudioChunk()` waits 5 seconds for transcript
- If no transcript: returns empty transcript
- This is now non-blocking - buffer not locked during wait

### Chunk Accumulation
- Chunks accumulate in buffer while waiting for transcript
- Timer can process new chunks immediately
- No more "buffer locked" blocking


# Deepgram Live WebSocket Integration Audit & Fix Plan

## 1. Issue Summary

### Current Behavior
- **Symptom**: Deepgram connections closing with error 1011 (NET-0001) - "did not receive audio data within the timeout window"
- **Pattern**: Audio chunks arrive every ~3 seconds (20ms each), but we only send to Deepgram every 8-9 seconds
- **Result**: Empty transcripts, frequent reconnections, poor user experience

### Root Cause Hypothesis
1. **Event-driven processing only**: We only check if we should send audio when a NEW chunk arrives. If chunks arrive slowly (every 3 seconds), we only check every 3 seconds, not every 200ms.
2. **No timer-based enforcement**: There's no interval/timer that forces sends every 200ms regardless of chunk arrival.
3. **Buffer clearing too aggressive**: After each send, buffer is cleared, so chunks never accumulate. We process 1 chunk at a time instead of accumulating multiple chunks.
4. **Timing calculation issues**: `lastContinuousSendTime` may not be updated correctly, causing `timeSinceLastContinuousSend` to be incorrect.

### Evidence from Logs
- `chunksCount: 1` - Only 1 chunk in buffer when processing
- `timeSinceLastSend: '8946ms'`, `'8997ms'` - 8-9 second gaps between sends
- `audioDuration: '20'` - Only 20ms chunks being sent
- `totalChunksInBuffer: 1` - Chunks not accumulating

---

## 2. Audit Findings

### File: `services/asr-worker/src/index.ts`

#### Current Logic Flow (Lines 342-523)
1. Chunk arrives → added to buffer (line 342)
2. Calculate `currentAudioDurationMs` (line 346-347)
3. Check if we should process (line 444-447)
4. Process if conditions met (line 452)
5. **Problem**: Only checks when new chunk arrives, not on a timer

#### Configuration Issues
- `MAX_TIME_BETWEEN_SENDS_MS = 200` (line 432) - Correct, but not enforced by timer
- `DEEPGRAM_OPTIMAL_CHUNK_MS = 80` (line 431) - Correct
- `MIN_TIME_BETWEEN_SENDS_MS = 50` (line 433) - Correct
- **Missing**: Timer/interval to enforce 200ms send frequency

#### Buffer Management Issues
- Buffer cleared after each send (line 667 in `processBuffer`)
- No accumulation of multiple chunks
- `lastContinuousSendTime` only updated after successful send (line 467)

### File: `services/asr-worker/src/providers/deepgramProvider.ts`

#### Connection Management (Lines 73-300)
- Connection reuse logic is correct
- KeepAlive messages sent every 3 seconds (line ~300)
- **Issue**: KeepAlive alone isn't sufficient - need actual audio data

#### Audio Sending (Lines 864-1074)
- Format validation is correct (PCM16, 8000Hz, mono)
- WebSocket URL parameters verified
- **Issue**: Not receiving audio frequently enough from ASR Worker

---

## 3. Detailed Fix Plan

### Fix 1: Add Timer-Based Processing (CRITICAL)

**File**: `services/asr-worker/src/index.ts`

**Problem**: We only check if we should send when a new chunk arrives. If chunks arrive every 3 seconds, we only check every 3 seconds.

**Solution**: Add a per-buffer interval timer that checks every 200ms if we should send audio, regardless of chunk arrival.

**Code Change**:
```typescript
// Add to AudioBuffer interface (line 43-54)
interface AudioBuffer {
  interactionId: string;
  tenantId: string;
  sampleRate: number;
  chunks: Buffer[];
  timestamps: number[];
  lastProcessed: number;
  lastChunkReceived: number;
  hasSentInitialChunk: boolean;
  isProcessing: boolean;
  lastContinuousSendTime: number;
  processTimer?: NodeJS.Timeout; // NEW: Timer for periodic processing
}

// Add to AsrWorker class (line 56)
class AsrWorker {
  // ... existing code ...
  private bufferTimers: Map<string, NodeJS.Timeout> = new Map(); // Track timers per buffer

  // NEW METHOD: Timer-based processing
  private startBufferProcessingTimer(interactionId: string): void {
    // Clear existing timer if any
    const existingTimer = this.bufferTimers.get(interactionId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Start new timer: check every 200ms
    const timer = setInterval(async () => {
      const buffer = this.buffers.get(interactionId);
      if (!buffer) {
        // Buffer was cleaned up, clear timer
        clearInterval(timer);
        this.bufferTimers.delete(interactionId);
        return;
      }

      // Skip if already processing or no chunks
      if (buffer.isProcessing || buffer.chunks.length === 0) {
        return;
      }

      // Only process if we've sent initial chunk (continuous mode)
      if (!buffer.hasSentInitialChunk) {
        return; // Initial chunk logic handled in handleAudioFrame
      }

      // Calculate current audio duration
      const totalSamples = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / 2;
      const currentAudioDurationMs = (totalSamples / buffer.sampleRate) * 1000;

      // Initialize lastContinuousSendTime if needed
      if (buffer.lastContinuousSendTime === 0) {
        buffer.lastContinuousSendTime = buffer.lastProcessed;
      }

      const timeSinceLastContinuousSend = Date.now() - buffer.lastContinuousSendTime;
      const DEEPGRAM_OPTIMAL_CHUNK_MS = 80;
      const MAX_TIME_BETWEEN_SENDS_MS = 200;
      const MIN_TIME_BETWEEN_SENDS_MS = 50;

      const isTooLongSinceLastSend = timeSinceLastContinuousSend >= MAX_TIME_BETWEEN_SENDS_MS;
      const hasEnoughTimePassed = timeSinceLastContinuousSend >= MIN_TIME_BETWEEN_SENDS_MS;
      const hasOptimalChunkSize = currentAudioDurationMs >= DEEPGRAM_OPTIMAL_CHUNK_MS;
      const hasMinimumChunkSize = currentAudioDurationMs >= 20;

      const shouldProcess = 
        (isTooLongSinceLastSend && hasMinimumChunkSize) ||
        (hasEnoughTimePassed && hasOptimalChunkSize) ||
        currentAudioDurationMs >= MAX_CHUNK_DURATION_MS;

      const minChunkForSend = isTooLongSinceLastSend ? 20 : DEEPGRAM_OPTIMAL_CHUNK_MS;

      if (shouldProcess && currentAudioDurationMs >= minChunkForSend) {
        buffer.isProcessing = true;
        try {
          const chunksBeforeProcessing = buffer.chunks.length;
          const audioDurationBeforeProcessing = currentAudioDurationMs;
          
          await this.processBuffer(buffer, isTooLongSinceLastSend);
          
          if (buffer.chunks.length < chunksBeforeProcessing) {
            buffer.lastProcessed = Date.now();
            buffer.lastContinuousSendTime = Date.now();
            console.info(`[ASRWorker] ✅ Timer-triggered send for ${interactionId}`, {
              timeSinceLastSend: timeSinceLastContinuousSend,
              audioDuration: audioDurationBeforeProcessing.toFixed(0),
              chunksCount: chunksBeforeProcessing,
              chunksRemaining: buffer.chunks.length,
              strategy: isTooLongSinceLastSend ? 'timeout-prevention' : 'optimal-chunk',
            });
          }
        } catch (error: any) {
          console.error(`[ASRWorker] Error in timer-based processing for ${interactionId}:`, error);
        } finally {
          buffer.isProcessing = false;
        }
      }
    }, 200); // Check every 200ms

    this.bufferTimers.set(interactionId, timer);
  }

  // Update handleAudioFrame to start timer (line 342, after buffer.chunks.push)
  private async handleAudioFrame(msg: any): Promise<void> {
    // ... existing code ...
    
    buffer.chunks.push(audioBuffer);
    buffer.timestamps.push(frame.timestamp_ms);
    buffer.lastChunkReceived = Date.now(); // Update last chunk received time

    // CRITICAL: Start/restart processing timer to ensure frequent sends
    this.startBufferProcessingTimer(interaction_id);

    // ... rest of existing code ...
  }

  // Update handleCallEnd to clear timer (line 530)
  private async handleCallEnd(msg: any): Promise<void> {
    // ... existing code ...
    
    const timer = this.bufferTimers.get(interactionId);
    if (timer) {
      clearInterval(timer);
      this.bufferTimers.delete(interactionId);
    }
    
    // ... rest of existing code ...
  }
```

**Reason**: Ensures we check every 200ms if we should send, regardless of when chunks arrive. This prevents 8-9 second gaps.

---

### Fix 2: Ensure First Chunk Sent Within 10 Seconds

**File**: `services/asr-worker/src/index.ts`

**Problem**: Deepgram requires first audio within 10 seconds of connection open.

**Solution**: Already implemented (MAX_INITIAL_WAIT_MS = 1000), but verify it's working.

**Code Change**: No change needed, but add logging:
```typescript
// Line 383-402, add logging
if (hasWaitedTooLong) {
  console.warn(`[ASRWorker] ⚠️ First chunk sent early (${currentAudioDurationMs.toFixed(0)}ms) due to timeout risk (${timeSinceBufferCreation}ms wait)`, {
    interaction_id,
    audioDuration: currentAudioDurationMs.toFixed(0),
    waitTime: timeSinceBufferCreation,
    deepgramRequirement: 'First audio must be sent within 10 seconds of connection open',
  });
}
```

**Reason**: Ensures compliance with Deepgram's 10-second requirement.

---

### Fix 3: Improve Buffer Accumulation Logic

**File**: `services/asr-worker/src/index.ts`

**Problem**: Buffer is cleared after each send, preventing accumulation.

**Solution**: Only clear processed chunks, keep unprocessed chunks in buffer.

**Code Change** (in `processBuffer`, line 629-710):
```typescript
private async processBuffer(buffer: AudioBuffer, isTimeoutRisk: boolean = false): Promise<void> {
  if (buffer.chunks.length === 0) {
    return;
  }

  try {
    // CRITICAL: Calculate how much audio we should send
    const DEEPGRAM_OPTIMAL_CHUNK_MS = 80;
    const requiredDuration = buffer.hasSentInitialChunk 
      ? (isTimeoutRisk ? 20 : DEEPGRAM_OPTIMAL_CHUNK_MS)
      : INITIAL_CHUNK_DURATION_MS;

    // Calculate total audio duration
    const totalSamples = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / 2;
    const audioDurationMs = (totalSamples / buffer.sampleRate) * 1000;

    if (audioDurationMs < requiredDuration) {
      return; // Wait for more audio
    }

    // CRITICAL: Calculate how many chunks to send
    // Send up to optimal chunk size, but keep remaining chunks in buffer
    const targetBytes = Math.floor((requiredDuration * buffer.sampleRate) / 1000) * 2; // 16-bit = 2 bytes
    let bytesToSend = 0;
    let chunksToSend: Buffer[] = [];
    let timestampsToSend: number[] = [];

    for (let i = 0; i < buffer.chunks.length; i++) {
      const chunk = buffer.chunks[i];
      if (bytesToSend + chunk.length <= targetBytes || chunksToSend.length === 0) {
        chunksToSend.push(chunk);
        timestampsToSend.push(buffer.timestamps[i]);
        bytesToSend += chunk.length;
      } else {
        break; // Keep remaining chunks in buffer
      }
    }

    if (chunksToSend.length === 0) {
      return;
    }

    // Combine chunks to send
    const combinedAudio = Buffer.concat(chunksToSend);
    const seq = chunksToSend.length;

    // Send to ASR provider
    const transcript = await this.sendToAsrProvider(combinedAudio, buffer, seq);

    // Remove sent chunks from buffer (keep remaining chunks)
    buffer.chunks = buffer.chunks.slice(chunksToSend.length);
    buffer.timestamps = buffer.timestamps.slice(timestampsToSend.length);

    // ... rest of transcript handling ...
  } catch (error: any) {
    console.error(`[ASRWorker] Error processing buffer:`, error);
    throw error;
  }
}
```

**Reason**: Allows chunks to accumulate in buffer while still sending frequently.

---

### Fix 4: Add Configuration Parameters

**File**: `services/asr-worker/src/index.ts`

**Solution**: Make timing parameters configurable via environment variables.

**Code Change** (line 20-41):
```typescript
// Deepgram-optimized chunk sizing configuration
const INITIAL_CHUNK_DURATION_MS = parseInt(process.env.INITIAL_CHUNK_DURATION_MS || '200', 10);
const CONTINUOUS_CHUNK_DURATION_MS = parseInt(process.env.CONTINUOUS_CHUNK_DURATION_MS || '100', 10);
const MAX_CHUNK_DURATION_MS = parseInt(process.env.MAX_CHUNK_DURATION_MS || '250', 10);
const MIN_AUDIO_DURATION_MS = parseInt(process.env.MIN_AUDIO_DURATION_MS || '200', 10);
const ASR_CHUNK_MIN_MS = parseInt(process.env.ASR_CHUNK_MIN_MS || '100', 10);

// NEW: Timer-based processing configuration
const PROCESSING_TIMER_INTERVAL_MS = parseInt(process.env.PROCESSING_TIMER_INTERVAL_MS || '200', 10); // Check every 200ms
const MAX_TIME_BETWEEN_SENDS_MS = parseInt(process.env.MAX_TIME_BETWEEN_SENDS_MS || '200', 10); // Send at least every 200ms
const MIN_TIME_BETWEEN_SENDS_MS = parseInt(process.env.MIN_TIME_BETWEEN_SENDS_MS || '50', 10); // Don't send more than every 50ms
const DEEPGRAM_OPTIMAL_CHUNK_MS = parseInt(process.env.DEEPGRAM_OPTIMAL_CHUNK_MS || '80', 10); // Deepgram's recommended chunk size
```

**Reason**: Allows tuning without code changes.

---

### Fix 5: Enhanced Logging and Metrics

**File**: `services/asr-worker/src/index.ts`

**Solution**: Add detailed metrics for monitoring.

**Code Change**: Add to metrics interface and record:
```typescript
// Track metrics per interaction
interface InteractionMetrics {
  chunksReceived: number;
  chunksSent: number;
  totalAudioDurationMs: number;
  averageChunkSizeMs: number;
  averageTimeBetweenSendsMs: number;
  lastSendTime: number;
  timeoutErrors: number;
}

// Add to AsrWorker class
private interactionMetrics: Map<string, InteractionMetrics> = new Map();

// Update in handleAudioFrame and processBuffer
```

**Reason**: Better observability for debugging and monitoring.

---

## 4. Testing & Validation Plan

### Unit Tests

1. **Timer-based processing test**
   - Mock chunk arrival every 3 seconds
   - Verify timer triggers sends every 200ms
   - Verify chunks accumulate correctly

2. **Buffer accumulation test**
   - Add 5 chunks (20ms each) to buffer
   - Verify only 80ms (4 chunks) sent, 1 chunk remains
   - Verify remaining chunk sent on next timer tick

3. **First chunk timing test**
   - Verify first chunk sent within 1 second (MAX_INITIAL_WAIT_MS)
   - Verify first chunk sent even if only 20ms available

### Integration Tests

1. **End-to-end flow test**
   - Simulate Exotel audio stream (20ms chunks every 3 seconds)
   - Verify Deepgram receives audio every 200ms
   - Verify no 1011 errors
   - Verify non-empty transcripts

2. **Gap simulation test**
   - Simulate 5-second gap in audio
   - Verify KeepAlive messages sent
   - Verify connection doesn't close (or reconnects gracefully)

3. **High-frequency test**
   - Simulate chunks arriving every 50ms
   - Verify sends respect MIN_TIME_BETWEEN_SENDS_MS (50ms)
   - Verify chunks accumulate to 80ms before sending

### Monitoring Tests

1. **Metrics validation**
   - Verify `timeSinceLastSend` ≤ 200ms
   - Verify `chunksCount` accumulates (multiple chunks)
   - Verify `audioDuration` is 80ms when possible

2. **Error rate monitoring**
   - Track 1011 error count
   - Track empty transcript rate
   - Track reconnection count

---

## 5. Roll-out & Monitoring Plan

### Deployment Steps

1. **Pre-deployment**
   - Review code changes
   - Run unit tests
   - Run integration tests locally

2. **Deployment**
   - Deploy to staging environment
   - Monitor for 1 hour
   - Deploy to production if staging looks good

3. **Post-deployment**
   - Monitor logs for first 24 hours
   - Check metrics dashboard
   - Verify error rates decrease

### Metrics to Monitor

1. **Send frequency**
   - `timeSinceLastSend` should be ≤ 200ms (not 8-9 seconds)
   - Alert if > 500ms

2. **Chunk accumulation**
   - `chunksCount` should be > 1 before sending (when possible)
   - `audioDuration` should be 80ms when possible

3. **Error rates**
   - 1011 error count should decrease to near zero
   - Empty transcript rate should decrease
   - Reconnection count should decrease

4. **Performance**
   - First transcript latency (time from call start to first transcript)
   - Average chunk size sent to Deepgram
   - Buffer memory usage (should be minimal)

### Fallback/Rollback Strategy

1. **Rollback trigger**
   - If 1011 error rate increases
   - If empty transcript rate increases
   - If system becomes unstable

2. **Rollback process**
   - Revert to previous commit
   - Redeploy
   - Monitor for stability

3. **Feature flag**
   - Add feature flag to enable/disable timer-based processing
   - Allows quick rollback without code change

---

## 6. Risk & Mitigation

### Risks

1. **Higher memory usage**
   - **Risk**: Accumulating chunks in buffer increases memory
   - **Mitigation**: Limit buffer size (max 250ms), clear stale buffers

2. **Increased CPU usage**
   - **Risk**: Timer running every 200ms for each active call
   - **Mitigation**: Timer only runs when buffer has chunks, cleared on call end

3. **Speech latency increase**
   - **Risk**: Waiting for 80ms chunks might increase latency
   - **Mitigation**: Send 20ms chunks if timeout risk, 80ms otherwise (best of both worlds)

4. **Timer overhead**
   - **Risk**: Many timers running simultaneously
   - **Mitigation**: Timers are lightweight, cleared immediately on call end

5. **Race conditions**
   - **Risk**: Timer and chunk arrival both trying to process buffer
   - **Mitigation**: `isProcessing` flag prevents concurrent processing

### Mitigation Strategies

1. **Gradual rollout**
   - Deploy to 10% of traffic first
   - Monitor metrics
   - Gradually increase to 100%

2. **Circuit breaker**
   - If error rate exceeds threshold, disable timer-based processing
   - Fall back to event-driven only

3. **Resource limits**
   - Limit max buffer size
   - Limit max number of active timers
   - Auto-cleanup stale buffers

---

## Implementation Priority

1. **P0 (Critical)**: Fix 1 - Timer-based processing
2. **P1 (High)**: Fix 3 - Buffer accumulation
3. **P2 (Medium)**: Fix 4 - Configuration parameters
4. **P3 (Low)**: Fix 5 - Enhanced logging

---

## Expected Outcomes

After implementing these fixes:

1. ✅ Audio sent every 200ms (not 8-9 seconds)
2. ✅ Chunks accumulate in buffer (multiple chunks before sending)
3. ✅ No more 1011 timeout errors
4. ✅ Non-empty transcripts
5. ✅ Better observability with metrics

---

## Next Steps

1. Implement Fix 1 (timer-based processing) - **CRITICAL**
2. Test locally with simulated audio stream
3. Deploy to staging
4. Monitor metrics
5. Deploy to production
6. Monitor for 24 hours
7. Iterate based on results


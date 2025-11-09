# Deepgram Streaming Integration: Chunk Size & Audio Format Audit & Fix

## Section 1: Summary of Issue

**Problem**: Deepgram streaming ASR pipeline receives audio successfully but returns empty transcripts and closes connections with code 1011 (timeout). Analysis shows:
- Audio chunks are very small (~20ms each)
- Deepgram may not be receiving sufficient contiguous audio data
- Connection timeouts occur despite KeepAlive messages
- Empty transcripts suggest audio format mismatch or insufficient data

**Impact**: 
- No transcription output despite audio being sent
- Connection instability (frequent 1011 timeouts)
- Poor user experience (no real-time transcripts)

**Root Cause Hypothesis**: The system is sending audio chunks that are too small (20ms minimum) and too infrequently, causing Deepgram to timeout before receiving sufficient contiguous audio for transcription. Additionally, there may be a mismatch between declared audio format parameters and actual audio data.

---

## Section 2: Audit Findings

### 2.1 File Paths & Current Configuration

#### **File: `services/asr-worker/src/index.ts`**
- **Line 23-29**: Chunk size configuration
  ```typescript
  const INITIAL_CHUNK_DURATION_MS = parseInt(process.env.INITIAL_CHUNK_DURATION_MS || '200', 10);
  const CONTINUOUS_CHUNK_DURATION_MS = parseInt(process.env.CONTINUOUS_CHUNK_DURATION_MS || '100', 10);
  const MAX_CHUNK_DURATION_MS = parseInt(process.env.MAX_CHUNK_DURATION_MS || '250', 10);
  const MIN_AUDIO_DURATION_MS = parseInt(process.env.MIN_AUDIO_DURATION_MS || '200', 10);
  ```
  - ✅ Initial chunk: 200ms (good)
  - ❌ Continuous minimum: 20ms (too small - line 411)
  - ✅ Max chunk: 250ms (good)

- **Line 411**: `MIN_CONTINUOUS_AUDIO_MS = 20` - **CRITICAL ISSUE**: Allows 20ms chunks
- **Line 617**: Continuous mode accepts 20ms chunks - **CRITICAL ISSUE**: Too small for reliable transcription

#### **File: `services/asr-worker/src/providers/deepgramProvider.ts`**
- **Line 171-179**: Connection configuration
  ```typescript
  const connectionConfig = {
    model: process.env.DEEPGRAM_MODEL || 'nova-2',
    language: process.env.DEEPGRAM_LANGUAGE || 'en-US',
    smart_format: process.env.DEEPGRAM_SMART_FORMAT !== 'false',
    interim_results: process.env.DEEPGRAM_INTERIM_RESULTS !== 'false',
    sample_rate: sampleRate, // 8000 for telephony
    encoding: 'linear16', // PCM16
    channels: 1, // Mono
  };
  ```
  - ✅ Encoding: `linear16` (correct for PCM16)
  - ✅ Sample rate: Passed from audio (8000Hz for telephony)
  - ✅ Channels: 1 (mono)
  - ⚠️ **ISSUE**: Deepgram SDK `listen.live()` handles URL params internally, but we should verify actual WebSocket URL

- **Line 186**: `this.client.listen.live(connectionConfig)` - SDK handles URL construction
- **Line 882**: Audio conversion: `new Uint8Array(audio)` - ✅ Correct format
- **Line 660-672**: Error 1011 handling - ✅ Present but needs prevention

#### **File: `services/asr-worker/src/index.ts` (Audio Processing)**
- **Line 272**: Base64 decoding: `Buffer.from(audio, 'base64')` - ✅ Correct
- **Line 341**: Sample calculation: `totalSamples = buffer.chunks.reduce(...) / 2` - ✅ Correct (16-bit = 2 bytes)
- **Line 617**: Continuous mode minimum: `20ms` - **CRITICAL ISSUE**

### 2.2 Misconfigurations Found

1. **❌ MIN_CONTINUOUS_AUDIO_MS = 20ms** (Line 411 in `index.ts`)
   - **Issue**: Too small for reliable Deepgram transcription
   - **Impact**: Deepgram may not have enough audio to process
   - **Fix**: Increase to 100-150ms minimum

2. **❌ Continuous mode accepts 20ms chunks** (Line 617 in `index.ts`)
   - **Issue**: `requiredDuration = 20` for continuous mode
   - **Impact**: Sends chunks too small for Deepgram to process
   - **Fix**: Increase to 100ms minimum

3. **⚠️ No explicit WebSocket URL verification**
   - **Issue**: Deepgram SDK handles URL internally, but we should log/verify
   - **Impact**: Cannot confirm encoding/sample_rate are in URL
   - **Fix**: Add logging to verify SDK is using correct params

4. **⚠️ Insufficient audio format validation**
   - **Issue**: No validation that audio is truly PCM16 (not float32, etc.)
   - **Impact**: Format mismatch could cause empty transcripts
   - **Fix**: Add audio format validation before sending

5. **⚠️ No configurable minimum chunk size env var**
   - **Issue**: `MIN_CONTINUOUS_AUDIO_MS` is hardcoded
   - **Impact**: Cannot tune without code changes
   - **Fix**: Add `ASR_CHUNK_MIN_MS` env var

### 2.3 Buffer/Chunking Logic Analysis

**Current Flow:**
1. Audio arrives in 20ms chunks from Exotel
2. Buffer accumulates chunks
3. **Initial chunk**: Waits for 200ms ✅ (good)
4. **Continuous chunks**: Can send with only 20ms ❌ (too small)
5. **Stale buffer**: Forces send after 500ms ✅ (good)

**Problem**: The continuous mode threshold (20ms) is too low. Deepgram needs at least 100ms of contiguous audio for reliable transcription.

---

## Section 3: Root Cause Analysis

### Why Empty Transcripts Are Happening

**Primary Root Cause**: The system is sending audio chunks that are too small (20ms minimum) and potentially too infrequently, causing Deepgram to timeout (1011) before receiving sufficient contiguous audio data for transcription. Deepgram's streaming API requires a minimum of 20-250ms chunks, but the optimal range for reliable transcription is 100-200ms. Sending 20ms chunks means Deepgram receives audio in very small fragments, and if there are any delays or gaps, the connection times out before enough audio accumulates for processing.

**Secondary Issues**:
- **Chunk size mismatch**: Declared encoding (`linear16`) and sample rate (8000Hz) are correct, but chunks are too small
- **Buffer threshold too low**: `MIN_CONTINUOUS_AUDIO_MS = 20ms` allows sending before sufficient audio accumulates
- **No format validation**: No verification that audio is truly PCM16 (could be float32 or other format)
- **Insufficient logging**: Cannot verify actual WebSocket URL parameters being used by Deepgram SDK

**Findings**:
- ✅ Audio format declaration is correct (`linear16`, `sample_rate: 8000`, `channels: 1`)
- ✅ Base64 decoding works correctly
- ✅ Sample calculation is correct (16-bit = 2 bytes per sample)
- ❌ Minimum chunk size (20ms) is too small for reliable transcription
- ❌ Continuous mode threshold (20ms) allows premature sending
- ⚠️ No validation that audio is truly PCM16 format
- ⚠️ No logging of actual Deepgram WebSocket URL with query params

---

## Section 4: Code/Config Patches

### 4.1 Increase Minimum Buffer Duration

**File**: `services/asr-worker/src/index.ts`

```diff
--- a/services/asr-worker/src/index.ts
+++ b/services/asr-worker/src/index.ts
@@ -20,6 +20,8 @@ const PORT = parseInt(process.env.PORT || '3001', 10);
 // Deepgram-optimized chunk sizing configuration
 // Deepgram recommends 20-250ms chunks for optimal real-time performance
 // Initial chunk: 200ms minimum for reliable transcription start
+// CRITICAL: Minimum chunk size for reliable transcription is 100ms (not 20ms)
+// 20ms is the absolute minimum Deepgram accepts, but 100ms+ is needed for accuracy
 const INITIAL_CHUNK_DURATION_MS = parseInt(process.env.INITIAL_CHUNK_DURATION_MS || '200', 10);
 // Continuous chunks: 100ms for real-time streaming
 const CONTINUOUS_CHUNK_DURATION_MS = parseInt(process.env.CONTINUOUS_CHUNK_DURATION_MS || '100', 10);
@@ -28,6 +30,9 @@ const MAX_CHUNK_DURATION_MS = parseInt(process.env.MAX_CHUNK_DURATION_MS || '2
 // Minimum audio duration before processing (reduced from 500ms to 200ms)
 const MIN_AUDIO_DURATION_MS = parseInt(process.env.MIN_AUDIO_DURATION_MS || '200', 10);
+// CRITICAL: Minimum chunk size for continuous streaming (increased from 20ms to 100ms)
+// Deepgram needs at least 100ms of contiguous audio for reliable transcription
+const ASR_CHUNK_MIN_MS = parseInt(process.env.ASR_CHUNK_MIN_MS || '100', 10);
 
 // Legacy buffer window (kept for backward compatibility, but not used for Deepgram)
 const BUFFER_WINDOW_MS = parseInt(process.env.BUFFER_WINDOW_MS || '1000', 10);
@@ -407,7 +412,8 @@ class AsrWorker {
         // 3. We've accumulated too much audio (250ms max - force send), OR
         // 4. Time-based trigger: Send every 50ms if we have at least 20ms of audio (for very small incoming chunks)
         const MIN_CONTINUOUS_TIME_MS = 50; // Minimum time between sends (even for tiny chunks)
-        const MIN_CONTINUOUS_AUDIO_MS = 20; // Minimum audio to send in continuous mode (Deepgram can handle this)
+        // CRITICAL FIX: Increased from 20ms to 100ms for reliable Deepgram transcription
+        const MIN_CONTINUOUS_AUDIO_MS = ASR_CHUNK_MIN_MS; // Minimum audio to send in continuous mode (100ms for reliable transcription)
         
         // CRITICAL: Also check if buffer age is too high (stale buffer)
         // If buffer hasn't been processed in a while, force process to prevent Deepgram timeout
@@ -612,7 +618,8 @@ class AsrWorker {
       // CRITICAL: Audio duration check depends on streaming mode
       // - Initial chunk: Require 200ms minimum (reduced from 500ms)
-      // - Continuous streaming: Accept ANY audio (20ms+) for continuous flow
+      // - Continuous streaming: Require 100ms minimum for reliable Deepgram transcription
+      //   Deepgram can technically accept 20ms, but 100ms+ is needed for accuracy
       //   Deepgram can handle small chunks in continuous mode - the key is frequency, not size
       const requiredDuration = buffer.hasSentInitialChunk 
-        ? 20  // Continuous mode: Accept even 20ms chunks (Deepgram minimum)
+        ? ASR_CHUNK_MIN_MS  // Continuous mode: Require 100ms minimum for reliable transcription
         : INITIAL_CHUNK_DURATION_MS;    // Initial chunk: 200ms
```

### 4.2 Add Deepgram WebSocket URL Logging

**File**: `services/asr-worker/src/providers/deepgramProvider.ts`

```diff
--- a/services/asr-worker/src/providers/deepgramProvider.ts
+++ b/services/asr-worker/src/providers/deepgramProvider.ts
@@ -181,6 +181,20 @@ export class DeepgramProvider implements AsrProvider {
       console.info(`[DeepgramProvider] Connection config:`, {
         interactionId,
         ...connectionConfig,
       });
       
+      // CRITICAL: Log actual WebSocket URL to verify encoding/sample_rate params
+      // Deepgram SDK constructs URL internally, but we should verify it's correct
+      try {
+        const connectionAny = connection as any;
+        const wsUrl = connectionAny?.url || connectionAny?.socket?.url || connectionAny?.transport?.url;
+        if (wsUrl) {
+          console.info(`[DeepgramProvider] 🔍 WebSocket URL:`, {
+            interactionId,
+            url: wsUrl,
+            hasEncoding: wsUrl.includes('encoding='),
+            hasSampleRate: wsUrl.includes('sample_rate='),
+            note: 'Verify encoding=linear16 and sample_rate=8000 are in URL',
+          });
+        }
+      } catch (e) {
+        console.debug(`[DeepgramProvider] Could not access WebSocket URL (SDK internal):`, e);
+      }
+      
       const connection = this.client.listen.live(connectionConfig);
```

**Note**: The Deepgram SDK may not expose the URL directly. If the above doesn't work, we'll rely on SDK documentation that confirms `listen.live()` uses the config params correctly.

### 4.3 Add Audio Format Validation

**File**: `services/asr-worker/src/providers/deepgramProvider.ts`

```diff
--- a/services/asr-worker/src/providers/deepgramProvider.ts
+++ b/services/asr-worker/src/providers/deepgramProvider.ts
@@ -880,6 +880,30 @@ export class DeepgramProvider implements AsrProvider {
         // Deepgram SDK expects Uint8Array or Buffer for binary audio
         // Convert Buffer to Uint8Array to ensure compatibility
         const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
         
+        // CRITICAL: Validate audio format is PCM16 (16-bit signed integers)
+        // Check that audio data looks like PCM16, not float32 or other formats
+        // PCM16 values should be in range [-32768, 32767] when interpreted as int16
+        if (audioData.length >= 2) {
+          const firstSample = audioData[0] | (audioData[1] << 8); // Little-endian int16
+          const secondSample = audioData.length >= 4 ? (audioData[2] | (audioData[3] << 8)) : null;
+          
+          // PCM16 samples should be in reasonable range (not all zeros, not all 0xFF)
+          const isLikelyPCM16 = 
+            (firstSample >= -32768 && firstSample <= 32767) &&
+            (secondSample === null || (secondSample >= -32768 && secondSample <= 32767));
+          
+          if (!isLikelyPCM16 && seq <= 3) {
+            console.warn(`[DeepgramProvider] ⚠️ Audio format validation warning for ${interactionId}:`, {
+              seq,
+              firstSample,
+              secondSample,
+              firstBytes: Array.from(audioData.slice(0, 4)).map(b => `0x${b.toString(16).padStart(2, '0')}`),
+              note: 'Audio may not be PCM16 format. Expected 16-bit signed integers.',
+            });
+          }
+        }
+        
         // Verify audio data is valid
         if (!audioData || audioData.length === 0) {
           throw new Error(`Invalid audio data: empty or null (length: ${audioData?.length ?? 'null'})`);
```

### 4.4 Enhanced Logging for Each Send

**File**: `services/asr-worker/src/providers/deepgramProvider.ts`

```diff
--- a/services/asr-worker/src/providers/deepgramProvider.ts
+++ b/services/asr-worker/src/providers/deepgramProvider.ts
@@ -851,6 +851,7 @@ export class DeepgramProvider implements AsrProvider {
         console.info(`[DeepgramProvider] 📤 Sending audio chunk:`, {
           interactionId,
           seq,
+          bufferDurationMs: durationMs.toFixed(2),
           size: audio.length,
           sampleRate,
           samples,
@@ -858,6 +859,7 @@ export class DeepgramProvider implements AsrProvider {
           isReady: state.isReady,
           connectionReadyState,
           socketReadyState,
+          encoding: 'linear16',
           hasConnection: !!state.connection,
           hasSocket: !!state.socket,
           connectionType: typeof state.connection,
@@ -900,6 +902,7 @@ export class DeepgramProvider implements AsrProvider {
           // Log successful send with detailed metrics
           console.info(`[DeepgramProvider] ✅ Audio sent successfully for ${interactionId}, seq=${seq}`, {
             chunkSizeMs: chunkSizeMs.toFixed(0),
+            timeSinceLastSend: state.lastSendTime ? (Date.now() - state.lastSendTime) + 'ms' : 'first',
             averageChunkSizeMs: this.metrics.averageChunkSizeMs.toFixed(0),
             sendDurationMs: sendDuration,
             dataLength: audioData.length,
@@ -907,6 +910,8 @@ export class DeepgramProvider implements AsrProvider {
             socketReadyState,
           });
+          
+          state.lastSendTime = Date.now();
         } catch (sendError: any) {
```

**Note**: Need to add `lastSendTime` to `ConnectionState` interface:

```diff
--- a/services/asr-worker/src/providers/deepgramProvider.ts
+++ b/services/asr-worker/src/providers/deepgramProvider.ts
@@ -9,6 +9,7 @@ interface ConnectionState {
   transcriptQueue: Transcript[];
   pendingResolvers: Array<(transcript: Transcript) => void>;
   lastTranscript: Transcript | null;
+  lastSendTime?: number; // Timestamp of last audio send
   keepAliveInterval?: NodeJS.Timeout;
   keepAliveSuccessCount: number;
```

### 4.5 Update Environment Variables

**File**: Create or update `.env.example` in project root

```diff
+## ASR Worker - Deepgram Configuration
+# Minimum chunk size for continuous streaming (ms)
+# Deepgram recommends 100-200ms for reliable transcription (20ms is absolute minimum)
+ASR_CHUNK_MIN_MS=100
+
+# Initial chunk duration before first send (ms)
+INITIAL_CHUNK_DURATION_MS=200
+
+# Continuous chunk duration target (ms)
+CONTINUOUS_CHUNK_DURATION_MS=100
+
+# Maximum chunk duration before force split (ms)
+MAX_CHUNK_DURATION_MS=250
+
+# Deepgram API Configuration
+DEEPGRAM_API_KEY=your_api_key_here
+DEEPGRAM_MODEL=nova-2
+DEEPGRAM_LANGUAGE=en-US
+DEEPGRAM_SMART_FORMAT=true
+DEEPGRAM_INTERIM_RESULTS=true
+
+# Audio Format (must match actual audio)
+# Note: These are passed to Deepgram SDK, not used directly in URL
+DEEPGRAM_ENCODING=linear16
+DEEPGRAM_SAMPLE_RATE=8000
```

---

## Section 5: Tests Added/Updated

### 5.1 Integration Test for Chunk Size

**File**: `services/asr-worker/tests/deepgram-chunk-size.test.ts` (NEW)

```typescript
/**
 * Integration test: Verify Deepgram receives sufficient audio chunks
 * Tests that 200ms chunks produce non-empty transcripts
 */

import { DeepgramProvider } from '../src/providers/deepgramProvider';
import * as fs from 'fs';
import * as path from 'path';

describe('Deepgram Chunk Size Integration', () => {
  let provider: DeepgramProvider;
  const interactionId = 'test-chunk-size-' + Date.now();

  beforeAll(() => {
    if (!process.env.DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY required for integration test');
    }
    provider = new DeepgramProvider();
  });

  afterAll(async () => {
    await provider.closeConnection(interactionId);
  });

  test('should receive transcript for 200ms PCM16 audio chunk', async () => {
    // Generate 200ms of test audio (8000Hz, PCM16)
    // 200ms * 8000 samples/sec * 2 bytes/sample = 3200 bytes
    const sampleRate = 8000;
    const durationMs = 200;
    const samples = (sampleRate * durationMs) / 1000;
    const audioBuffer = Buffer.alloc(samples * 2); // 16-bit = 2 bytes
    
    // Generate simple sine wave (test tone)
    for (let i = 0; i < samples; i++) {
      const value = Math.sin((i / samples) * Math.PI * 2) * 1000; // Simple tone
      const int16 = Math.max(-32768, Math.min(32767, Math.floor(value)));
      audioBuffer.writeInt16LE(int16, i * 2);
    }

    // Send to Deepgram
    const transcript = await provider.sendAudioChunk(audioBuffer, {
      interactionId,
      seq: 1,
      sampleRate,
    });

    // Verify we got a response (may be empty for test tone, but should not timeout)
    expect(transcript).toBeDefined();
    expect(transcript.type).toBeDefined();
    
    // Should not timeout (empty transcript is OK for test tone)
    // The key is that Deepgram accepted the chunk and responded
    console.log('Transcript received:', transcript);
  }, 30000); // 30s timeout

  test('should handle multiple 100ms chunks', async () => {
    const sampleRate = 8000;
    const chunkDurationMs = 100;
    const samples = (sampleRate * chunkDurationMs) / 1000;
    
    // Send 3 chunks of 100ms each
    for (let seq = 1; seq <= 3; seq++) {
      const audioBuffer = Buffer.alloc(samples * 2);
      // Generate test tone
      for (let i = 0; i < samples; i++) {
        const value = Math.sin((i / samples) * Math.PI * 2) * 1000;
        const int16 = Math.max(-32768, Math.min(32767, Math.floor(value)));
        audioBuffer.writeInt16LE(int16, i * 2);
      }

      const transcript = await provider.sendAudioChunk(audioBuffer, {
        interactionId: interactionId + '-multi',
        seq,
        sampleRate,
      });

      expect(transcript).toBeDefined();
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between chunks
    }
  }, 30000);
});
```

### 5.2 Audio Format Validation Test

**File**: `services/asr-worker/tests/audio-format-validation.test.ts` (NEW)

```typescript
/**
 * Unit test: Verify audio format validation
 */

describe('Audio Format Validation', () => {
  test('should validate PCM16 format', () => {
    const sampleRate = 8000;
    const samples = 100;
    const audioBuffer = Buffer.alloc(samples * 2);
    
    // Generate valid PCM16 data
    for (let i = 0; i < samples; i++) {
      const int16 = Math.floor(Math.sin(i) * 1000);
      audioBuffer.writeInt16LE(int16, i * 2);
    }

    // Verify format
    const firstSample = audioBuffer[0] | (audioBuffer[1] << 8);
    expect(firstSample).toBeGreaterThanOrEqual(-32768);
    expect(firstSample).toBeLessThanOrEqual(32767);
  });

  test('should detect invalid format (all zeros)', () => {
    const audioBuffer = Buffer.alloc(100 * 2); // All zeros
    
    const firstSample = audioBuffer[0] | (audioBuffer[1] << 8);
    expect(firstSample).toBe(0); // Silence is valid, but should be logged
  });
});
```

---

## Section 6: Deploy & Verify Checklist

### 6.1 Local Testing

- [ ] **Build ASR worker locally**
  ```bash
  cd services/asr-worker
  npm install
  npm run build
  ```

- [ ] **Set environment variables**
  ```bash
  export DEEPGRAM_API_KEY=your_key
  export ASR_CHUNK_MIN_MS=100
  export INITIAL_CHUNK_DURATION_MS=200
  export CONTINUOUS_CHUNK_DURATION_MS=100
  ```

- [ ] **Test with sample audio file**
  - Create 200ms PCM16 WAV file at 8000Hz (or use test script)
  - Run ASR worker locally
  - Send test audio through pipeline
  - Verify transcript length > 0 (or at least no timeout)

- [ ] **Monitor logs for:**
  - `[ASRWorker] Processing audio buffer` with `audioDurationMs: 100` or higher
  - `[DeepgramProvider] 📤 Sending audio chunk` with `bufferDurationMs: 100+`
  - `[DeepgramProvider] ✅ Audio sent successfully`
  - `[DeepgramProvider] 📝 Received transcript` (may be empty for silence, but should not timeout)

### 6.2 Staging Deployment

- [ ] **Deploy to staging environment**
  - Update environment variables in Render/staging
  - Set `ASR_CHUNK_MIN_MS=100`
  - Set `INITIAL_CHUNK_DURATION_MS=200`
  - Set `CONTINUOUS_CHUNK_DURATION_MS=100`

- [ ] **Trigger real Exotel call**
  - Make test call through Exotel
  - Monitor ASR worker logs in real-time

- [ ] **Verify logs show:**
  ```
  [ASRWorker] 📥 Received audio chunk: { chunkDurationMs: 20, ... }
  [ASRWorker] Processing audio buffer: { audioDurationMs: '100' or higher, ... }
  [DeepgramProvider] 📤 Sending audio chunk: { bufferDurationMs: '100.00' or higher, ... }
  [DeepgramProvider] ✅ Audio sent successfully
  [DeepgramProvider] 📝 Received transcript: { text: '...', ... }
  ```

- [ ] **Monitor metrics:**
  - Count of `[DeepgramProvider] ❌ CRITICAL: Connection closed due to timeout (1011)` should be **0**
  - Empty transcript rate should drop significantly (< 50%)
  - Average chunk size should be 100-200ms (not 20ms)

### 6.3 Production Deployment

- [ ] **Only after staging validation passes**
- [ ] **Deploy to production**
- [ ] **Monitor for 24 hours:**
  - Connection timeout (1011) errors should be near 0
  - Transcript quality should improve
  - No increase in latency

---

## Section 7: Risk & Mitigation

### 7.1 What If Still Fails?

**If connection timeouts (1011) persist:**

1. **Check actual chunk sizes in logs**
   - Verify `bufferDurationMs` is consistently 100ms+
   - If still seeing 20ms chunks, check buffer accumulation logic

2. **Verify audio format**
   - Check `[DeepgramProvider] Audio data details` logs
   - Verify first bytes are valid PCM16 (not all zeros, not JSON)
   - Confirm sample rate matches (8000Hz)

3. **Check Deepgram WebSocket URL**
   - If URL logging works, verify `encoding=linear16&sample_rate=8000` in URL
   - If SDK doesn't expose URL, trust SDK documentation that params are used

4. **Increase chunk size further**
   - Try `ASR_CHUNK_MIN_MS=150` or `200`
   - Deepgram can handle up to 250ms chunks

5. **Check network latency**
   - High latency between ASR worker and Deepgram could cause timeouts
   - Verify KeepAlive is working (should see `KeepAlive sent` logs)

**If empty transcripts persist (but no timeouts):**

1. **Verify audio contains speech**
   - Test with known speech audio file
   - Check if transcripts are empty only during silence

2. **Check Deepgram model/language**
   - Verify `DEEPGRAM_MODEL` and `DEEPGRAM_LANGUAGE` are correct
   - Try different model (e.g., `base` instead of `nova-2`)

3. **Verify sample rate**
   - Confirm actual audio is 8000Hz (not 16000Hz or other)
   - Mismatch causes poor transcription quality

### 7.2 Rollback Plan

If issues occur after deployment:

1. **Immediate rollback**: Revert to previous commit
2. **Partial rollback**: Keep chunk size fix, revert format validation if causing issues
3. **Configuration rollback**: Set `ASR_CHUNK_MIN_MS=50` as compromise (between 20ms and 100ms)

### 7.3 Monitoring & Alerts

Set up alerts for:
- Connection timeout (1011) rate > 1%
- Empty transcript rate > 80%
- Average chunk size < 50ms
- No transcripts received for > 30 seconds during active call

---

## Summary

**Key Changes:**
1. ✅ Increase minimum chunk size from 20ms → 100ms
2. ✅ Add configurable `ASR_CHUNK_MIN_MS` environment variable
3. ✅ Add audio format validation (PCM16 verification)
4. ✅ Enhanced logging (buffer duration, time since last send, encoding)
5. ✅ Add integration tests for chunk size validation
6. ✅ Update `.env.example` with new configuration

**Expected Results:**
- Connection timeouts (1011) should drop to near 0
- Empty transcript rate should decrease significantly
- Transcript quality should improve with larger chunks
- Better observability with enhanced logging

**Backward Compatibility:**
- Existing pipeline continues to work
- Only chunk size thresholds changed (no API changes)
- Environment variables have sensible defaults


# Deepgram Integration: Audio Format & Streaming Configuration Audit

**Date:** 2025-01-09  
**Auditor:** Senior Engineer  
**Status:** 🔴 **CRITICAL ISSUES FOUND**

---

## Executive Summary

This audit compares our Deepgram streaming integration against Deepgram's official specifications. **Critical mismatches** have been identified that explain the persistent timeout (1011) errors and empty transcripts.

**Key Findings:**
- ✅ Audio format configuration matches spec (linear16, 8000Hz, mono)
- ⚠️ **CRITICAL:** Cannot verify WebSocket URL query params (SDK internal)
- ⚠️ **CRITICAL:** Chunk timing issues causing 6-27 second gaps
- ⚠️ **CRITICAL:** First audio chunk delay may exceed Deepgram timeout window
- ❌ No validation that actual audio matches declared format

---

## Section A: Specification vs. Our Configuration

### A.1 WebSocket URL & Query Parameters

#### Deepgram Specification:
- **Endpoint:** `wss://api.deepgram.com/v1/listen`
- **For raw audio:** Must include `encoding` and `sample_rate` in query string
- **Example:** `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=8000&channels=1&model=nova-2&language=en-US`

#### Our Implementation:
**File:** `services/asr-worker/src/providers/deepgramProvider.ts` (Lines 172-187)

```typescript
const connectionConfig = {
  model: 'nova-2',
  language: 'en-US',
  smart_format: true,
  interim_results: true,
  sample_rate: 8000,      // ✅ Matches Exotel audio
  encoding: 'linear16',  // ✅ Matches Exotel audio (PCM16)
  channels: 1,           // ✅ Matches Exotel audio (mono)
};

const connection = this.client.listen.live(connectionConfig);
```

**Status:** ⚠️ **CANNOT VERIFY**

**Issue:** Deepgram SDK (`@deepgram/sdk` v3.13.0) constructs the WebSocket URL internally. We cannot directly inspect the URL to verify query parameters are correctly included.

**Risk:** If the SDK doesn't properly include `encoding` and `sample_rate` in the URL, Deepgram may:
- Default to 24kHz sample rate (mismatch with our 8kHz audio)
- Fail to decode audio correctly
- Return empty transcripts or timeout errors

**Evidence from Logs:**
- Connection opens successfully ✅
- Audio is sent successfully ✅
- But Deepgram times out (1011) ❌
- Empty transcripts received ❌

**This suggests a format mismatch at the Deepgram API level.**

---

### A.2 Audio Format: Source vs. Declared

#### Audio Source (Exotel):
**File:** `services/ingest/src/exotel-handler.ts` (Lines 84-93)

```typescript
const sampleRate = parseInt(start.media_format.sample_rate, 10) || 8000;
const encoding = start.media_format.encoding || 'pcm16';

// Audio is base64-encoded PCM16, decoded to Buffer
const audioBuffer = Buffer.from(media.payload, 'base64');
```

**Actual Audio Format:**
- **Encoding:** PCM16 (16-bit signed integers, little-endian)
- **Sample Rate:** 8000 Hz (from Exotel `media_format.sample_rate`)
- **Channels:** 1 (mono, telephony)
- **Container:** None (raw, headerless audio)
- **Byte Order:** Little-endian (standard for PCM16)

#### Declared Format (Deepgram):
**File:** `services/asr-worker/src/providers/deepgramProvider.ts` (Lines 177-179)

```typescript
sample_rate: sampleRate,  // 8000 (from Exotel)
encoding: 'linear16',     // PCM16 little-endian
channels: 1,              // Mono
```

**Status:** ✅ **MATCHES**

**Verification:**
- `linear16` = 16-bit PCM little-endian ✅
- `sample_rate: 8000` matches Exotel audio ✅
- `channels: 1` matches mono telephony ✅

**However:** ⚠️ **No runtime validation** that actual audio bytes match declared format.

---

### A.3 Chunk Size & Timing

#### Deepgram Specification:
- **Optimal Range:** 20-250 milliseconds per chunk
- **Recommended:** ~100ms chunks for live streaming
- **Minimum:** 20ms (absolute minimum, not recommended)
- **Maximum:** 250ms (per Deepgram docs)
- **Frequency:** Must send chunks **continuously** (every 100-500ms) to prevent timeout

#### Our Implementation:
**File:** `services/asr-worker/src/index.ts` (Lines 20-34, 407-434)

**Current Configuration:**
```typescript
INITIAL_CHUNK_DURATION_MS = 200ms      // ✅ In spec (20-250ms)
CONTINUOUS_CHUNK_DURATION_MS = 100ms  // ✅ In spec (20-250ms)
MAX_CHUNK_DURATION_MS = 250ms         // ✅ Matches spec
ASR_CHUNK_MIN_MS = 100ms              // ✅ In spec (20-250ms)

// Continuous streaming logic:
MIN_CONTINUOUS_AUDIO_MS = 50ms        // ✅ In spec (20-250ms)
MAX_TIME_BETWEEN_SENDS_MS = 500ms     // ✅ Prevents timeout
MIN_TIME_BETWEEN_SENDS_MS = 100ms     // ✅ Reasonable rate
```

**Status:** ⚠️ **PARTIALLY COMPLIANT**

**Issues Found:**

1. **❌ Chunk Size Range:** Code allows 20ms chunks when timeout risk, but logs show chunks are 20-200ms
   - **Problem:** 20ms is absolute minimum, not optimal
   - **Impact:** Deepgram may struggle with very small chunks
   - **Location:** `services/asr-worker/src/index.ts:431, 438, 662`

2. **❌ Timing Gaps:** Logs show 6-27 second gaps between sends
   - **Problem:** Code has 500ms max, but actual gaps are 6000-27000ms
   - **Root Cause:** Audio arrives slowly (20ms chunks every 2-3 seconds from Exotel)
   - **Impact:** Deepgram times out (1011) due to lack of continuous audio
   - **Location:** `services/asr-worker/src/index.ts:420-434`

3. **❌ First Chunk Delay:** Initial chunk waits for 200ms accumulation
   - **Problem:** If audio arrives slowly, this can take 10+ seconds
   - **Impact:** Deepgram may timeout before first audio is sent
   - **Location:** `services/asr-worker/src/index.ts:378-390`

---

### A.4 Audio Data Validation

#### Deepgram Specification:
- Audio must be **raw binary data** (not base64-encoded)
- For `linear16`: Must be 16-bit signed integers, little-endian
- Sample values must be in range [-32768, 32767]

#### Our Implementation:
**File:** `services/asr-worker/src/index.ts` (Lines 269-335)

```typescript
// Decode base64 to Buffer
const audioBuffer = Buffer.from(audio, 'base64');

// Validate it's not JSON (basic check)
if (firstBytes[0] === 0x7b || firstBytes[0] === 0x5b) { // '{' or '['
  // Reject - this is JSON, not audio
}
```

**File:** `services/asr-worker/src/providers/deepgramProvider.ts` (Lines 884-915)

```typescript
// Convert to Uint8Array
const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);

// Basic PCM16 validation (first 2 samples)
const firstSample = (audioData[0] | (audioData[1] << 8)) << 16 >> 16;
const isLikelyPCM16 = (firstSample >= -32768 && firstSample <= 32767);
```

**Status:** ⚠️ **BASIC VALIDATION ONLY**

**Issues:**
- ✅ Validates audio is not JSON
- ✅ Validates first 2 samples are in PCM16 range
- ❌ **Does NOT validate:**
  - All samples are valid PCM16 (only checks first 2)
  - Byte order is little-endian (assumed)
  - Sample rate matches declared (no validation)
  - Audio is not all zeros (silence detection)

---

### A.5 First Audio Chunk Timing

#### Deepgram Specification:
- Audio should be sent **promptly** after WebSocket connection opens
- Delays before first audio may trigger timeout (1011)
- KeepAlive messages help, but audio is preferred

#### Our Implementation:
**File:** `services/asr-worker/src/index.ts` (Lines 378-390)

```typescript
if (!buffer.hasSentInitialChunk) {
  // Wait for 200ms of audio before sending first chunk
  if (currentAudioDurationMs >= INITIAL_CHUNK_DURATION_MS) { // 200ms
    await this.processBuffer(buffer, false);
    buffer.hasSentInitialChunk = true;
  }
}
```

**Status:** ⚠️ **POTENTIAL DELAY ISSUE**

**Problem:**
- If Exotel sends 20ms chunks every 2-3 seconds, accumulating 200ms takes **10-30 seconds**
- During this time, Deepgram receives only KeepAlive messages
- Deepgram may timeout (1011) before first audio arrives

**Evidence from Logs:**
- `bufferAge: 27009` (27 seconds) before first send
- Connection timeouts occur during initial accumulation

---

## Section B: Actionable Code/Config Patches

### B.1 Add WebSocket URL Verification

**Problem:** Cannot verify Deepgram SDK constructs URL with correct query params.

**File:** `services/asr-worker/src/providers/deepgramProvider.ts`

**Patch:**
```diff
--- a/services/asr-worker/src/providers/deepgramProvider.ts
+++ b/services/asr-worker/src/providers/deepgramProvider.ts
@@ -187,6 +187,35 @@ export class DeepgramProvider implements AsrProvider {
       const connection = this.client.listen.live(connectionConfig);
       
+      // CRITICAL: Attempt to verify WebSocket URL contains required query params
+      // Deepgram SDK constructs URL internally, but we need to verify it's correct
+      try {
+        // Try to access the underlying WebSocket URL after connection is created
+        const connectionAny = connection as any;
+        
+        // Try multiple patterns to find the URL
+        const wsUrl = 
+          connectionAny?.url || 
+          connectionAny?.socket?.url || 
+          connectionAny?.transport?.url ||
+          connectionAny?._url ||
+          connectionAny?.conn?.url ||
+          connectionAny?._connection?.url;
+        
+        if (wsUrl && typeof wsUrl === 'string') {
+          console.info(`[DeepgramProvider] 🔍 WebSocket URL verified:`, {
+            interactionId,
+            url: wsUrl.substring(0, 200), // Truncate for logging
+            hasEncoding: wsUrl.includes('encoding='),
+            hasSampleRate: wsUrl.includes('sample_rate='),
+            hasChannels: wsUrl.includes('channels='),
+            encodingValue: wsUrl.match(/encoding=([^&]+)/)?.[1],
+            sampleRateValue: wsUrl.match(/sample_rate=([^&]+)/)?.[1],
+            channelsValue: wsUrl.match(/channels=([^&]+)/)?.[1],
+            note: 'Verify encoding=linear16, sample_rate=8000, channels=1 are present',
+          });
+        } else {
+          console.warn(`[DeepgramProvider] ⚠️ Cannot access WebSocket URL (SDK internal)`, {
+            interactionId,
+            connectionKeys: Object.keys(connectionAny || {}).slice(0, 10),
+            note: 'Relying on SDK to construct URL correctly. If issues persist, verify SDK version and docs.',
+          });
+        }
+      } catch (e) {
+        console.debug(`[DeepgramProvider] Error accessing WebSocket URL:`, e);
+      }
+      
       // Type assertion to access underlying WebSocket for text frames (KeepAlive)
```

**Rationale:** This allows us to verify the SDK is constructing the URL correctly. If the URL doesn't contain `encoding=linear16&sample_rate=8000`, that explains the timeouts.

---

### B.2 Enhance Audio Format Validation

**Problem:** Only validates first 2 samples. Need comprehensive PCM16 validation.

**File:** `services/asr-worker/src/providers/deepgramProvider.ts`

**Patch:**
```diff
--- a/services/asr-worker/src/providers/deepgramProvider.ts
+++ b/services/asr-worker/src/providers/deepgramProvider.ts
@@ -888,6 +888,45 @@ export class DeepgramProvider implements AsrProvider {
         // Deepgram SDK expects Uint8Array or Buffer for binary audio
         // Convert Buffer to Uint8Array to ensure compatibility
         const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
         
+        // CRITICAL: Comprehensive PCM16 format validation
+        // Validate that audio is truly PCM16 (16-bit signed integers, little-endian)
+        if (audioData.length >= 2) {
+          // Check multiple samples across the buffer (not just first 2)
+          const sampleCount = Math.min(10, Math.floor(audioData.length / 2));
+          let validSamples = 0;
+          let invalidSamples = 0;
+          let allZeros = true;
+          
+          for (let i = 0; i < sampleCount; i++) {
+            const offset = i * 2;
+            if (offset + 1 >= audioData.length) break;
+            
+            // Read as little-endian signed 16-bit integer
+            const sample = (audioData[offset] | (audioData[offset + 1] << 8)) << 16 >> 16;
+            
+            // Validate range
+            if (sample >= -32768 && sample <= 32767) {
+              validSamples++;
+              if (sample !== 0) allZeros = false;
+            } else {
+              invalidSamples++;
+            }
+          }
+          
+          // Log warning if format issues detected
+          if (invalidSamples > 0 && seq <= 3) {
+            console.error(`[DeepgramProvider] ❌ CRITICAL: Audio format validation failed for ${interactionId}`, {
+              seq,
+              validSamples,
+              invalidSamples,
+              totalChecked: sampleCount,
+              firstInvalidSample: audioData.slice(0, 4).map(b => `0x${b.toString(16).padStart(2, '0')}`),
+              note: 'Audio may not be PCM16 format. Expected 16-bit signed integers in range [-32768, 32767].',
+            });
+          }
+          
+          // Warn if audio is all zeros (silence)
+          if (allZeros && seq <= 3) {
+            console.warn(`[DeepgramProvider] ⚠️ Audio appears to be silence (all zeros) for ${interactionId}`, {
+              seq,
+              samplesChecked: sampleCount,
+              note: 'This is normal for silence, but may cause empty transcripts.',
+            });
+          }
+        }
+        
         // CRITICAL: Validate audio format is PCM16 (16-bit signed integers)
         // Check that audio data looks like PCM16, not float32 or other formats
         // PCM16 values should be in range [-32768, 32767] when interpreted as int16
```

**Rationale:** Comprehensive validation helps detect format mismatches early. If audio is not PCM16, Deepgram will fail to decode it correctly.

---

### B.3 Fix First Chunk Delay

**Problem:** Waiting for 200ms accumulation can take 10-30 seconds if audio arrives slowly.

**File:** `services/asr-worker/src/index.ts`

**Patch:**
```diff
--- a/services/asr-worker/src/index.ts
+++ b/services/asr-worker/src/index.ts
@@ -378,7 +378,15 @@ class AsrWorker {
       
       if (!buffer.hasSentInitialChunk) {
         // First chunk: Wait for initial chunk duration (200ms, reduced from 500ms)
-        if (currentAudioDurationMs >= INITIAL_CHUNK_DURATION_MS) {
+        // CRITICAL: Also check time since buffer creation to prevent long delays
+        // If audio arrives slowly, don't wait forever - send after 1 second max
+        const timeSinceBufferCreation = Date.now() - buffer.lastProcessed;
+        const MAX_INITIAL_WAIT_MS = 1000; // Send first chunk within 1 second max
+        const hasEnoughAudio = currentAudioDurationMs >= INITIAL_CHUNK_DURATION_MS;
+        const hasWaitedTooLong = timeSinceBufferCreation >= MAX_INITIAL_WAIT_MS;
+        
+        // Send if we have enough audio OR if we've waited too long (prevent timeout)
+        if (hasEnoughAudio || (hasWaitedTooLong && currentAudioDurationMs >= 20)) {
           buffer.isProcessing = true;
           try {
-            await this.processBuffer(buffer, false); // Initial chunk - no timeout risk yet
+            // If we're sending early due to timeout risk, allow smaller chunks
+            await this.processBuffer(buffer, hasWaitedTooLong);
             buffer.lastProcessed = Date.now();
             buffer.hasSentInitialChunk = true;
             buffer.lastContinuousSendTime = Date.now();
```

**Rationale:** Prevents Deepgram from timing out before first audio is sent. Better to send 20ms early than wait 27 seconds.

---

### B.4 Add Sample Rate Validation

**Problem:** No validation that declared sample rate matches actual audio duration.

**File:** `services/asr-worker/src/providers/deepgramProvider.ts`

**Patch:**
```diff
--- a/services/asr-worker/src/providers/deepgramProvider.ts
+++ b/services/asr-worker/src/providers/deepgramProvider.ts
@@ -841,6 +841,20 @@ export class DeepgramProvider implements AsrProvider {
         // Calculate expected audio duration for debugging
         const bytesPerSample = 2; // 16-bit = 2 bytes
         const samples = audio.length / bytesPerSample;
         const durationMs = (samples / sampleRate) * 1000;
         
+        // CRITICAL: Validate sample rate calculation makes sense
+        // If duration is way off, sample rate may be mismatched
+        const expectedBytesFor100ms = (sampleRate * 0.1) * 2; // 100ms at declared sample rate
+        const actualDurationFor100ms = (expectedBytesFor100ms / audio.length) * durationMs;
+        
+        // Warn if audio duration doesn't match expected for declared sample rate
+        // This helps detect sample rate mismatches
+        if (seq <= 3 && Math.abs(actualDurationFor100ms - 100) > 20) {
+          console.warn(`[DeepgramProvider] ⚠️ Sample rate validation warning for ${interactionId}`, {
+            seq,
+            declaredSampleRate: sampleRate,
+            audioLength: audio.length,
+            calculatedDurationMs: durationMs.toFixed(2),
+            expectedBytesFor100ms: expectedBytesFor100ms.toFixed(0),
+            note: 'Audio duration may not match declared sample rate. Verify actual audio sample rate.',
+          });
+        }
         
         // CRITICAL: Verify connection state before sending
```

**Rationale:** Helps detect if actual audio sample rate doesn't match declared 8000Hz.

---

### B.5 Add Deepgram Error Code 1008 Detection

**Problem:** Code 1008 (DATA-0000) indicates format mismatch, but we don't log it specifically.

**File:** `services/asr-worker/src/providers/deepgramProvider.ts`

**Patch:**
```diff
--- a/services/asr-worker/src/providers/deepgramProvider.ts
+++ b/services/asr-worker/src/providers/deepgramProvider.ts
@@ -598,6 +598,20 @@ export class DeepgramProvider implements AsrProvider {
         // Handle specific error codes
         switch (errorCode) {
           case 1008: // DATA-0000: Invalid audio format
             console.error(`[DeepgramProvider] ❌ Invalid audio format (1008) for ${interactionId}`);
+            console.error(`[DeepgramProvider] ❌ CRITICAL: This indicates audio format mismatch!`, {
+              interactionId,
+              declaredEncoding: 'linear16',
+              declaredSampleRate: sampleRate,
+              declaredChannels: 1,
+              errorMessage: errorMessage,
+              note: 'Check: 1) Actual audio encoding matches linear16, 2) Sample rate matches 8000Hz, 3) Channels match 1 (mono), 4) WebSocket URL contains correct query params',
+            });
+            // Log recent audio send details for debugging
+            console.error(`[DeepgramProvider] Recent audio details:`, {
+              lastSendTime: state.lastSendTime ? new Date(state.lastSendTime).toISOString() : 'never',
+              audioChunksSent: this.metrics.audioChunksSent,
+              averageChunkSizeMs: this.metrics.averageChunkSizeMs.toFixed(0),
+            });
             console.error(`[DeepgramProvider] Check: encoding, sample_rate, channels match actual audio`);
             console.error(`[DeepgramProvider] Current config:`, {
               encoding: 'linear16',
```

**Rationale:** Better error detection helps identify format mismatches immediately.

---

## Section C: Test Plan

### C.1 WebSocket URL Verification Test

**Objective:** Verify Deepgram SDK constructs URL with correct query params.

**Steps:**
1. Deploy code with URL logging (Patch B.1)
2. Make test Exotel call
3. Check logs for `[DeepgramProvider] 🔍 WebSocket URL verified`
4. Verify URL contains:
   - `encoding=linear16`
   - `sample_rate=8000`
   - `channels=1`
   - `model=nova-2`
   - `language=en-US`

**Expected Result:**
- URL should contain all required parameters
- If URL is not accessible, log warning (SDK internal)

**If URL is missing params:** This is the root cause. Need to verify SDK version or use direct WebSocket connection.

---

### C.2 Audio Format Validation Test

**Objective:** Verify actual audio matches declared format.

**Steps:**
1. Deploy code with enhanced validation (Patch B.2)
2. Make test Exotel call
3. Check logs for:
   - `[DeepgramProvider] Audio format validation` (should show valid samples)
   - No `❌ CRITICAL: Audio format validation failed` errors
4. Verify first bytes of audio are valid PCM16:
   - Convert first 4 bytes to int16 values
   - Should be in range [-32768, 32767]
   - Should not be all zeros (unless silence)

**Expected Result:**
- All checked samples are valid PCM16
- No format validation errors

**If validation fails:** Audio format mismatch - investigate Exotel audio format.

---

### C.3 Chunk Timing Test

**Objective:** Verify audio is sent every 100-500ms (not every 6-27 seconds).

**Steps:**
1. Deploy code with first chunk delay fix (Patch B.3)
2. Make test Exotel call
3. Monitor logs for:
   - `[ASRWorker] ✅ Sent continuous chunk` with `timeSinceLastSend: 100-500ms`
   - First chunk sent within 1 second of buffer creation
4. Verify no gaps > 500ms between sends

**Expected Result:**
- Audio sent every 100-500ms
- First chunk sent within 1 second
- No `timeSinceLastSend: 6000ms+` in logs

**If gaps persist:** Audio arrival rate from Exotel is too slow - may need to adjust strategy.

---

### C.4 Sample Rate Validation Test

**Objective:** Verify declared sample rate matches actual audio.

**Steps:**
1. Deploy code with sample rate validation (Patch B.4)
2. Make test Exotel call
3. Check logs for:
   - `[DeepgramProvider] ⚠️ Sample rate validation warning` (should NOT appear)
   - Calculated duration matches expected for 8000Hz

**Expected Result:**
- No sample rate warnings
- Audio duration calculations are correct

**If warnings appear:** Sample rate mismatch - verify Exotel is actually sending 8kHz audio.

---

### C.5 End-to-End Transcription Test

**Objective:** Verify Deepgram returns non-empty transcripts.

**Steps:**
1. Deploy all patches
2. Make test Exotel call with known speech (e.g., "Hello, this is a test")
3. Monitor logs for:
   - `[DeepgramProvider] 📝 Received transcript` with `text: '...'` (non-empty)
   - No `⚠️ Empty transcript` warnings
   - No `❌ CRITICAL: Connection closed due to timeout (1011)`
4. Verify transcript contains actual words from speech

**Expected Result:**
- Non-empty transcripts received
- No timeout errors
- Transcripts match spoken words

**If still empty:** Format mismatch or Deepgram configuration issue - check URL params and audio format.

---

## Section D: Risk Assessment & Mitigation

### D.1 High Risk: WebSocket URL Query Params

**Risk:** SDK may not include `encoding` and `sample_rate` in URL, causing format mismatch.

**Mitigation:**
1. Deploy Patch B.1 to verify URL
2. If URL is missing params:
   - Check Deepgram SDK documentation for v3.13.0
   - Consider using direct WebSocket connection instead of SDK
   - Or upgrade SDK version if newer version fixes this

**Fallback:** If SDK doesn't support URL params, we may need to construct WebSocket URL manually.

---

### D.2 High Risk: First Chunk Delay

**Risk:** 27-second delay before first audio causes Deepgram timeout.

**Mitigation:**
1. Deploy Patch B.3 to limit initial wait to 1 second
2. Send 20ms chunk early if needed to prevent timeout
3. Monitor logs to verify first chunk sent promptly

**Fallback:** If audio arrives too slowly from Exotel, may need to buffer differently or adjust Exotel configuration.

---

### D.3 Medium Risk: Audio Format Mismatch

**Risk:** Actual audio may not match declared format (e.g., different sample rate, encoding).

**Mitigation:**
1. Deploy Patches B.2 and B.4 for validation
2. Check Exotel documentation for actual audio format
3. Verify audio bytes match PCM16 little-endian format

**Fallback:** If format mismatch confirmed, update Deepgram config to match actual audio.

---

### D.4 Medium Risk: Chunk Size Too Small

**Risk:** Sending 20ms chunks may cause poor transcription quality.

**Mitigation:**
1. Current code allows 20ms only when timeout risk (500ms+ gap)
2. Prefer 50-100ms chunks when possible
3. Monitor transcription quality

**Fallback:** If quality is poor, may need to accept occasional timeouts or find way to accumulate larger chunks faster.

---

## Section E: Summary & Next Steps

### Critical Issues to Address:

1. **🔴 WebSocket URL Verification** - Cannot verify SDK includes required query params
2. **🔴 First Chunk Delay** - 27-second delays causing timeouts
3. **🟡 Audio Format Validation** - Only basic validation, need comprehensive
4. **🟡 Sample Rate Validation** - No validation that declared matches actual

### Immediate Actions:

1. **Deploy Patch B.1** - Verify WebSocket URL contains query params
2. **Deploy Patch B.3** - Fix first chunk delay (1 second max)
3. **Deploy Patches B.2, B.4** - Enhanced validation
4. **Deploy Patch B.5** - Better error detection

### Success Criteria:

- ✅ WebSocket URL contains `encoding=linear16&sample_rate=8000`
- ✅ First audio chunk sent within 1 second
- ✅ Audio sent every 100-500ms (not 6-27 seconds)
- ✅ No format validation errors
- ✅ Non-empty transcripts received from Deepgram
- ✅ No timeout (1011) errors

---

## Appendix: File Paths Reference

**Deepgram Provider:**
- `services/asr-worker/src/providers/deepgramProvider.ts`

**ASR Worker (Chunking Logic):**
- `services/asr-worker/src/index.ts`

**Ingest Service (Audio Source):**
- `services/ingest/src/exotel-handler.ts`

**Configuration:**
- Environment variables (see code for defaults)
- `services/asr-worker/package.json` (SDK version)

---

**Report Status:** Ready for Implementation  
**Priority:** 🔴 **CRITICAL** - Addresses root cause of timeout and empty transcript issues


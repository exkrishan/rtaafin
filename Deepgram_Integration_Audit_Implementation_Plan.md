# Deepgram Integration Audit & Implementation Plan

**Document Version:** 1.0  
**Date:** 2025-11-09  
**Author:** Senior Architect Review  
**Status:** Ready for Review & Approval

---

## Summary

This document provides a comprehensive audit of our Deepgram live WebSocket transcription integration, identifies compliance gaps against Deepgram's official requirements, and proposes a production-ready implementation plan to ensure reliable, compliant, and scalable transcription service.

**Current Status:**
- ✅ Deepgram SDK integration exists (`@deepgram/sdk` v3.13.0)
- ✅ Connection management with race condition fixes
- ✅ KeepAlive mechanism implemented (with known issues)
- ⚠️ **CRITICAL:** Empty transcripts being received (Deepgram not returning text)
- ⚠️ **CRITICAL:** Connection timeouts (1011 errors) occurring
- ⚠️ Audio chunk sizing may not meet Deepgram requirements
- ❌ CloseStream/Finalize message not sent on call end
- ❌ Error code handling incomplete

**Risk Level:** 🟡 **MEDIUM-HIGH** - System functional but not production-ready due to empty transcripts and timeout issues.

---

## Step 1: Deepgram Requirements List

Based on Deepgram's official documentation and best practices:

### 1.1 WebSocket Connection Requirements

| Requirement | Specification | Source |
|------------|--------------|--------|
| **Endpoint** | `wss://api.deepgram.com/v1/listen` | Official API |
| **Authentication** | API Key via `createClient(apiKey)` or WebSocket protocol header | SDK/API Docs |
| **Connection Lifecycle** | Must handle Open, Message, Error, Close events | SDK Events |
| **Reconnection** | Automatic reconnection on disconnect recommended | Best Practice |

### 1.2 Audio Format Requirements

| Requirement | Specification | Current State |
|------------|--------------|---------------|
| **Encoding** | `linear16` (PCM16) | ✅ `linear16` |
| **Sample Rate** | Must match actual audio (8kHz, 16kHz, 24kHz, etc.) | ✅ Configurable (8kHz for Exotel) |
| **Channels** | 1 (mono) or 2 (stereo) | ✅ `channels: 1` |
| **Data Format** | Raw binary (Uint8Array/Buffer) | ✅ Converting to Uint8Array |
| **Chunk Size** | **20-250ms recommended** (minimum 20ms, optimal 50-100ms) | ⚠️ **ISSUE: Sending 500-2000ms chunks** |
| **Continuous Flow** | Must send audio continuously, not in large batches | ⚠️ **ISSUE: Batching 500ms+ chunks** |

### 1.3 KeepAlive Requirements

| Requirement | Specification | Current State |
|------------|--------------|---------------|
| **Format** | JSON text frame: `{"type": "KeepAlive"}` | ✅ Implemented |
| **Frequency** | Every 3-5 seconds during silence | ✅ Every 3 seconds |
| **Timeout** | Connection closes if no data/KeepAlive >10 seconds | ⚠️ **ISSUE: KeepAlive may not be reaching Deepgram** |
| **Frame Type** | Must be TEXT frame, not binary | ⚠️ **ISSUE: WebSocket access unreliable** |

### 1.4 Connection Lifecycle Requirements

| Requirement | Specification | Current State |
|------------|--------------|---------------|
| **Open Event** | Wait for `Open` event before sending audio | ✅ Implemented |
| **CloseStream** | Send `{"type": "CloseStream"}` on call end | ❌ **MISSING** |
| **Finalize** | Alternative: Send `{"type": "Finalize"}` | ❌ **MISSING** |
| **Graceful Close** | Close connection cleanly on call end | ⚠️ Using `finish()` but not sending CloseStream |

### 1.5 Error Handling Requirements

| Requirement | Specification | Current State |
|------------|--------------|---------------|
| **Error Code 1008** | DATA-0000: Invalid audio format | ⚠️ Logged but not handled specifically |
| **Error Code 1011** | NET-0001: Timeout (no data received) | ✅ Logged with diagnostics |
| **Error Code 4000** | Invalid API key | ⚠️ Logged but not handled specifically |
| **Reconnection** | Automatic retry on transient errors | ❌ **MISSING** |

### 1.6 Transcript Processing Requirements

| Requirement | Specification | Current State |
|------------|--------------|---------------|
| **Interim Results** | Enable for real-time partial transcripts | ✅ `interim_results: true` |
| **Final Results** | Wait for `is_final: true` for final transcripts | ✅ Implemented |
| **Empty Transcripts** | Filter out empty/whitespace transcripts | ✅ Implemented in consumer |
| **Confidence Scores** | Extract and use confidence values | ✅ Implemented |

---

## Step 2: Audit Findings

### 2.1 Critical Issues (Must Fix)

| File | Line(s) | Issue | Severity | Impact |
|------|---------|-------|----------|--------|
| `services/asr-worker/src/providers/deepgramProvider.ts` | 676-696 | **Missing CloseStream message** on call end | 🔴 **CRITICAL** | Deepgram may not finalize transcripts properly |
| `services/asr-worker/src/providers/deepgramProvider.ts` | 305-327 | **KeepAlive sent via fallback** (`connection.send()`) may not work | 🔴 **CRITICAL** | KeepAlive not recognized, causing timeouts |
| `services/asr-worker/src/index.ts` | 369-400 | **Chunk size too large** (500-2000ms) vs Deepgram's 20-250ms recommendation | 🔴 **CRITICAL** | May cause latency and processing issues |
| `services/asr-worker/src/providers/deepgramProvider.ts` | 461-478 | **Error codes not handled specifically** (1008, 4000, etc.) | 🟠 **HIGH** | Errors not recovered from properly |
| `services/asr-worker/src/providers/deepgramProvider.ts` | 688-690 | **Using `finish()` instead of CloseStream** | 🟠 **HIGH** | May not properly signal end of stream |

### 2.2 High Priority Issues

| File | Line(s) | Issue | Severity | Impact |
|------|---------|-------|----------|--------|
| `services/asr-worker/src/providers/deepgramProvider.ts` | 197-224 | **WebSocket access unreliable** (recursive search fallback) | 🟠 **HIGH** | KeepAlive may fail silently |
| `services/asr-worker/src/index.ts` | 232-242 | **Initial chunk wait (500ms)** may be too long for real-time | 🟡 **MEDIUM** | Increased latency for first transcript |
| `services/asr-worker/src/providers/deepgramProvider.ts` | 647-664 | **5-second timeout** may be too short for Deepgram processing | 🟡 **MEDIUM** | Premature empty transcript returns |
| `services/asr-worker/src/providers/deepgramProvider.ts` | 100-108 | **Hardcoded model/config** - no environment variable override | 🟡 **MEDIUM** | Inflexible configuration |

### 2.3 Medium Priority Issues

| File | Line(s) | Issue | Severity | Impact |
|------|---------|-------|----------|--------|
| `services/asr-worker/src/providers/deepgramProvider.ts` | 407-459 | **Empty transcript logging** but no metrics/alerting | 🟡 **MEDIUM** | Hard to track empty transcript rate |
| `services/asr-worker/src/index.ts` | 24-27 | **Buffer window (2000ms)** may accumulate too much audio | 🟢 **LOW** | Increased memory usage |
| `services/asr-worker/src/providers/deepgramProvider.ts` | No reconnection logic | **No automatic reconnection** on error | 🟡 **MEDIUM** | Manual intervention required on failures |

### 2.4 Compliance Gaps Summary

**Audio Format:** ✅ **COMPLIANT**
- Encoding: `linear16` ✅
- Sample rate: Configurable ✅
- Channels: 1 (mono) ✅
- Data format: Uint8Array ✅

**Chunk Sizing:** ⚠️ **NON-COMPLIANT**
- **Requirement:** 20-250ms chunks
- **Current:** 500-2000ms chunks (too large)
- **Impact:** Increased latency, potential processing delays

**KeepAlive:** ⚠️ **PARTIALLY COMPLIANT**
- Format: JSON text frame ✅
- Frequency: Every 3 seconds ✅
- **Issue:** WebSocket access unreliable, may not reach Deepgram

**Connection Lifecycle:** ❌ **NON-COMPLIANT**
- Missing CloseStream message on call end
- Using `finish()` instead of proper CloseStream

**Error Handling:** ⚠️ **PARTIALLY COMPLIANT**
- Error codes logged but not handled specifically
- No automatic reconnection

---

## Step 3: Fix Plan

### 3.1 Fix 1: Implement CloseStream Message (CRITICAL)

**File:** `services/asr-worker/src/providers/deepgramProvider.ts`

**Current Code (lines 676-696):**
```typescript
async closeConnection(interactionId: string): Promise<void> {
  const state = this.connections.get(interactionId);
  if (state) {
    console.info(`[DeepgramProvider] Closing connection for ${interactionId}`);
    
    // Clear KeepAlive interval
    if (state.keepAliveInterval) {
      clearInterval(state.keepAliveInterval);
      state.keepAliveInterval = undefined;
    }
    
    // Close the connection
    if (state.connection && typeof state.connection.finish === 'function') {
      state.connection.finish();
    }
    
    // Remove from connections map
    this.connections.delete(interactionId);
    console.info(`[DeepgramProvider] ✅ Connection closed for ${interactionId}`);
  }
}
```

**Fixed Code:**
```typescript
async closeConnection(interactionId: string): Promise<void> {
  const state = this.connections.get(interactionId);
  if (state) {
    console.info(`[DeepgramProvider] Closing connection for ${interactionId}`);
    
    // Clear KeepAlive interval
    if (state.keepAliveInterval) {
      clearInterval(state.keepAliveInterval);
      state.keepAliveInterval = undefined;
    }
    
    // CRITICAL: Send CloseStream message before closing
    // Deepgram requires this to properly finalize transcripts
    try {
      if (state.socket && typeof state.socket.send === 'function') {
        const closeStreamMsg = JSON.stringify({ type: 'CloseStream' });
        state.socket.send(closeStreamMsg);
        console.info(`[DeepgramProvider] 📤 Sent CloseStream message for ${interactionId}`);
        
        // Wait a brief moment for Deepgram to process CloseStream
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        // Fallback: Try via connection if socket not accessible
        const connectionAny = state.connection as any;
        if (connectionAny && typeof connectionAny.send === 'function') {
          try {
            // Note: This may not work if connection.send() only accepts binary
            // But worth trying as fallback
            connectionAny.send(JSON.stringify({ type: 'CloseStream' }));
            console.warn(`[DeepgramProvider] ⚠️ Sent CloseStream via connection.send() (fallback)`);
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (e) {
            console.warn(`[DeepgramProvider] ⚠️ Could not send CloseStream:`, e);
          }
        }
      }
    } catch (error: any) {
      console.warn(`[DeepgramProvider] Error sending CloseStream for ${interactionId}:`, error);
      // Continue with close even if CloseStream fails
    }
    
    // Close the connection
    if (state.connection && typeof state.connection.finish === 'function') {
      state.connection.finish();
    }
    
    // Remove from connections map
    this.connections.delete(interactionId);
    console.info(`[DeepgramProvider] ✅ Connection closed for ${interactionId}`);
  }
}
```

---

### 3.2 Fix 2: Optimize Audio Chunk Sizing (CRITICAL)

**File:** `services/asr-worker/src/index.ts`

**Current Issue:**
- Buffer accumulates 500-2000ms of audio before sending
- Deepgram recommends 20-250ms chunks
- Current approach causes latency and may overwhelm Deepgram

**Strategy:**
- Send initial chunk at 200ms (minimum for reliable transcription)
- Then send continuously every 100-200ms (optimal for real-time)
- Don't wait for large buffer accumulation

**Fixed Code:**
```typescript
// Update constants
const INITIAL_CHUNK_DURATION_MS = parseInt(process.env.INITIAL_CHUNK_DURATION_MS || '200', 10); // 200ms for initial
const CONTINUOUS_CHUNK_DURATION_MS = parseInt(process.env.CONTINUOUS_CHUNK_DURATION_MS || '100', 10); // 100ms for continuous
const MAX_CHUNK_DURATION_MS = parseInt(process.env.MAX_CHUNK_DURATION_MS || '250', 10); // Max 250ms per Deepgram

// In handleAudioFrame, update processing logic:
if (!buffer.hasSentInitialChunk) {
  // First chunk: Wait for 200ms minimum (reduced from 500ms)
  if (currentAudioDurationMs >= INITIAL_CHUNK_DURATION_MS) {
    buffer.isProcessing = true;
    try {
      await this.processBuffer(buffer);
      buffer.lastProcessed = Date.now();
      buffer.hasSentInitialChunk = true;
      buffer.lastContinuousSendTime = Date.now();
    } finally {
      buffer.isProcessing = false;
    }
  }
} else {
  // After initial chunk: Send continuously every 100-200ms
  // CRITICAL: Don't accumulate more than 250ms (Deepgram recommendation)
  const timeSinceLastContinuousSend = Date.now() - buffer.lastContinuousSendTime;
  const shouldProcess = 
    timeSinceLastContinuousSend >= CONTINUOUS_CHUNK_DURATION_MS ||
    currentAudioDurationMs >= CONTINUOUS_CHUNK_DURATION_MS ||
    currentAudioDurationMs >= MAX_CHUNK_DURATION_MS; // Force send if too large
  
  if (shouldProcess) {
    buffer.isProcessing = true;
    try {
      await this.processBuffer(buffer);
      buffer.lastProcessed = Date.now();
      buffer.lastContinuousSendTime = Date.now();
    } finally {
      buffer.isProcessing = false;
    }
  }
}

// In processBuffer, add max chunk size check:
private async processBuffer(buffer: AudioBuffer): Promise<void> {
  if (buffer.chunks.length === 0) {
    return;
  }

  try {
    // Concatenate audio chunks
    const combinedAudio = Buffer.concat(buffer.chunks);
    const seq = buffer.chunks.length;
    
    // Calculate total audio duration
    const totalSamples = combinedAudio.length / 2; // 16-bit = 2 bytes per sample
    const audioDurationMs = (totalSamples / buffer.sampleRate) * 1000;
    
    // CRITICAL: Enforce maximum chunk size (250ms per Deepgram recommendation)
    if (audioDurationMs > MAX_CHUNK_DURATION_MS) {
      // Split into multiple chunks if too large
      const maxSamples = Math.floor((MAX_CHUNK_DURATION_MS * buffer.sampleRate) / 1000);
      const maxBytes = maxSamples * 2; // 16-bit = 2 bytes
      
      // Process first chunk
      const firstChunk = combinedAudio.slice(0, maxBytes);
      await this.sendToAsrProvider(firstChunk, buffer, seq);
      
      // Process remaining chunks if any
      if (combinedAudio.length > maxBytes) {
        const remainingChunk = combinedAudio.slice(maxBytes);
        await this.sendToAsrProvider(remainingChunk, buffer, seq + 1);
      }
      
      // Clear all processed chunks
      buffer.chunks = [];
      buffer.timestamps = [];
      return;
    }
    
    // ... rest of existing processBuffer logic
  } catch (error: any) {
    // ... error handling
  }
}
```

---

### 3.3 Fix 3: Improve KeepAlive Reliability (CRITICAL)

**File:** `services/asr-worker/src/providers/deepgramProvider.ts`

**Current Issue:**
- WebSocket access is unreliable (recursive search fallback)
- KeepAlive may not reach Deepgram

**Strategy:**
- Use Deepgram SDK's built-in KeepAlive if available
- Add fallback mechanism with retry logic
- Add metrics to track KeepAlive success rate

**Fixed Code:**
```typescript
// Add to ConnectionState interface
interface ConnectionState {
  // ... existing fields
  keepAliveSuccessCount: number;
  keepAliveFailureCount: number;
  lastKeepAliveTime: number;
}

// In Open event handler, improve KeepAlive:
// Try multiple methods to send KeepAlive
const sendKeepAliveReliable = (): boolean => {
  const keepAliveMsg = JSON.stringify({ type: 'KeepAlive' });
  
  // Method 1: Try underlying WebSocket (preferred)
  if (state.socket && typeof state.socket.send === 'function') {
    try {
      state.socket.send(keepAliveMsg);
      state.keepAliveSuccessCount++;
      state.lastKeepAliveTime = Date.now();
      return true;
    } catch (e) {
      // Continue to next method
    }
  }
  
  // Method 2: Try Deepgram SDK's connection.send() with text frame indicator
  // Some SDK versions support sending text via a special method
  const connectionAny = connection as any;
  if (connectionAny.sendText) {
    try {
      connectionAny.sendText(keepAliveMsg);
      state.keepAliveSuccessCount++;
      state.lastKeepAliveTime = Date.now();
      return true;
    } catch (e) {
      // Continue to next method
    }
  }
  
  // Method 3: Try connection.send() as last resort (may not work)
  try {
    connectionAny.send(keepAliveMsg);
    state.keepAliveFailureCount++;
    console.warn(`[DeepgramProvider] ⚠️ KeepAlive sent via connection.send() (may not work)`);
    return false; // Mark as uncertain
  } catch (e) {
    state.keepAliveFailureCount++;
    return false;
  }
};

// Update periodic KeepAlive with metrics
state.keepAliveInterval = setInterval(() => {
  if (!state.isReady || !state.connection) {
    return;
  }
  
  const success = sendKeepAliveReliable();
  if (success) {
    console.debug(`[DeepgramProvider] 📡 KeepAlive sent (success: ${state.keepAliveSuccessCount}, failures: ${state.keepAliveFailureCount})`);
  } else {
    console.warn(`[DeepgramProvider] ⚠️ KeepAlive failed (success: ${state.keepAliveSuccessCount}, failures: ${state.keepAliveFailureCount})`);
    
    // If too many failures, log warning
    if (state.keepAliveFailureCount > 5 && state.keepAliveFailureCount % 10 === 0) {
      console.error(`[DeepgramProvider] ❌ CRITICAL: KeepAlive failing repeatedly (${state.keepAliveFailureCount} failures). Connection may timeout.`);
    }
  }
}, 3000);
```

---

### 3.4 Fix 4: Add Specific Error Code Handling (HIGH)

**File:** `services/asr-worker/src/providers/deepgramProvider.ts`

**Fixed Code:**
```typescript
connection.on(LiveTranscriptionEvents.Error, (error: any) => {
  const errorCode = error.code;
  const errorMessage = error.message || String(error);
  
  console.error(`[DeepgramProvider] ❌ API Error for ${interactionId}:`, {
    error: errorMessage,
    code: errorCode,
    type: error.type,
    interactionId,
  });
  
  // Handle specific error codes
  switch (errorCode) {
    case 1008: // DATA-0000: Invalid audio format
      console.error(`[DeepgramProvider] ❌ Invalid audio format (1008) for ${interactionId}`);
      console.error(`[DeepgramProvider] Check: encoding, sample_rate, channels match actual audio`);
      // Close connection - format issue won't resolve
      this.closeConnection(interactionId);
      break;
      
    case 4000: // Invalid API key
      console.error(`[DeepgramProvider] ❌ Invalid API key (4000) for ${interactionId}`);
      console.error(`[DeepgramProvider] Check: DEEPGRAM_API_KEY is correct and has not expired`);
      // Close connection - auth issue won't resolve
      this.closeConnection(interactionId);
      break;
      
    case 1011: // NET-0001: Timeout
      console.error(`[DeepgramProvider] ❌ Connection timeout (1011) for ${interactionId}`);
      console.error(`[DeepgramProvider] Possible causes:`);
      console.error(`[DeepgramProvider]   1. Audio chunks too small/infrequent`);
      console.error(`[DeepgramProvider]   2. KeepAlive not being sent/recognized`);
      console.error(`[DeepgramProvider]   3. Network issues`);
      // Don't close immediately - may recover
      break;
      
    default:
      // Unknown error - log and continue
      console.warn(`[DeepgramProvider] ⚠️ Unknown error code ${errorCode} for ${interactionId}`);
  }
  
  // Reject pending resolvers on error
  state.pendingResolvers.forEach((resolve) => {
    resolve({
      type: 'partial',
      text: '',
      isFinal: false,
    });
  });
  state.pendingResolvers = [];
});
```

---

### 3.5 Fix 5: Add Configuration Environment Variables

**File:** `.env.example` (create or update)

```bash
# Deepgram Configuration
DEEPGRAM_API_KEY=your_deepgram_api_key_here
ASR_PROVIDER=deepgram

# Audio Chunk Configuration (Deepgram-optimized)
INITIAL_CHUNK_DURATION_MS=200      # Initial chunk size (200ms recommended)
CONTINUOUS_CHUNK_DURATION_MS=100   # Continuous chunk interval (100ms for real-time)
MAX_CHUNK_DURATION_MS=250          # Maximum chunk size (250ms per Deepgram)
MIN_AUDIO_DURATION_MS=200          # Minimum before processing (reduced from 500ms)

# Deepgram Model Configuration
DEEPGRAM_MODEL=nova-2              # Model: nova-2, base, enhanced, etc.
DEEPGRAM_LANGUAGE=en-US            # Language code
DEEPGRAM_SMART_FORMAT=true         # Enable smart formatting
DEEPGRAM_INTERIM_RESULTS=true      # Enable interim/partial transcripts

# KeepAlive Configuration
DEEPGRAM_KEEPALIVE_INTERVAL_MS=3000  # KeepAlive frequency (3 seconds)
DEEPGRAM_KEEPALIVE_ENABLED=true      # Enable/disable KeepAlive

# Connection Configuration
DEEPGRAM_CONNECTION_TIMEOUT_MS=10000  # Connection ready timeout (10 seconds)
DEEPGRAM_TRANSCRIPT_TIMEOUT_MS=5000   # Transcript response timeout (5 seconds)
```

---

### 3.6 Fix 6: Add Observability & Metrics

**File:** `services/asr-worker/src/providers/deepgramProvider.ts`

**Add metrics tracking:**
```typescript
interface DeepgramMetrics {
  connectionsCreated: number;
  connectionsReused: number;
  connectionsClosed: number;
  audioChunksSent: number;
  transcriptsReceived: number;
  emptyTranscriptsReceived: number;
  errors: number;
  errorCodes: Map<number, number>; // error code -> count
  keepAliveSuccess: number;
  keepAliveFailures: number;
  averageChunkSizeMs: number;
  averageLatencyMs: number;
}

export class DeepgramProvider implements AsrProvider {
  private metrics: DeepgramMetrics = {
    connectionsCreated: 0,
    connectionsReused: 0,
    connectionsClosed: 0,
    audioChunksSent: 0,
    transcriptsReceived: 0,
    emptyTranscriptsReceived: 0,
    errors: 0,
    errorCodes: new Map(),
    keepAliveSuccess: 0,
    keepAliveFailures: 0,
    averageChunkSizeMs: 0,
    averageLatencyMs: 0,
  };
  
  // Add method to get metrics
  getMetrics(): DeepgramMetrics {
    return { ...this.metrics };
  }
  
  // Update metrics throughout the code
  // In getOrCreateConnection:
  this.metrics.connectionsCreated++;
  
  // In sendAudioChunk:
  this.metrics.audioChunksSent++;
  
  // In Transcript event:
  this.metrics.transcriptsReceived++;
  if (!transcriptText || transcriptText.trim().length === 0) {
    this.metrics.emptyTranscriptsReceived++;
  }
  
  // In Error event:
  this.metrics.errors++;
  const code = error.code || 0;
  this.metrics.errorCodes.set(code, (this.metrics.errorCodes.get(code) || 0) + 1);
}
```

**File:** `services/asr-worker/src/index.ts`

**Expose metrics in health endpoint:**
```typescript
} else if (req.url === '/health') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  const health: any = {
    status: 'ok',
    service: 'asr-worker',
    provider: ASR_PROVIDER,
    activeBuffers: this.buffers.size,
  };
  
  if (ASR_PROVIDER === 'deepgram' && this.asrProvider) {
    const providerAny = this.asrProvider as any;
    if (providerAny.connections) {
      health.activeConnections = providerAny.connections.size;
    }
    if (providerAny.getMetrics) {
      health.deepgramMetrics = providerAny.getMetrics();
    }
  }
  
  res.end(JSON.stringify(health));
}
```

---

### 3.7 Fix 7: Add Automatic Reconnection (MEDIUM)

**File:** `services/asr-worker/src/providers/deepgramProvider.ts`

**Add reconnection logic:**
```typescript
interface ConnectionState {
  // ... existing fields
  reconnectAttempts: number;
  lastReconnectTime: number;
  maxReconnectAttempts: number;
}

// In Close event handler:
connection.on(LiveTranscriptionEvents.Close, (event: any) => {
  // ... existing close handling ...
  
  // Check if we should reconnect (not a clean close, not too many attempts)
  const shouldReconnect = 
    !event?.wasClean &&
    state.reconnectAttempts < state.maxReconnectAttempts &&
    (Date.now() - state.lastReconnectTime) > 5000; // Wait 5s between attempts
  
  if (shouldReconnect) {
    console.info(`[DeepgramProvider] Attempting to reconnect for ${interactionId} (attempt ${state.reconnectAttempts + 1})`);
    state.reconnectAttempts++;
    state.lastReconnectTime = Date.now();
    
    // Remove from connections map (will be recreated)
    this.connections.delete(interactionId);
    
    // Schedule reconnection (don't block)
    setTimeout(async () => {
      try {
        // Recreate connection with same parameters
        await this.getOrCreateConnection(interactionId, state.sampleRate || 8000);
        console.info(`[DeepgramProvider] ✅ Reconnected for ${interactionId}`);
      } catch (error: any) {
        console.error(`[DeepgramProvider] ❌ Reconnection failed for ${interactionId}:`, error);
      }
    }, 1000);
  } else {
    // Final cleanup
    this.connections.delete(interactionId);
  }
});
```

---

## Step 4: Implementation Steps

### 4.1 Pre-Implementation Checklist

- [ ] Review and approve this audit document
- [ ] Verify Deepgram API key is valid and has sufficient quota
- [ ] Set up staging environment for testing
- [ ] Prepare rollback plan

### 4.2 Implementation Order

**Phase 1: Critical Fixes (Week 1)**

1. **Fix CloseStream Message** (Priority 1)
   - Update `closeConnection()` method
   - Test with call end events
   - Verify Deepgram receives CloseStream

2. **Optimize Chunk Sizing** (Priority 1)
   - Update buffer processing logic
   - Reduce initial chunk to 200ms
   - Set continuous chunks to 100ms
   - Enforce 250ms maximum

3. **Improve KeepAlive Reliability** (Priority 1)
   - Add multiple KeepAlive send methods
   - Add metrics tracking
   - Test KeepAlive success rate

**Phase 2: Error Handling & Observability (Week 1-2)**

4. **Add Error Code Handling**
   - Implement specific handlers for 1008, 4000, 1011
   - Add error recovery logic
   - Test error scenarios

5. **Add Metrics & Observability**
   - Implement metrics collection
   - Expose metrics in health endpoint
   - Add logging for key events

**Phase 3: Resilience & Testing (Week 2)**

6. **Add Reconnection Logic**
   - Implement automatic reconnection
   - Add retry limits and backoff
   - Test reconnection scenarios

7. **Add Configuration**
   - Create `.env.example` with all new vars
   - Update Render environment variables
   - Document configuration options

### 4.3 Code Changes Summary

**Files to Modify:**
1. `services/asr-worker/src/providers/deepgramProvider.ts` - Major updates
2. `services/asr-worker/src/index.ts` - Chunk sizing logic
3. `.env.example` - New environment variables
4. `services/asr-worker/src/metrics.ts` - Add Deepgram metrics (optional)

**Files to Create:**
1. `services/asr-worker/tests/deepgramIntegration.test.ts` - Integration tests
2. `DEEPGRAM_CONFIGURATION.md` - Configuration guide

**No Breaking Changes:**
- All changes are backward compatible

---

## Step 5: Validation & Rollout

### 5.1 Local Testing Checklist

```bash
# 1. Build and test locally
cd services/asr-worker
npm ci
npm run build
npm test

# 2. Test with mock audio
# Create test script that sends audio chunks every 100ms
# Verify chunks are sent in 100-250ms range
# Verify CloseStream is sent on end

# 3. Test KeepAlive
# Monitor logs for KeepAlive success/failure
# Verify connection stays open during silence

# 4. Test error handling
# Simulate error codes (1008, 4000, 1011)
# Verify proper handling and recovery
```

### 5.2 Integration Testing

**Test Flow:**
```
Exotel Call → Ingest Service → Redis → ASR Worker → Deepgram → Transcripts → UI
```

**Validation Points:**
- [ ] Audio chunks sent every 100-200ms (not 500ms+)
- [ ] Chunk sizes are 20-250ms (not 500-2000ms)
- [ ] KeepAlive sent every 3 seconds
- [ ] CloseStream sent on call end
- [ ] Transcripts received (not empty)
- [ ] Error codes handled properly
- [ ] Reconnection works on disconnect

### 5.3 Staging Deployment

**Deployment Steps:**
1. Deploy to staging environment
2. Set environment variables:
   ```bash
   INITIAL_CHUNK_DURATION_MS=200
   CONTINUOUS_CHUNK_DURATION_MS=100
   MAX_CHUNK_DURATION_MS=250
   MIN_AUDIO_DURATION_MS=200
   DEEPGRAM_KEEPALIVE_ENABLED=true
   ```
3. Monitor for 1 hour:
   - Error rates
   - Transcript success rate
   - Connection stability
   - Latency metrics

**Success Criteria:**
- ✅ Error rate < 0.5%
- ✅ Transcript success rate > 95%
- ✅ Average latency < 300ms (90th percentile)
- ✅ No connection timeouts (1011 errors)
- ✅ KeepAlive success rate > 99%

### 5.4 Production Rollout

**Rollout Plan:**
1. **Canary Deployment (10% traffic)**
   - Deploy to 1 instance
   - Monitor for 2 hours
   - Check metrics vs baseline

2. **Gradual Rollout (50% traffic)**
   - If canary successful, roll out to 50%
   - Monitor for 4 hours
   - Compare metrics

3. **Full Rollout (100% traffic)**
   - If 50% successful, full rollout
   - Monitor for 24 hours
   - Watch for regressions

**Rollback Triggers:**
- Error rate > 1%
- Transcript success rate < 90%
- Latency > 500ms (90th percentile)
- Connection timeout rate > 2%

**Rollback Procedure:**
```bash
# Option 1: Revert code
git revert HEAD
git push origin main

# Option 2: Disable Deepgram via env var
ASR_PROVIDER=mock  # Falls back to mock provider

# Option 3: Rollback deployment in Render
# Render Dashboard → Deploy → Rollback to previous version
```

### 5.5 Post-Deployment Monitoring

**Metrics to Monitor:**
- Deepgram connection count
- Audio chunks sent per second
- Transcripts received per second
- Empty transcript rate
- Error code distribution
- KeepAlive success rate
- Average chunk size
- Average latency

**Alerts to Set:**
- Error rate > 0.5%
- Empty transcript rate > 5%
- Connection timeout rate > 1%
- KeepAlive failure rate > 5%
- Latency > 300ms (p90)

---

## Risk Assessment

### Overall Risk Level: 🟡 **MEDIUM**

**Risk Breakdown:**

| Risk Area | Level | Mitigation |
|-----------|-------|------------|
| **Code Changes** | 🟡 MEDIUM | Comprehensive testing, gradual rollout |
| **Breaking Changes** | 🟢 LOW | Backward compatible, feature flags |
| **Performance Impact** | 🟢 LOW | Optimizations should improve performance |
| **Data Loss** | 🟢 LOW | No data storage changes |
| **Service Availability** | 🟡 MEDIUM | Rollback plan, monitoring, alerts |
| **Cost Impact** | 🟢 LOW | No significant cost changes |

### Risk Mitigation Strategies

1. **Gradual Rollout:** Canary → 50% → 100%
2. **Feature Flags:** Ability to disable Deepgram via env var
3. **Comprehensive Testing:** Unit + integration + E2E tests
4. **Monitoring:** Real-time metrics and alerts
5. **Rollback Plan:** Multiple rollback options
6. **Documentation:** Clear runbooks for operations

---

## Testing Strategy

### Unit Tests

**File:** `services/asr-worker/tests/deepgramIntegration.test.ts`

```typescript
describe('Deepgram Integration', () => {
  it('should send CloseStream on connection close', async () => {
    // Test CloseStream message is sent
  });
  
  it('should send chunks in 20-250ms range', async () => {
    // Test chunk sizing
  });
  
  it('should send KeepAlive every 3 seconds', async () => {
    // Test KeepAlive frequency
  });
  
  it('should handle error codes correctly', async () => {
    // Test error handling
  });
  
  it('should reconnect on disconnect', async () => {
    // Test reconnection
  });
});
```

### Integration Tests

**Test Scenarios:**
1. Full Exotel → Deepgram → Transcript flow
2. Call end → CloseStream → Final transcript
3. Network interruption → Reconnection
4. Error scenarios (invalid format, API key, timeout)

### E2E Tests

**Manual Test Script:**
```bash
# 1. Make Exotel call
# 2. Monitor logs for:
#    - Chunk sizes (should be 100-250ms)
#    - KeepAlive messages (every 3s)
#    - Transcripts received
# 3. End call
# 4. Verify CloseStream sent
# 5. Verify final transcript received
```

---

## Appendix: Deepgram SDK Reference

### SDK Version
- **Current:** `@deepgram/sdk@^3.13.0`
- **Status:** ✅ Latest stable version

### Key SDK Methods
- `createClient(apiKey)` - Create Deepgram client
- `client.listen.live(config)` - Create live connection
- `connection.send(audioData)` - Send binary audio
- `connection.finish()` - Close connection
- `connection.on(event, handler)` - Event handlers

### Event Types
- `LiveTranscriptionEvents.Open` - Connection opened
- `LiveTranscriptionEvents.Transcript` - Transcript received
- `LiveTranscriptionEvents.Error` - Error occurred
- `LiveTranscriptionEvents.Close` - Connection closed

---

## Next Steps

1. **Review this document** with team
2. **Approve implementation plan**
3. **Begin Phase 1 implementation** (Critical fixes)
4. **Run tests** and validate
5. **Deploy to staging** and monitor
6. **Gradual production rollout**

---

**Document Status:** ✅ **READY FOR REVIEW**

All fixes are designed to be backward compatible and production-ready. Implementation can begin upon approval.


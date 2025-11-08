# Deepgram Setup Expert Review

## Executive Summary

After a thorough review of the Deepgram integration, I've identified **3 critical issues** and **2 recommendations** that need to be addressed to ensure proper Deepgram functionality.

## Critical Issues Found

### 1. ❌ **KeepAlive Format Incorrect**

**Current Implementation:**
```typescript
connection.send("KeepAlive");  // Simple string - WRONG
```

**Problem:** Deepgram's WebSocket API requires KeepAlive messages to be sent as **JSON text frames**, not simple strings. According to Deepgram's official documentation, the KeepAlive must be:
- A JSON object: `{"type": "KeepAlive"}`
- Sent as a **text WebSocket frame** (not binary)

**Impact:** The current implementation sends a simple string, which Deepgram may not recognize as a valid KeepAlive, leading to connection timeouts (error 1011).

**Fix Required:**
```typescript
// Send as JSON text frame
connection.send(JSON.stringify({ type: "KeepAlive" }));
```

### 2. ⚠️ **KeepAlive Only Sent Once Initially**

**Current Implementation:**
- KeepAlive is sent once when connection opens
- Periodic KeepAlive is set up every 3 seconds

**Status:** ✅ This is actually correct! The periodic KeepAlive is properly implemented.

**However:** The initial KeepAlive should also be in JSON format (see issue #1).

### 3. ⚠️ **SDK Version Mismatch Risk**

**Current:** `@deepgram/sdk: ^3.13.0`

**Status:** ✅ Version is up-to-date. However, verify that the installed version matches `package.json`.

## Recommendations

### 1. ✅ **Audio Format Conversion** (Already Correct)

The Buffer to Uint8Array conversion is correct:
```typescript
const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
state.connection.send(audioData);
```

Deepgram SDK accepts `Uint8Array` for binary audio frames, which is correct.

### 2. ✅ **Sample Rate Configuration** (Already Correct)

- Exotel sends 8000 Hz audio
- Deepgram connection is configured with `sample_rate: 8000`
- ✅ This matches correctly

### 3. ⚠️ **Buffer Window** (May Need Adjustment)

Current: `BUFFER_WINDOW_MS = 500ms`

**Consideration:** 
- 500ms is reasonable for Deepgram
- However, if audio chunks are very small (e.g., 108ms as seen in logs), Deepgram might benefit from larger accumulated chunks
- **Recommendation:** Monitor Deepgram's response. If timeouts persist, consider increasing to 750ms-1000ms

### 4. ⚠️ **Connection State Management**

**Current:** Connections are properly managed with state tracking.

**Potential Issue:** If a connection closes unexpectedly, the KeepAlive interval might not be cleared properly. The current code handles this, but verify in production.

## Code Quality Issues

### 1. Duplicate Shutdown Handlers

**File:** `services/asr-worker/src/index.ts`

**Issue:** Duplicate `SIGTERM` and `SIGINT` handlers (lines 275-285 and 288-299).

**Impact:** Minor - doesn't break functionality but causes duplicate log messages.

**Fix:** Remove duplicate handlers.

## Action Items

### Immediate (Critical) - ✅ COMPLETED

1. ✅ **Fix KeepAlive format** - Changed from simple string to JSON:
   ```typescript
   connection.send(JSON.stringify({ type: "KeepAlive" }));
   ```
   - **Fixed in:** `services/asr-worker/src/providers/deepgramProvider.ts`
   - Both initial and periodic KeepAlive now use JSON format

2. ✅ **Remove duplicate shutdown handlers** - Removed duplicate SIGTERM/SIGINT handlers
   - **Fixed in:** `services/asr-worker/src/index.ts`

### High Priority

3. **Verify SDK installation** - Ensure `@deepgram/sdk@3.13.0` is actually installed:
   ```bash
   cd services/asr-worker && npm list @deepgram/sdk
   ```

4. **Test KeepAlive** - After fix, verify in logs that KeepAlive messages are being sent every 3 seconds and connections are not timing out.

### Medium Priority

5. **Monitor buffer window** - If timeouts persist, consider increasing `BUFFER_WINDOW_MS` to 750ms or 1000ms.

6. **Add connection health metrics** - Track KeepAlive send success/failure rates.

## Testing Checklist

After applying fixes:

- [x] ✅ KeepAlive format fixed to JSON: `{"type":"KeepAlive"}`
- [x] ✅ Duplicate shutdown handlers removed
- [ ] KeepAlive messages appear in logs as JSON: `{"type":"KeepAlive"}`
- [ ] KeepAlive sent every 3 seconds during active connections
- [ ] No more error 1011 (timeout) errors
- [ ] Deepgram transcript events are received
- [ ] Audio chunks are being sent successfully
- [ ] Connections remain open during silence periods

## Expected Behavior After Fixes

1. **Connection opens** → Initial KeepAlive sent as JSON
2. **Every 3 seconds** → Periodic KeepAlive sent as JSON
3. **Audio chunks sent** → Deepgram processes and returns transcripts
4. **During silence** → KeepAlive maintains connection
5. **No timeouts** → Connection stays open until explicitly closed

## References

- [Deepgram KeepAlive Documentation](https://developers.deepgram.com/docs/audio-keep-alive)
- [Deepgram WebSocket API](https://developers.deepgram.com/docs/websocket-api)
- [Deepgram SDK GitHub](https://github.com/deepgram/deepgram-node-sdk)

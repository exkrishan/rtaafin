# 🔍 Deepgram Setup - Expert Review

## Executive Summary

**Status:** ⚠️ **CRITICAL ISSUES FOUND**

The Deepgram setup has **3 critical issues** that explain why Deepgram is not receiving audio:

1. ❌ **KeepAlive format is INCORRECT** - Deepgram SDK doesn't accept JSON string for KeepAlive
2. ❌ **KeepAlive only sent once** - Should be sent periodically during silence
3. ⚠️ **SDK version mismatch** - package.json says ^3.4.0 but 3.13.0 is installed

---

## ✅ What's Correct

### 1. SDK Import and Client Creation
```typescript
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
this.client = createClient(key);
```
✅ **Correct** - Proper SDK import and client initialization

### 2. Connection Configuration
```typescript
const connectionConfig = {
  model: 'nova-2',
  language: 'en-US',
  smart_format: true,
  interim_results: true,
  sample_rate: sampleRate,
  encoding: 'linear16',
  channels: 1,
};
const connection = this.client.listen.live(connectionConfig);
```
✅ **Correct** - All configuration parameters are valid

### 3. Event Handlers
```typescript
connection.on(LiveTranscriptionEvents.Open, ...)
connection.on(LiveTranscriptionEvents.Transcript, ...)
connection.on(LiveTranscriptionEvents.Error, ...)
connection.on(LiveTranscriptionEvents.Close, ...)
```
✅ **Correct** - All event handlers are properly set up

### 4. Audio Format Conversion
```typescript
const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
state.connection.send(audioData);
```
✅ **Correct** - Converting Buffer to Uint8Array is the right approach

### 5. Audio Decoding
```typescript
const audioBuffer = Buffer.from(audio, 'base64'); // Decode base64
```
✅ **Correct** - Base64 decoding is correct

---

## ❌ Critical Issues Found

### Issue 1: KeepAlive Format is WRONG ⚠️ CRITICAL

**Current Code:**
```typescript
connection.send(JSON.stringify({ type: 'KeepAlive' }));
```

**Problem:**
- Deepgram SDK's `connection.send()` for **text messages** (like KeepAlive) expects a **different format**
- The SDK might have a specific method for KeepAlive, or the format might be different
- Sending JSON string might not be recognized as a KeepAlive message

**According to Deepgram Documentation:**
- KeepAlive messages should be sent as **text WebSocket frames**
- The format might need to be just `"KeepAlive"` or use a specific SDK method
- Some SDK versions have a `keepAlive()` method or similar

**Fix Needed:**
```typescript
// Option 1: Try simple string (if SDK accepts it)
connection.send("KeepAlive");

// Option 2: Use SDK method if available (check SDK docs)
// connection.keepAlive();

// Option 3: Send as text message with proper format
connection.send(JSON.stringify({ type: "KeepAlive" }), { type: "text" });
```

**Action:** Check Deepgram SDK 3.13.0 documentation for correct KeepAlive format

---

### Issue 2: KeepAlive Only Sent Once ⚠️ CRITICAL

**Current Code:**
```typescript
connection.on(LiveTranscriptionEvents.Open, () => {
  // Send KeepAlive only once on Open
  connection.send(JSON.stringify({ type: 'KeepAlive' }));
});
```

**Problem:**
- KeepAlive should be sent **periodically during silence** (every 3-5 seconds)
- Sending only once on Open doesn't prevent timeout during long silence periods
- If audio chunks are small/infrequent, connection will timeout

**Fix Needed:**
```typescript
// Set up periodic KeepAlive
let keepAliveInterval: NodeJS.Timeout | null = null;

connection.on(LiveTranscriptionEvents.Open, () => {
  state.isReady = true;
  
  // Send initial KeepAlive
  try {
    connection.send("KeepAlive"); // Use correct format
  } catch (error) {
    console.warn(`[DeepgramProvider] Failed to send KeepAlive:`, error);
  }
  
  // Set up periodic KeepAlive (every 3 seconds)
  keepAliveInterval = setInterval(() => {
    try {
      if (state.connection && state.isReady) {
        connection.send("KeepAlive");
        console.debug(`[DeepgramProvider] 📡 Sent periodic KeepAlive for ${interactionId}`);
      }
    } catch (error) {
      console.warn(`[DeepgramProvider] Failed to send periodic KeepAlive:`, error);
    }
  }, 3000); // Every 3 seconds
});

connection.on(LiveTranscriptionEvents.Close, () => {
  // Clear KeepAlive interval
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  // ... rest of close handler
});
```

---

### Issue 3: SDK Version Mismatch ⚠️ WARNING

**package.json:**
```json
"@deepgram/sdk": "^3.4.0"
```

**package-lock.json:**
```json
"version": "3.13.0"
```

**Problem:**
- Version mismatch can cause API differences
- 3.13.0 might have different methods/format than 3.4.0
- KeepAlive implementation might have changed

**Fix Needed:**
```json
// Update package.json to match installed version
"@deepgram/sdk": "^3.13.0"
```

Then run:
```bash
npm install
```

---

## ⚠️ Potential Issues

### Issue 4: Audio Chunk Size Still Small

**Current:**
- Buffer window: 500ms (increased from 300ms)
- But chunks are still 13-108ms in logs

**Problem:**
- If audio frames arrive infrequently, buffer might not accumulate enough
- Need to ensure buffer accumulates properly

**Check:**
- Verify buffer is accumulating chunks correctly
- Check if `bufferAge >= BUFFER_WINDOW_MS` is triggering correctly

---

### Issue 5: Connection.send() Method

**Current:**
```typescript
state.connection.send(audioData);
```

**Potential Issue:**
- Deepgram SDK might have different methods for binary vs text
- `send()` might need options parameter

**Check SDK Documentation:**
- Verify if `connection.send()` is the correct method
- Check if it needs options like `{ type: 'binary' }`

---

## 🔧 Recommended Fixes (Priority Order)

### Fix 1: Correct KeepAlive Format (CRITICAL)

**Research Deepgram SDK 3.13.0 documentation:**
1. Check if there's a `keepAlive()` method
2. Check the correct format for KeepAlive messages
3. Update code accordingly

**Most Likely Fix:**
```typescript
// Try this first (simple string)
connection.send("KeepAlive");
```

---

### Fix 2: Implement Periodic KeepAlive (CRITICAL)

**Add periodic KeepAlive:**
```typescript
// In ConnectionState interface
interface ConnectionState {
  connection: any;
  isReady: boolean;
  transcriptQueue: Transcript[];
  pendingResolvers: Array<(transcript: Transcript) => void>;
  lastTranscript: Transcript | null;
  keepAliveInterval?: NodeJS.Timeout; // Add this
}

// In Open event handler
connection.on(LiveTranscriptionEvents.Open, () => {
  state.isReady = true;
  
  // Send initial KeepAlive
  try {
    connection.send("KeepAlive"); // Use correct format
  } catch (error: any) {
    console.warn(`[DeepgramProvider] Failed to send KeepAlive:`, error);
  }
  
  // Set up periodic KeepAlive (every 3 seconds)
  state.keepAliveInterval = setInterval(() => {
    try {
      if (state.connection && state.isReady) {
        connection.send("KeepAlive");
        console.debug(`[DeepgramProvider] 📡 Periodic KeepAlive for ${interactionId}`);
      }
    } catch (error: any) {
      console.warn(`[DeepgramProvider] Failed to send periodic KeepAlive:`, error);
    }
  }, 3000);
});

// In Close event handler
connection.on(LiveTranscriptionEvents.Close, (event: any) => {
  // Clear KeepAlive interval
  if (state.keepAliveInterval) {
    clearInterval(state.keepAliveInterval);
    state.keepAliveInterval = undefined;
  }
  // ... rest of close handler
});
```

---

### Fix 3: Update SDK Version (WARNING)

**Update package.json:**
```json
"@deepgram/sdk": "^3.13.0"
```

**Then:**
```bash
npm install
npm run build
```

---

## 📋 Verification Checklist

After applying fixes, verify:

- [ ] KeepAlive format is correct (check SDK docs)
- [ ] KeepAlive is sent periodically (every 3 seconds)
- [ ] SDK version matches in package.json and package-lock.json
- [ ] Audio chunks are being sent correctly
- [ ] Connection stays open (no more error 1011)
- [ ] Transcripts are received from Deepgram

---

## 🎯 Most Likely Root Cause

**The KeepAlive format is the #1 issue.**

Deepgram SDK likely doesn't recognize `JSON.stringify({ type: 'KeepAlive' })` as a valid KeepAlive message. It probably expects:
- Simple string: `"KeepAlive"`
- Or a specific SDK method: `connection.keepAlive()`

**Action:** Check Deepgram SDK 3.13.0 documentation for the correct KeepAlive format.

---

## 📚 References

1. **Deepgram SDK Documentation:**
   - Check: https://developers.deepgram.com/docs/sdks/node-sdk
   - Look for: KeepAlive implementation
   - Look for: connection.send() method details

2. **Deepgram Community:**
   - Search for: "KeepAlive Node.js SDK"
   - Search for: "error 1011 timeout"

3. **SDK Version:**
   - Current: 3.13.0 (installed)
   - Declared: ^3.4.0 (package.json)
   - Check changelog for API changes

---

## 🚀 Next Steps

1. **Immediate:** Research Deepgram SDK 3.13.0 KeepAlive format
2. **Fix:** Update KeepAlive implementation
3. **Fix:** Add periodic KeepAlive
4. **Fix:** Update package.json version
5. **Test:** Deploy and verify error 1011 is gone
6. **Verify:** Check if transcripts are received

The KeepAlive format issue is almost certainly why Deepgram is closing connections with error 1011!


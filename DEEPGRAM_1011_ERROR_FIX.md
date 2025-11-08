# 🔧 Fix: Deepgram Error 1011 - No Audio Data Received

## 🚨 Critical Issue Found

**Error:**
```
[DeepgramProvider] 🔒 Connection closed: {
  reason: 'Deepgram did not receive audio data or a text message within the timeout window. See https://dpgr.am/net0001',
  code: 1011,
  wasClean: true
}
```

**Root Cause:**
Deepgram is closing connections because it's **not receiving audio data** within the timeout window.

---

## 🔍 Analysis

### What's Happening:
1. ✅ Connection opens successfully
2. ✅ Audio chunks are sent: `📤 Sending audio chunk`
3. ❌ **Deepgram says it's NOT receiving audio**
4. ❌ Connection closes with error 1011
5. ❌ No transcripts received

### Possible Causes:
1. **Audio format issue** - Buffer might not be compatible with Deepgram SDK
2. **Audio too small/infrequent** - Chunks are 13-108ms, way too small
3. **connection.send() not working** - Might need Uint8Array instead of Buffer
4. **No KeepAlive messages** - Deepgram needs KeepAlive during silence

---

## ✅ Fixes Applied

### Fix 1: Convert Buffer to Uint8Array

**Problem:**
- Deepgram SDK might expect `Uint8Array`, not `Buffer`
- Node.js `Buffer` extends `Uint8Array`, but explicit conversion ensures compatibility

**Fix:**
```typescript
// Convert Buffer to Uint8Array to ensure compatibility
const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
state.connection.send(audioData);
```

---

### Fix 2: Send KeepAlive Messages

**Problem:**
- Deepgram closes connections if no audio/data is received within timeout
- During silence or small gaps, connection can timeout

**Fix:**
- Send KeepAlive message immediately after connection opens
- This prevents Deepgram from closing due to inactivity

```typescript
connection.on(LiveTranscriptionEvents.Open, () => {
  state.isReady = true;
  // Send KeepAlive to prevent timeout
  connection.send(JSON.stringify({ type: 'KeepAlive' }));
});
```

---

### Fix 3: Increase Buffer Window

**Problem:**
- Audio chunks are VERY small (13ms, 22ms, 36ms, 72ms, 108ms)
- Deepgram needs continuous audio streams, not tiny chunks
- Current buffer window: 300ms → sends very small chunks

**Fix:**
- Increased buffer window from 300ms to 500ms
- This accumulates more audio before sending
- Results in larger chunks (better for Deepgram)

```typescript
const BUFFER_WINDOW_MS = parseInt(process.env.BUFFER_WINDOW_MS || '500', 10);
```

---

### Fix 4: Fix Buffer Clearing

**Problem:**
- Buffer was keeping last 2 chunks, causing reprocessing
- Same chunks were being sent repeatedly

**Fix:**
- Clear ALL chunks after processing (not keeping any)
- New chunks will accumulate for next window
- Prevents infinite loop

```typescript
// Clear ALL processed chunks
buffer.chunks = [];
buffer.timestamps = [];
```

---

### Fix 5: Enhanced Error Logging

**Added:**
- Critical warning when error 1011 occurs
- Explains what the error means
- Lists possible causes

```typescript
if (event?.code === 1011) {
  console.error(`[DeepgramProvider] ❌ CRITICAL: Connection closed due to timeout (1011)`);
  console.error(`[DeepgramProvider] This means Deepgram did not receive audio data...`);
  // ... detailed explanation
}
```

---

## 📊 Expected Improvements

### Before:
- ❌ Audio chunks: 13-108ms (too small)
- ❌ Buffer window: 300ms
- ❌ No KeepAlive messages
- ❌ Buffer format: Buffer (might not work)
- ❌ Error 1011: Connection closes

### After:
- ✅ Audio chunks: 200-500ms (larger, better)
- ✅ Buffer window: 500ms
- ✅ KeepAlive messages sent
- ✅ Buffer format: Uint8Array (explicit conversion)
- ✅ Better error logging

---

## 🔍 What to Check After Deployment

### Check 1: Do We Still See Error 1011?

**Look for:**
```
[DeepgramProvider] ❌ CRITICAL: Connection closed due to timeout (1011)
```

**If you see this:**
- ❌ Audio still not reaching Deepgram
- Check if Uint8Array conversion helped
- Check if KeepAlive messages are being sent

**If you DON'T see this:**
- ✅ Connection staying open (good sign!)
- Check if transcripts are now coming through

---

### Check 2: Audio Chunk Sizes

**Look for:**
```
[DeepgramProvider] 📤 Sending audio chunk: { durationMs: '...' }
```

**Expected:**
- Should see larger durations (200-500ms instead of 13-108ms)
- More audio per chunk = better for Deepgram

---

### Check 3: KeepAlive Messages

**Look for:**
```
[DeepgramProvider] 📡 Sent KeepAlive for call-...
```

**Expected:**
- Should see KeepAlive sent after connection opens
- This prevents timeout during silence

---

### Check 4: Buffer Clearing

**Look for:**
```
[ASRWorker] Cleared buffer for call-... after processing
```

**Expected:**
- Should see buffer cleared after processing
- No more repeated seq numbers

---

## 🎯 Most Likely Fix

**The Uint8Array conversion is the most critical fix.**

Deepgram SDK might not accept Node.js `Buffer` directly, even though Buffer extends Uint8Array. Explicit conversion ensures compatibility.

**If this doesn't work:**
- Check Deepgram SDK documentation for exact format
- Verify audio is actually valid PCM16
- Test with a known good audio file

---

## 📋 Summary

**Fixes Applied:**
1. ✅ Convert Buffer to Uint8Array
2. ✅ Send KeepAlive messages
3. ✅ Increase buffer window (300ms → 500ms)
4. ✅ Fix buffer clearing (clear all chunks)
5. ✅ Enhanced error logging

**Expected Result:**
- ✅ Larger audio chunks (200-500ms)
- ✅ KeepAlive prevents timeouts
- ✅ Uint8Array format ensures compatibility
- ✅ No more repeated chunks
- ✅ Better error visibility

**Next:**
- Wait for deployment
- Make a NEW Exotel call
- Check logs for:
  - Larger audio chunks
  - KeepAlive messages
  - No more error 1011
  - Actual transcripts!

The Uint8Array conversion and KeepAlive messages should fix the "no audio received" issue!


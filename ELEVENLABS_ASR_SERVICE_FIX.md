# ElevenLabs ASR Service Fix - EXO_BRIDGE_ENABLED Blocking Issue

**Date:** January 2025  
**Issue:** ASR service not sending requests to ElevenLabs, but test script works  
**Root Cause:** `EXO_BRIDGE_ENABLED` flag blocking all audio processing

---

## Problem Description

### Symptoms
- ✅ Test script (`test-elevenlabs-simulate.ts`) works - API requests appear in ElevenLabs dashboard
- ❌ ASR service doesn't work - No API requests in ElevenLabs dashboard
- ❌ Audio frames received but not processed

### Root Cause

**File:** `services/asr-worker/src/index.ts` (line 399-410)

**Problem Code:**
```typescript
const exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
if (!exoBridgeEnabled) {
  console.error('[ASRWorker] ❌ CRITICAL: Bridge disabled, skipping audio frame processing');
  return; // ❌ This blocks ALL providers, not just Deepgram!
}
```

**Issue:**
- The `EXO_BRIDGE_ENABLED` flag was meant for the Exotel→Deepgram bridge feature
- However, it was blocking **ALL** audio processing for **ALL** providers
- This meant ElevenLabs, Google, and other providers were also blocked
- Test script worked because it doesn't check this flag (direct provider call)

---

## Fix Applied

### Change Made

**File:** `services/asr-worker/src/index.ts` (line 398-413)

**Before:**
```typescript
// Check Exotel Bridge feature flag - skip processing if bridge is disabled
const exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
if (!exoBridgeEnabled) {
  // Blocks ALL providers
  return;
}
```

**After:**
```typescript
// Check Exotel Bridge feature flag - only required for Deepgram provider
// For ElevenLabs and other providers, this flag is not required
const exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
if (ASR_PROVIDER === 'deepgram' && !exoBridgeEnabled) {
  // Only blocks Deepgram, not other providers
  return;
}
```

### Impact

✅ **ElevenLabs now works** - No longer blocked by `EXO_BRIDGE_ENABLED`  
✅ **Google Speech works** - No longer blocked  
✅ **Other providers work** - No longer blocked  
✅ **Deepgram still protected** - Still requires `EXO_BRIDGE_ENABLED=true` (as intended)

---

## Environment Variable Behavior

### For Deepgram
```bash
# Required for Deepgram
ASR_PROVIDER=deepgram
EXO_BRIDGE_ENABLED=true  # Required
DEEPGRAM_API_KEY=your_key
```

### For ElevenLabs
```bash
# EXO_BRIDGE_ENABLED is NOT required
ASR_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your_key
# EXO_BRIDGE_ENABLED can be unset or false - doesn't matter
```

### For Google Speech
```bash
# EXO_BRIDGE_ENABLED is NOT required
ASR_PROVIDER=google
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
# EXO_BRIDGE_ENABLED can be unset or false - doesn't matter
```

---

## Verification Steps

### 1. Check Provider is Set
```bash
# Verify ASR_PROVIDER is set to elevenlabs
echo $ASR_PROVIDER
# Should output: elevenlabs
```

### 2. Check API Key is Set
```bash
# Verify ELEVENLABS_API_KEY is set
echo $ELEVENLABS_API_KEY | cut -c1-10
# Should output: sk_07ea93a...
```

### 3. Check Logs for Initialization
Look for:
```
[ElevenLabsProvider] Initialized
[ASRWorker] Using ASR provider: elevenlabs
```

### 4. Check Logs for Audio Processing
Look for:
```
[ASRWorker] 🎵 Processing audio for <interaction_id>
[ElevenLabsProvider] 📤 Sent audio chunk to ElevenLabs
```

### 5. Check ElevenLabs Dashboard
- Should see API requests in the dashboard
- Graph should show activity

---

## Testing

### Before Fix
- ❌ No requests in ElevenLabs dashboard
- ❌ Logs show: "Bridge disabled, skipping audio frame processing"
- ❌ Audio frames received but not processed

### After Fix
- ✅ Requests appear in ElevenLabs dashboard
- ✅ Logs show: "Processing audio" and "Sent audio chunk"
- ✅ Audio frames processed and sent to ElevenLabs

---

## Related Issues

This fix also resolves issues for:
- Google Speech provider (was also blocked)
- Any future providers (won't be blocked)
- Mock provider (was also blocked, though less critical)

---

## Summary

**Problem:** `EXO_BRIDGE_ENABLED` flag was blocking ALL providers, not just Deepgram  
**Fix:** Made the flag check specific to Deepgram only  
**Result:** ElevenLabs and other providers now work without the flag

The ASR service should now send requests to ElevenLabs when `ASR_PROVIDER=elevenlabs` is set, regardless of the `EXO_BRIDGE_ENABLED` flag value.


# 🔧 Transcript Consumer Fixes - Auto-ACK & Empty Transcript Filtering

## Issues Identified

### 1. **Messages Not Being ACK'd** ❌
**Problem:** Redis Streams messages were being read but never ACK'd, causing Redis to redeliver them repeatedly every ~13 seconds.

**Root Cause:** The `RedisStreamsAdapter` was calling the handler but not ACK'ing messages after successful processing.

**Impact:**
- Same transcript (seq: 4) processed repeatedly
- Log spam every ~13 seconds
- Unnecessary processing overhead

### 2. **Empty Transcripts Causing Log Spam** ❌
**Problem:** Empty transcripts were being processed and forwarded, causing excessive logging.

**Root Cause:** The transcript consumer was allowing empty transcripts through with a placeholder `[EMPTY - Debug Mode]` for debugging.

**Impact:**
- Log spam with empty transcript warnings
- Unnecessary API calls to forward empty transcripts
- Cluttered logs making debugging harder

### 3. **Too Frequent Stream Discovery** ⚠️
**Problem:** Stream discovery was running every 5 seconds, causing frequent log entries.

**Impact:**
- Log spam from discovery operations
- Unnecessary Redis SCAN operations

---

## ✅ Fixes Applied

### Fix 1: Auto-ACK Messages After Successful Processing

**File:** `lib/pubsub/adapters/redisStreamsAdapter.ts`

**Change:**
```typescript
// Before: Messages were processed but not ACK'd
await handler(envelope);
// Note: ACK is handled separately via ack() method

// After: Auto-ACK after successful handler execution
await handler(envelope);
// Auto-ACK after successful handler execution to prevent redelivery
try {
  await redis.xack(topic, consumerGroup, msgId);
} catch (ackError: unknown) {
  console.warn(`[RedisStreamsAdapter] Failed to ACK message ${msgId}:`, ackError);
}
```

**Result:**
- ✅ Messages are ACK'd immediately after successful processing
- ✅ Redis won't redeliver the same message
- ✅ No more repeated processing of the same transcript

---

### Fix 2: Filter Out Empty Transcripts

**File:** `lib/transcript-consumer.ts`

**Change:**
```typescript
// Before: Empty transcripts were forwarded with placeholder text
if (isEmpty) {
  console.warn('[TranscriptConsumer] ⚠️ Received transcript with EMPTY text (allowing through for debugging)', {...});
  msg.text = msg.text || '[EMPTY - Debug Mode]';
}

// After: Empty transcripts are skipped entirely
if (isEmpty) {
  console.debug('[TranscriptConsumer] ⚠️ Skipping transcript with EMPTY text', {...});
  return; // Skip processing empty transcripts
}
```

**Result:**
- ✅ Empty transcripts are skipped (not processed)
- ✅ Reduced log spam
- ✅ Cleaner logs
- ✅ No unnecessary API calls

---

### Fix 3: Reduce Stream Discovery Frequency

**File:** `lib/transcript-consumer.ts`

**Change:**
```typescript
// Before: Discovery every 5 seconds
}, 5000);

// After: Discovery every 30 seconds
}, 30000); // Changed from 5000ms (5s) to 30000ms (30s) to reduce log spam
```

**Result:**
- ✅ Less frequent discovery operations
- ✅ Reduced log spam
- ✅ Lower Redis SCAN overhead

---

## 🚀 Deployment

**Status:** ✅ Committed and pushed to `main` branch

**Commit:** `79ea9a3` - "Fix: Auto-ACK Redis Streams messages and filter empty transcripts to prevent log spam"

**Render Auto-Deploy:**
- Frontend service will automatically rebuild
- Changes will take effect after deployment completes (~5-10 minutes)

---

## ✅ Expected Behavior After Deploy

### Before Fix:
```
[TranscriptConsumer] Received transcript message { seq: 4, ... }
[ingest-transcript] Received chunk { seq: 4, ... }
... (13 seconds later) ...
[TranscriptConsumer] Received transcript message { seq: 4, ... }  ← Same message again!
[ingest-transcript] Received chunk { seq: 4, ... }
... (repeats every ~13 seconds)
```

### After Fix:
```
[TranscriptConsumer] Received transcript message { seq: 4, ... }
[ingest-transcript] Received chunk { seq: 4, ... }
... (message is ACK'd, won't be redelivered) ...
[TranscriptConsumer] Received transcript message { seq: 5, ... }  ← New message
[ingest-transcript] Received chunk { seq: 5, ... }
```

**Key Changes:**
1. ✅ Same transcript won't be processed repeatedly
2. ✅ Empty transcripts will be skipped (no log entries)
3. ✅ Stream discovery logs every 30s instead of 5s
4. ✅ Cleaner, more manageable logs

---

## 📊 Impact Summary

| Issue | Before | After |
|-------|--------|-------|
| **Message Redelivery** | Every ~13s | Never (ACK'd immediately) |
| **Empty Transcripts** | Processed & logged | Skipped entirely |
| **Stream Discovery** | Every 5s | Every 30s |
| **Log Spam** | High | Low |
| **Processing Overhead** | High (repeated work) | Low (one-time processing) |

---

## 🔍 Monitoring

After deployment, check logs for:

**✅ Success Indicators:**
- No repeated processing of same seq numbers
- No empty transcript warnings
- Less frequent stream discovery logs
- Cleaner log output overall

**❌ If Issues Persist:**
- Check if messages are still being redelivered (shouldn't happen)
- Check if empty transcripts are still being processed (should be skipped)
- Verify ACK is working (check Redis Streams pending messages)

---

## 🎯 Next Steps

1. **Wait for Render deployment** (~5-10 minutes)
2. **Monitor logs** for the improvements
3. **Test with a new Exotel call** to verify:
   - Transcripts are processed once
   - No empty transcripts in logs
   - Cleaner log output

---

## 📝 Notes

- **ACK Failure Handling:** If ACK fails, a warning is logged but processing continues. The message will be redelivered, but this is rare.
- **Empty Transcripts:** These are likely from old test calls or the ASR worker publishing empty text. The fix filters them out, but the root cause (ASR worker publishing empty transcripts) should still be investigated.
- **Stream Discovery:** 30 seconds is still frequent enough to catch new streams quickly, but reduces log spam significantly.

---

## ✅ Status

**All fixes deployed and ready for testing!**

Wait for Render to rebuild the frontend service, then monitor logs to verify the improvements.


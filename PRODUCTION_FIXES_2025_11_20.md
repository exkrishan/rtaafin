# 🔧 Production Fixes - November 20, 2025

## Summary

This document outlines critical fixes applied to resolve production issues identified in the Render deployment logs.

---

## Issues Fixed

### 1. ✅ Gemini Model Name Error (404 Not Found)

**Problem:**
- Frontend logs showed: `models/gemini-1.5-flash is not found for API version v1`
- The production environment was using `gemini-1.5-flash` which is not available in the v1 API

**Root Cause:**
- Production environment variable `GEMINI_MODEL` was set to `gemini-1.5-flash`
- This model name is not available or not supported for `generateContent` in the v1 API

**Fix:**
- Code already defaults to `gemini-2.0-flash` if `GEMINI_MODEL` is not set
- **ACTION REQUIRED:** Update production environment variable on Render:
  ```bash
  GEMINI_MODEL=gemini-2.0-flash
  ```

**Files Modified:**
- `lib/intent.ts` - Already defaults to `gemini-2.0-flash` ✅
- `lib/summary.ts` - Already defaults to `gemini-2.5-flash` (which gets converted to `gemini-2.0-flash`) ✅

**Deployment Steps:**
1. Go to Render Dashboard → Frontend Service → Environment
2. Update `GEMINI_MODEL` from `gemini-1.5-flash` to `gemini-2.0-flash`
3. Save and redeploy (or wait for auto-deploy)

---

### 2. ✅ ASR Worker Timer Logic - Enforcing 2000ms Minimum for ElevenLabs

**Problem:**
- ASR Worker logs showed chunks of `1140ms`, `1160ms`, `1180ms` being sent to ElevenLabs
- Despite previous fix to enforce 2000ms minimum, timer was still allowing sends < 2000ms in timeout scenarios
- Logs showed: `reason: 'very-long-timeout'` with `minRequired: 2000` but `currentAudioDurationMs: '1140'`

**Root Cause:**
- Timer logic at line 1191 allowed `isVeryLongTimeout` to trigger sends even when `currentAudioDurationMs < MIN_CHUNK_DURATION_MS`
- The check `currentAudioDurationMs >= minChunkForSend` was being bypassed for timeout scenarios

**Fix Applied:**
- Added `finalShouldProcess` logic that **ALWAYS** requires `currentAudioDurationMs >= MIN_CHUNK_DURATION_MS` for ElevenLabs
- For ElevenLabs, even in timeout scenarios, we now **NEVER** send chunks < 2000ms
- Better to wait longer than send suboptimal chunks that won't transcribe properly

**Files Modified:**
- `services/asr-worker/src/index.ts` (lines ~1196-1249)

**Code Changes:**
```typescript
// CRITICAL FIX: For ElevenLabs, override shouldProcess to FALSE if we don't have minimum chunk size
// This prevents sending chunks < 2000ms even in timeout scenarios
// Better to wait longer than send suboptimal chunks that won't transcribe properly
const finalShouldProcess = isElevenLabs
  ? (shouldProcess && currentAudioDurationMs >= MIN_CHUNK_DURATION_MS) // For ElevenLabs, MUST have 2000ms minimum
  : shouldProcess; // For Deepgram, use original logic
```

**Impact:**
- ✅ ElevenLabs will now **ALWAYS** receive chunks of at least 2000ms (2 seconds)
- ✅ Better transcription quality (ElevenLabs requires 2 seconds minimum per official docs)
- ⚠️ May cause longer delays if audio stream is consistently silent or very slow

---

### 3. ✅ TypeError: a.findIndex is not a function

**Problem:**
- Frontend logs showed: `TypeError: a.findIndex is not a function at a (.next/server/chunks/_152d29c4._.js:139:93817)`
- Error occurred in `RedisStreamsAdapter` when processing messages

**Root Cause:**
- Redis message format sometimes returns `fields` as a non-array (object or other type)
- Code assumed `fields` was always an array and called `findIndex()` without validation

**Fix Applied:**
- Added `Array.isArray()` check before calling `findIndex()`
- Skip invalid messages with detailed error logging
- Applied to both pending message processing and regular message processing

**Files Modified:**
- `lib/pubsub/adapters/redisStreamsAdapter.ts` (2 locations: lines ~451 and ~565)

**Code Changes:**
```typescript
// CRITICAL FIX: Ensure fields is an array before calling findIndex
if (!Array.isArray(fields)) {
  console.error(`[RedisStreamsAdapter] Invalid message format: fields is not an array`, {
    msgId,
    fieldsType: typeof fields,
    fieldsValue: fields,
    messageEntry,
  });
  continue; // Skip this message
}
const dataIndex = fields.findIndex((f: string) => f === 'data');
```

**Impact:**
- ✅ Prevents crashes when Redis returns unexpected message format
- ✅ Better error logging for debugging
- ✅ System continues processing other messages even if one is malformed

---

### 4. ✅ Duplicate Key Error in Supabase (ingest_events_call_id_seq_key)

**Problem:**
- Frontend logs showed: `duplicate key value violates unique constraint "ingest_events_call_id_seq_key"`
- Error code: `23505`
- Same transcript chunk being inserted multiple times with same `(call_id, seq)` combination

**Root Cause:**
- Same transcript chunk can be sent multiple times due to:
  - Retry mechanisms
  - Multiple transcript consumer instances processing the same message
  - Race conditions in message processing

**Fix Applied:**
- Changed from `insert()` to `upsert()` with `onConflict: 'call_id,seq'`
- Gracefully handles duplicates by updating existing records
- Improved error logging to distinguish duplicate errors from other errors

**Files Modified:**
- `app/api/calls/ingest-transcript/route.ts` (lines ~156-176)

**Code Changes:**
```typescript
// CRITICAL FIX: Use ON CONFLICT to handle duplicate (call_id, seq) gracefully
const { data, error } = await (supabase as any)
  .from('ingest_events')
  .upsert({
    call_id: body.callId,
    seq: body.seq,
    ts: body.ts,
    text: body.text,
    created_at: new Date().toISOString(),
  }, {
    onConflict: 'call_id,seq',
    ignoreDuplicates: false, // Update if duplicate exists
  })
  .select();
```

**Impact:**
- ✅ No more duplicate key errors in logs
- ✅ System gracefully handles retries and duplicate messages
- ✅ Better data consistency (updates existing records instead of failing)

---

## Deployment Checklist

### Before Deployment

- [ ] Review all code changes
- [ ] Test locally if possible
- [ ] Verify environment variables are correct

### Deployment Steps

1. **ASR Worker Service:**
   - [ ] Commit and push changes to `services/asr-worker/src/index.ts`
   - [ ] Render will auto-deploy (or manually trigger deployment)
   - [ ] Verify deployment logs show successful build

2. **Frontend Service:**
   - [ ] Commit and push changes to:
     - `lib/pubsub/adapters/redisStreamsAdapter.ts`
     - `app/api/calls/ingest-transcript/route.ts`
   - [ ] **CRITICAL:** Update environment variable on Render:
     - Go to Render Dashboard → Frontend Service → Environment
     - Update `GEMINI_MODEL=gemini-2.0-flash` (if not already set)
     - Save changes
   - [ ] Render will auto-deploy (or manually trigger deployment)
   - [ ] Verify deployment logs show successful build

3. **Post-Deployment Verification:**
   - [ ] Check ASR Worker logs - should show chunks >= 2000ms for ElevenLabs
   - [ ] Check Frontend logs - should NOT show `findIndex` errors
   - [ ] Check Frontend logs - should NOT show duplicate key errors
   - [ ] Check Frontend logs - should NOT show Gemini 404 errors
   - [ ] Test a live call and verify:
     - Transcripts appear in UI
     - KB suggestions work (intent detection)
     - No errors in logs

---

## Expected Behavior After Fixes

### ASR Worker
- ✅ **ALWAYS** sends chunks >= 2000ms (2 seconds) to ElevenLabs
- ✅ Logs show: `minRequired: 2000` and `currentAudioDurationMs >= 2000` before sending
- ✅ Even in timeout scenarios, waits for minimum chunk size

### Frontend
- ✅ No `TypeError: a.findIndex is not a function` errors
- ✅ No `duplicate key value violates unique constraint` errors
- ✅ No `models/gemini-1.5-flash is not found` errors
- ✅ Intent detection works (KB suggestions)
- ✅ Transcripts display correctly in UI

---

## Monitoring

After deployment, monitor these metrics:

1. **ASR Worker:**
   - Chunk sizes sent to ElevenLabs (should be >= 2000ms)
   - Transcription quality (should improve with larger chunks)
   - Timeout frequency (may increase if audio stream is slow)

2. **Frontend:**
   - Error rate (should decrease significantly)
   - Intent detection success rate (should work with correct Gemini model)
   - Transcript display rate (should improve with better ASR chunks)

3. **Supabase:**
   - Duplicate key errors (should be zero)
   - Insert success rate (should be 100%)

---

## Rollback Plan

If issues occur after deployment:

1. **ASR Worker:**
   - Revert commit for `services/asr-worker/src/index.ts`
   - Redeploy on Render

2. **Frontend:**
   - Revert commits for:
     - `lib/pubsub/adapters/redisStreamsAdapter.ts`
     - `app/api/calls/ingest-transcript/route.ts`
   - Revert `GEMINI_MODEL` environment variable if needed
   - Redeploy on Render

---

## Notes

- The Gemini model fix requires **manual environment variable update** on Render
- The ASR worker fix may cause longer delays if audio stream is consistently silent
- The duplicate key fix uses `upsert()` which updates existing records (this is intentional)
- All fixes are backward compatible and should not break existing functionality

---

## Questions or Issues?

If you encounter any issues after deployment:
1. Check Render logs for the specific service
2. Verify environment variables are set correctly
3. Check Supabase logs for database errors
4. Review ASR Worker metrics for chunk sizes and transcription quality


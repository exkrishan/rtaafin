# 🔍 Frontend Transcript Processing Diagnostic Report

## Issue Summary
Intent identification, KB article surfacing, disposition recommendation, and disposition generation are not working.

---

## 🔍 Root Cause Analysis

### 1. **Transcript Consumer Status** ⚠️ CRITICAL

**Issue**: The transcript consumer may not be running or may not be reading transcripts from Redis Lists.

**Flow**:
```
ASR Worker → Redis List (transcripts:${callId}) → Transcript Consumer → ingestTranscriptCore → Intent/KB/SSE
```

**Check Points**:
- [ ] Is the transcript consumer running? Check `/api/transcripts/status`
- [ ] Is it subscribed to the correct `callId`? Check subscriptions
- [ ] Is it reading from Redis Lists? Check logs for "Processed transcript from Redis List"
- [ ] Are transcripts in Redis? Check `transcripts:${callId}` key

**Diagnostic Commands**:
```bash
# Check consumer status
curl https://frontend-8jdd.onrender.com/api/transcripts/status

# Check if consumer is running
curl https://frontend-8jdd.onrender.com/api/health

# Manually start consumer if needed
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/start

# Subscribe to specific callId
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/subscribe \
  -H "Content-Type: application/json" \
  -d '{"interactionId": "YOUR_CALL_ID"}'
```

---

### 2. **Intent Detection Flow** ⚠️ POTENTIAL ISSUE

**Issue**: Intent detection is fire-and-forget (non-blocking), so errors might be silently failing.

**Code Location**: `lib/ingest-transcript-core.ts:389-394`

**Flow**:
```typescript
// Fire and forget - don't await intent detection (non-blocking)
if (shouldDetectIntent) {
  detectIntentAndSurfaceKB(validatedCallId, params.text, params.seq, tenantId)
    .catch(err => {
      console.error('[ingest-transcript-core] Intent detection failed (non-blocking):', err);
    });
}
```

**Potential Issues**:
1. **Minimum Text Length**: Only triggers if `text.trim().length >= 5`
2. **Silent Failures**: Errors are caught but may not be logged properly
3. **Async Execution**: No way to verify if it actually ran

**Check Points**:
- [ ] Are transcripts reaching `ingestTranscriptCore`? Check logs for "Received transcript message"
- [ ] Is text length >= 5 characters? Check `MIN_TEXT_LENGTH_FOR_INTENT`
- [ ] Are there errors in `detectIntent`? Check logs for "Intent detection failed"
- [ ] Is Gemini API configured? Check `GEMINI_API_KEY` environment variable

---

### 3. **KB Article Surfacing** ⚠️ POTENTIAL ISSUE

**Issue**: KB surfacing is also fire-and-forget and may be failing silently.

**Code Location**: `lib/ingest-transcript-core.ts:398-401`

**Flow**:
```typescript
// CRITICAL FIX: Always try to surface KB articles
surfaceKBFromText(validatedCallId, params.text, params.seq, tenantId)
  .catch(err => {
    console.error('[ingest-transcript-core] KB surfacing failed (non-blocking):', err);
  });
```

**Potential Issues**:
1. **KB Adapter Configuration**: May not be configured correctly
2. **Database Connection**: Supabase connection might be failing
3. **Empty Results**: KB search might return empty but not log it
4. **SSE Broadcasting**: Articles might be found but not broadcasted

**Check Points**:
- [ ] Is KB adapter configured? Check `getKbAdapter()` function
- [ ] Are KB articles in database? Check `kb_articles` table in Supabase
- [ ] Is SSE broadcasting working? Check logs for "Broadcast intent_update"
- [ ] Are frontend clients connected? Check SSE connection status

---

### 4. **Disposition Generation** ⚠️ POTENTIAL ISSUE

**Issue**: Disposition generation depends on having full transcript, which may not be available.

**Code Location**: `app/api/calls/end/route.ts:150-191`

**Flow**:
```typescript
// Generate disposition from transcript
const summaryResult = await generateCallSummary(interactionId, fullTranscript);
```

**Potential Issues**:
1. **Transcript Not Available**: Full transcript might not be fetched from Redis
2. **Call End Not Triggered**: `/api/calls/end` might not be called
3. **Summary Generation Fails**: `generateCallSummary` might be failing silently
4. **Transcript Format**: Transcript might be in wrong format

**Check Points**:
- [ ] Is `/api/calls/end` being called? Check frontend logs
- [ ] Is full transcript available? Check `fullTranscript` variable in logs
- [ ] Is `generateCallSummary` working? Check logs for "Generating disposition"
- [ ] Are transcripts in Redis Lists? Check `transcripts:${callId}` key

---

### 5. **SSE Broadcasting** ⚠️ POTENTIAL ISSUE

**Issue**: Events might be broadcasted but frontend might not be receiving them.

**Code Location**: `lib/realtime.ts:258`

**Flow**:
```typescript
export function broadcastEvent(event: RealtimeEvent): void {
  // Broadcast to SSE clients
}
```

**Potential Issues**:
1. **No Connected Clients**: Frontend might not be connected to SSE
2. **CallId Mismatch**: `callId` in event might not match frontend's `callId`
3. **SSE Disabled**: Polling mode might be enabled, disabling SSE
4. **Event Type Mismatch**: Frontend might be listening for wrong event type

**Check Points**:
- [ ] Are SSE clients connected? Check logs for "Broadcast event with X recipients"
- [ ] Is polling mode disabled? Check `pollMode` flag in frontend
- [ ] Is `callId` matching? Check callId in broadcast vs frontend
- [ ] Are event types correct? Check `intent_update` vs `transcript_line`

---

## 🔧 Diagnostic Checklist

### Step 1: Verify Transcript Consumer is Running
```bash
# Check status
curl https://frontend-8jdd.onrender.com/api/transcripts/status

# Expected response:
{
  "ok": true,
  "isRunning": true,
  "subscriptionCount": 1,
  "subscriptions": [...]
}
```

### Step 2: Verify Transcripts are in Redis
```bash
# Connect to Redis and check
redis-cli -u $REDIS_URL
> LRANGE transcripts:YOUR_CALL_ID 0 -1
```

### Step 3: Verify Transcript Consumer is Processing
Check logs for:
- `[TranscriptConsumer] ✅ Processed transcript from Redis List`
- `[TranscriptConsumer] Processing transcript via direct function call`
- `[ingest-transcript-core] Received transcript message`

### Step 4: Verify Intent Detection is Running
Check logs for:
- `[ingest-transcript-core] Detecting intent for seq:`
- `[ingest-transcript-core] Intent detected:`
- `[ingest-transcript-core] Intent stored in database`

### Step 5: Verify KB Articles are Being Surfaced
Check logs for:
- `[ingest-transcript-core] Fetching KB articles from transcript text`
- `[ingest-transcript-core] Found KB articles from text search:`
- `[ingest-transcript-core] ✅ Broadcast KB articles`

### Step 6: Verify SSE Broadcasting
Check logs for:
- `[ingest-transcript-core] 📤 Broadcasting intent_update`
- `[realtime] Broadcasting event to X clients`
- `[realtime] ⚠️ Broadcast event with 0 recipients` (if no clients)

### Step 7: Verify Disposition Generation
Check logs for:
- `[call-end] Generating disposition from transcript`
- `[call-end] ✅ Disposition generated`
- `[api][calls][summary] Generating call summary`

---

## 🛠️ Fixes Required

### Fix 1: Ensure Transcript Consumer is Running
**Action**: Add health check and auto-start mechanism

**File**: `app/api/health/route.ts` (already exists, verify it's working)

### Fix 2: Add Better Logging for Intent Detection
**Action**: Add more detailed logging to track intent detection flow

**File**: `lib/ingest-transcript-core.ts`

### Fix 3: Add Better Logging for KB Surfacing
**Action**: Add logging to track KB article search and results

**File**: `lib/ingest-transcript-core.ts`

### Fix 4: Verify SSE Connection
**Action**: Add logging to verify frontend is connected to SSE

**File**: `lib/realtime.ts`

### Fix 5: Verify Disposition Generation Trigger
**Action**: Ensure `/api/calls/end` is called when call ends

**File**: `app/live/page.tsx`

---

## 📊 Expected Log Flow

When working correctly, you should see this sequence:

1. **ASR Worker**:
   ```
   [ASRWORKER] 📤 Pushed transcript to Redis List transcripts:${callId}
   ```

2. **Transcript Consumer**:
   ```
   [TranscriptConsumer] ✅ Processed transcript from Redis List
   [TranscriptConsumer] Processing transcript via direct function call
   ```

3. **Ingest Core**:
   ```
   [ingest-transcript-core] Detecting intent for seq: X
   [ingest-transcript-core] Intent detected: { intent: '...', confidence: 0.9 }
   [ingest-transcript-core] Fetching KB articles from transcript text
   [ingest-transcript-core] Found KB articles from text search: { count: 3 }
   [ingest-transcript-core] 📤 Broadcasting intent_update
   ```

4. **SSE Broadcast**:
   ```
   [realtime] Broadcasting event to 1 clients
   ```

5. **Frontend**:
   ```
   [AgentAssistPanel] Received intent_update event
   ```

---

## 🚨 Common Issues & Solutions

### Issue 1: Transcript Consumer Not Running
**Solution**: 
```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/start
```

### Issue 2: Transcripts Not in Redis
**Solution**: Check ASR worker logs to verify it's pushing to Redis Lists

### Issue 3: Intent Detection Not Running
**Solution**: Check `MIN_TEXT_LENGTH_FOR_INTENT` (should be 5) and verify text length

### Issue 4: KB Articles Not Found
**Solution**: Verify `kb_articles` table has data in Supabase

### Issue 5: SSE Not Connected
**Solution**: Check if polling mode is enabled (should be disabled for SSE)

### Issue 6: Disposition Not Generated
**Solution**: Verify `/api/calls/end` is called and full transcript is available

---

## 📝 Next Steps

1. **Run Diagnostic Commands**: Execute all diagnostic commands above
2. **Check Logs**: Review logs for each step in the flow
3. **Verify Configuration**: Check environment variables and database connections
4. **Test Manually**: Test each component individually
5. **Fix Issues**: Address each issue found in the diagnostic

---

## 🔗 Related Files

- `lib/transcript-consumer.ts` - Transcript consumer implementation
- `lib/ingest-transcript-core.ts` - Intent detection and KB surfacing
- `lib/realtime.ts` - SSE broadcasting
- `app/api/calls/end/route.ts` - Disposition generation
- `app/api/calls/summary/route.ts` - Summary generation
- `app/api/transcripts/subscribe/route.ts` - Subscription endpoint
- `instrumentation.ts` - Auto-start transcript consumer


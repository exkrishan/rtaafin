# 🔧 Frontend Transcript Processing - Action Plan

## Quick Diagnostic Commands

Run these commands to diagnose the issue:

```bash
# 1. Check if transcript consumer is running
curl https://frontend-8jdd.onrender.com/api/transcripts/status

# 2. Check overall health
curl https://frontend-8jdd.onrender.com/api/health

# 3. Manually start consumer if not running
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/start

# 4. Subscribe to a specific callId (replace with actual callId)
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/subscribe \
  -H "Content-Type: application/json" \
  -d '{"interactionId": "YOUR_CALL_ID_HERE"}'
```

---

## 🔍 Most Likely Issues

### Issue #1: Transcript Consumer Not Running ⚠️ HIGH PRIORITY

**Symptoms**:
- No logs showing "Processed transcript from Redis List"
- `/api/transcripts/status` returns `isRunning: false`

**Fix**:
1. Check if `instrumentation.ts` is being executed
2. Manually start consumer via API
3. Verify Next.js is running in Node.js runtime (not Edge)

**Action**:
```bash
# Start consumer manually
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/start
```

---

### Issue #2: Transcript Consumer Not Subscribed to CallId ⚠️ HIGH PRIORITY

**Symptoms**:
- Consumer is running but not processing transcripts
- No subscriptions in `/api/transcripts/status`

**Fix**:
1. Ensure frontend calls `/api/transcripts/subscribe` when call starts
2. Check `app/live/page.tsx` - should call subscribe on `callId` change

**Action**: Verify this code is in `app/live/page.tsx`:
```typescript
useEffect(() => {
  if (!callId || callId.trim().length === 0) {
    return;
  }

  console.log('[Live] Subscribing to transcripts for:', callId);
  fetch('/api/transcripts/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interactionId: callId }),
  })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        console.info('[Live] ✅ Subscribed to transcripts', { interactionId: callId });
      } else {
        console.error('[Live] ❌ Failed to subscribe to transcripts', data);
      }
    })
    .catch(err => {
      console.error('[Live] ❌ Error subscribing to transcripts:', err);
    });
}, [callId]);
```

---

### Issue #3: Transcripts Not in Redis Lists ⚠️ MEDIUM PRIORITY

**Symptoms**:
- Consumer is running and subscribed but no transcripts processed
- ASR worker logs show "Pushed transcript to Redis List" but consumer doesn't see them

**Fix**:
1. Verify ASR worker is writing to correct key: `transcripts:${callId}`
2. Check Redis connection in transcript consumer
3. Verify `callId` matches between ASR worker and frontend

**Action**: Check ASR worker logs for:
```
[ASRWORKER] 📤 Pushed transcript to Redis List transcripts:${callId}
```

---

### Issue #4: Intent Detection Failing Silently ⚠️ MEDIUM PRIORITY

**Symptoms**:
- Transcripts are processed but no intent detected
- No logs showing "Intent detected"

**Potential Causes**:
1. Text too short (< 5 characters)
2. Gemini API key not configured
3. `detectIntent` function failing

**Fix**: Add better error logging in `lib/ingest-transcript-core.ts`:
```typescript
// Around line 389
if (shouldDetectIntent) {
  console.info('[ingest-transcript-core] 🔍 Starting intent detection', {
    callId: validatedCallId,
    seq: params.seq,
    textLength: params.text.length,
    textPreview: params.text.substring(0, 50),
  });
  
  detectIntentAndSurfaceKB(validatedCallId, params.text, params.seq, tenantId)
    .then(result => {
      console.info('[ingest-transcript-core] ✅ Intent detection completed', {
        callId: validatedCallId,
        seq: params.seq,
        intent: result.intent,
        confidence: result.confidence,
      });
    })
    .catch(err => {
      console.error('[ingest-transcript-core] ❌ Intent detection failed (non-blocking):', {
        callId: validatedCallId,
        seq: params.seq,
        error: err.message || String(err),
        stack: err.stack,
      });
    });
}
```

---

### Issue #5: KB Articles Not Surfacing ⚠️ MEDIUM PRIORITY

**Symptoms**:
- Intent detected but no KB articles shown
- No logs showing "Found KB articles"

**Potential Causes**:
1. KB adapter not configured
2. No articles in database
3. Search query not matching articles
4. SSE broadcast not reaching frontend

**Fix**: Add better logging in `lib/ingest-transcript-core.ts`:
```typescript
// Around line 398
console.info('[ingest-transcript-core] 🔍 Starting KB surfacing', {
  callId: validatedCallId,
  seq: params.seq,
  textLength: params.text.length,
});

surfaceKBFromText(validatedCallId, params.text, params.seq, tenantId)
  .then(articles => {
    console.info('[ingest-transcript-core] ✅ KB surfacing completed', {
      callId: validatedCallId,
      seq: params.seq,
      articlesCount: articles.length,
    });
  })
  .catch(err => {
    console.error('[ingest-transcript-core] ❌ KB surfacing failed (non-blocking):', {
      callId: validatedCallId,
      seq: params.seq,
      error: err.message || String(err),
      stack: err.stack,
    });
  });
```

---

### Issue #6: SSE Not Broadcasting or Frontend Not Receiving ⚠️ MEDIUM PRIORITY

**Symptoms**:
- Intent/KB detected but frontend doesn't show them
- Logs show "Broadcast event with 0 recipients"

**Potential Causes**:
1. Frontend not connected to SSE
2. Polling mode enabled (disables SSE)
3. `callId` mismatch between broadcast and frontend
4. Frontend not listening for `intent_update` events

**Fix**: 
1. Check if polling mode is disabled in frontend
2. Verify SSE connection in frontend logs
3. Check `callId` matching

**Action**: Check `hooks/useRealtimeTranscript.ts` and `components/AgentAssistPanelV2.tsx` for:
- `pollMode` should be `false` for SSE
- SSE connection should be established
- Event listener for `intent_update` should be registered

---

### Issue #7: Disposition Not Generated ⚠️ LOW PRIORITY

**Symptoms**:
- Call ends but no disposition shown
- `/api/calls/end` not called or failing

**Potential Causes**:
1. `/api/calls/end` not called when call ends
2. Full transcript not available
3. `generateCallSummary` failing

**Fix**: 
1. Verify `/api/calls/end` is called in `app/live/page.tsx` when call ends
2. Check if full transcript is fetched from Redis
3. Add error logging in `app/api/calls/end/route.ts`

---

## 📋 Step-by-Step Diagnostic Process

### Step 1: Check Transcript Consumer Status
```bash
curl https://frontend-8jdd.onrender.com/api/transcripts/status
```

**Expected**:
```json
{
  "ok": true,
  "isRunning": true,
  "subscriptionCount": 1,
  "subscriptions": [
    {
      "interactionId": "your-call-id",
      "transcriptCount": 10
    }
  ]
}
```

**If `isRunning: false`**: Start it manually
**If `subscriptionCount: 0`**: Subscribe to callId

---

### Step 2: Check if Transcripts are in Redis
Connect to Redis and check:
```bash
redis-cli -u $REDIS_URL
> LRANGE transcripts:YOUR_CALL_ID 0 -1
```

**Expected**: Array of JSON transcript objects

**If empty**: Check ASR worker logs to verify it's writing to Redis

---

### Step 3: Check Transcript Processing Logs
Look for these log patterns in Render logs:

1. **Transcript Consumer Processing**:
   ```
   [TranscriptConsumer] ✅ Processed transcript from Redis List
   ```

2. **Intent Detection Starting**:
   ```
   [ingest-transcript-core] Detecting intent for seq:
   ```

3. **Intent Detected**:
   ```
   [ingest-transcript-core] Intent detected: { intent: '...', confidence: 0.9 }
   ```

4. **KB Articles Found**:
   ```
   [ingest-transcript-core] Found KB articles from text search: { count: 3 }
   ```

5. **SSE Broadcast**:
   ```
   [ingest-transcript-core] 📤 Broadcasting intent_update
   [realtime] Broadcasting event to 1 clients
   ```

---

### Step 4: Check Frontend Connection
Look for these in browser console:

1. **SSE Connection**:
   ```
   [useRealtimeTranscript] 🔌 Connecting to SSE
   [AgentAssistPanel] Starting SSE connection
   ```

2. **Intent Update Received**:
   ```
   [AgentAssistPanel] Received intent_update event
   ```

**If not seeing these**: Check if polling mode is enabled

---

## 🛠️ Immediate Actions

1. **Start Transcript Consumer** (if not running):
   ```bash
   curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/start
   ```

2. **Subscribe to Active Call** (replace with actual callId):
   ```bash
   curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/subscribe \
     -H "Content-Type: application/json" \
     -d '{"interactionId": "YOUR_CALL_ID"}'
   ```

3. **Check Health Status**:
   ```bash
   curl https://frontend-8jdd.onrender.com/api/health
   ```

4. **Review Logs**: Check Render logs for the patterns mentioned above

---

## 🔗 Key Files to Review

1. **`lib/transcript-consumer.ts`** - Transcript consumer implementation
2. **`lib/ingest-transcript-core.ts`** - Intent detection and KB surfacing
3. **`app/live/page.tsx`** - Frontend call handling and subscription
4. **`hooks/useRealtimeTranscript.ts`** - SSE connection and event handling
5. **`components/AgentAssistPanelV2.tsx`** - UI component receiving events
6. **`instrumentation.ts`** - Auto-start transcript consumer

---

## 📞 Next Steps

1. Run diagnostic commands above
2. Check Render logs for error patterns
3. Verify transcript consumer is running and subscribed
4. Test with a live call and monitor logs
5. Fix issues found in diagnostic


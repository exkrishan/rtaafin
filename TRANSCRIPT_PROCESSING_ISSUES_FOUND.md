# 🔍 Transcript Processing Issues - Diagnostic Results

## ✅ What's Working

1. **Frontend Subscription**: ✅ `app/live/page.tsx` correctly subscribes to transcripts when `callId` changes (lines 242-265)
2. **Transcript Consumer**: ✅ Has Redis List reader implementation (lines 253-334)
3. **Auto-Start**: ✅ Health endpoint can auto-start consumer if not running
4. **Instrumentation**: ✅ `instrumentation.ts` exists and should auto-start on Next.js startup
5. **Disposition Generation**: ✅ `/api/calls/end` fetches transcripts from both Supabase and Redis Lists

---

## 🚨 CRITICAL ISSUE #1: Polling Mode Disables SSE

**Location**: `hooks/useRealtimeTranscript.ts:97`

**Issue**:
```typescript
const pollMode = true; // ⚠️ THIS DISABLES SSE!
```

**Impact**:
- Intent updates are broadcasted via SSE (`intent_update` events)
- KB articles are broadcasted via SSE (`intent_update` events)
- **BUT**: Polling mode disables SSE, so frontend never receives these events!

**Flow**:
```
Transcript Consumer → ingestTranscriptCore → detectIntentAndSurfaceKB → broadcastEvent(intent_update)
                                                                              ↓
                                                                    SSE Broadcast (but frontend not listening!)
```

**Fix Required**:
1. Either set `pollMode = false` to enable SSE
2. OR modify polling endpoint to include intent/KB data
3. OR add separate polling endpoint for intent/KB updates

---

## 🚨 CRITICAL ISSUE #2: Polling Endpoint Doesn't Return Intent/KB

**Location**: `app/api/transcripts/latest/route.ts`

**Current Response**:
```typescript
{
  ok: true,
  callId: string,
  transcripts: TranscriptUtterance[], // Only transcripts, no intent/KB
  count: number
}
```

**Missing**:
- Intent information
- KB articles
- Confidence scores

**Impact**: Even if polling mode is used, intent/KB data is not available via polling endpoint.

---

## ⚠️ POTENTIAL ISSUE #3: Transcript Consumer May Not Be Running

**Check Required**:
```bash
curl https://frontend-8jdd.onrender.com/api/transcripts/status
```

**Expected**:
```json
{
  "ok": true,
  "isRunning": true,
  "subscriptionCount": 1
}
```

**If `isRunning: false`**: Consumer needs to be started manually or via health check.

---

## ⚠️ POTENTIAL ISSUE #4: Redis List Reader May Not Be Active

**Check Required**: Look for this log pattern:
```
[TranscriptConsumer] ✅ Processed transcript from Redis List
```

**If not present**: 
- Consumer may not be subscribed to the callId
- Redis connection may be failing
- Transcripts may not be in Redis Lists

---

## ⚠️ POTENTIAL ISSUE #5: Intent Detection May Be Failing Silently

**Check Required**: Look for these log patterns:
```
[ingest-transcript-core] Detecting intent for seq: X
[ingest-transcript-core] Intent detected: { intent: '...', confidence: 0.9 }
```

**If not present**:
- Text may be too short (< 5 characters)
- Gemini API key may not be configured
- `detectIntent` function may be failing

---

## ⚠️ POTENTIAL ISSUE #6: KB Articles May Not Be Found

**Check Required**: Look for these log patterns:
```
[ingest-transcript-core] Fetching KB articles from transcript text
[ingest-transcript-core] Found KB articles from text search: { count: 3 }
```

**If not present**:
- KB adapter may not be configured
- No articles in database
- Search query not matching articles

---

## 🔧 Recommended Fixes

### Fix #1: Enable SSE for Intent/KB Updates (RECOMMENDED)

**File**: `hooks/useRealtimeTranscript.ts`

**Change**:
```typescript
// Change from:
const pollMode = true;

// To:
const pollMode = false; // Enable SSE for real-time intent/KB updates
```

**OR**: Keep polling for transcripts but add separate SSE connection for intent/KB:
```typescript
const pollMode = true; // For transcripts
const useSseForIntent = true; // Separate SSE for intent/KB
```

---

### Fix #2: Add Intent/KB to Polling Endpoint (ALTERNATIVE)

**File**: `app/api/transcripts/latest/route.ts`

**Add**: Fetch latest intent and KB articles from database/Redis and include in response:
```typescript
// Fetch latest intent
const latestIntent = await getLatestIntent(callId);

// Fetch KB articles
const kbArticles = await getKBArticlesForCall(callId);

return NextResponse.json({
  ok: true,
  callId,
  transcripts,
  count: transcripts.length,
  intent: latestIntent?.intent || 'unknown',
  confidence: latestIntent?.confidence || 0,
  articles: kbArticles || [],
});
```

---

### Fix #3: Verify Transcript Consumer is Running

**Action**: Check status and start if needed:
```bash
# Check status
curl https://frontend-8jdd.onrender.com/api/transcripts/status

# Start if not running
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/start
```

---

### Fix #4: Add Better Logging

**Files**: 
- `lib/ingest-transcript-core.ts` (add logging around intent detection)
- `lib/transcript-consumer.ts` (add logging for Redis List reads)

**Purpose**: Track the flow to identify where it's breaking.

---

## 📊 Expected Flow (When Working)

1. **ASR Worker** → Pushes transcript to Redis List `transcripts:${callId}`
2. **Transcript Consumer** → Reads from Redis List every 2 seconds
3. **Transcript Consumer** → Calls `ingestTranscriptCore()` directly
4. **ingestTranscriptCore** → Triggers `detectIntentAndSurfaceKB()` (fire-and-forget)
5. **detectIntentAndSurfaceKB** → Detects intent, fetches KB articles
6. **detectIntentAndSurfaceKB** → Calls `broadcastEvent(intent_update)` with intent + KB
7. **SSE Broadcast** → Sends `intent_update` event to connected clients
8. **Frontend** → Receives `intent_update` event and updates UI

**Current State**: Step 7-8 is broken because SSE is disabled in polling mode.

---

## 🎯 Immediate Actions

1. **Check Polling Mode**: Verify `pollMode` setting in `hooks/useRealtimeTranscript.ts`
2. **Check Consumer Status**: Run diagnostic command to verify consumer is running
3. **Check Logs**: Look for the log patterns mentioned above
4. **Fix SSE/Polling**: Either enable SSE or add intent/KB to polling endpoint

---

## 📝 Summary

**Root Cause**: Polling mode (`pollMode = true`) disables SSE, so intent updates and KB articles are broadcasted but never received by the frontend.

**Solution**: 
- Option A: Disable polling mode (`pollMode = false`) to enable SSE
- Option B: Keep polling but add intent/KB data to polling endpoint
- Option C: Use hybrid approach (polling for transcripts, SSE for intent/KB)


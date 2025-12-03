# Simple Flow Diagram - For CTO Review

## Current System Flow (What SHOULD Happen)

```
┌──────────────────┐
│  External ASR    │  Your team's Azure Speech SDK service
│  WebSocket       │  (Transcribes audio in real-time)
└────────┬─────────┘
         │
         │ Every 100-500ms
         │ POST /api/transcripts/receive
         │ { callId, transcript, timestamp, isFinal }
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│             FRONTEND API ENDPOINT                         │
│  POST /api/transcripts/receive                           │
│  ────────────────────────────────────────────────────    │
│  • Validates request (callId, transcript, timestamp)     │
│  • Auto-generates seq number                             │
│  • Returns 200 OK in <100ms (doesn't wait)              │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ Fire-and-forget async call
                   │ ingestTranscriptCore()
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│          TRANSCRIPT PROCESSING ENGINE                     │
│  lib/ingest-transcript-core.ts                           │
│  ────────────────────────────────────────────────────    │
│                                                           │
│  [Step 1] Detect Speaker (customer/agent)                │
│           ↓                                               │
│  [Step 2] INSERT INTO ingest_events                      │
│           (Supabase database)                             │
│           ↓                                               │
│  [Step 3] Broadcast SSE event (optional)                 │
│           ↓                                               │
│  [Step 4] Detect Intent (async, Google Gemini LLM)       │
│           ↓                                               │
│  [Step 5] Search KB Articles (async, Supabase)           │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ All data stored in Supabase
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│               SUPABASE DATABASE                           │
│  (PostgreSQL - Cloud Hosted)                             │
│  ────────────────────────────────────────────────────    │
│                                                           │
│  📊 ingest_events table                                  │
│     call_id | seq | text      | speaker  | ts           │
│     c89034  | 1   | "Hello"   | customer | 12:00:00     │
│     c89034  | 2   | "Hi"      | agent    | 12:00:01     │
│                                                           │
│  🎯 intents table                                        │
│     call_id | intent          | confidence               │
│     c89034  | account_inquiry | 0.8                      │
│                                                           │
│  📚 kb_articles table                                    │
│     id  | title                  | snippet               │
│     kb1 | Account Balance FAQ    | How to check...       │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ Frontend polls every 5 seconds
                   │ GET /api/transcripts/latest?callId=xxx
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│           FRONTEND POLLING ENDPOINT                       │
│  GET /api/transcripts/latest                             │
│  ────────────────────────────────────────────────────    │
│  • Query ingest_events by callId                         │
│  • Fetch latest intent                                   │
│  • Fetch KB articles                                     │
│  • Return complete data                                  │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ Response: { transcripts, intent, articles }
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│              FRONTEND UI (React)                          │
│  hooks/useRealtimeTranscript.ts                          │
│  ────────────────────────────────────────────────────    │
│                                                           │
│  useEffect(() => {                                        │
│    if (pollMode && callId) {                             │
│      const interval = setInterval(() => {                │
│        fetch(`/api/transcripts/latest?callId=${callId}`) │
│          .then(res => res.json())                         │
│          .then(data => {                                  │
│            setUtterances(data.transcripts); // ← UPDATE   │
│            onIntentUpdate(data.intent, data.articles);    │
│          });                                              │
│      }, 5000);                                            │
│    }                                                      │
│  }, [callId]);                                            │
└──────────────────┬───────────────────────────────────────┘
                   │
                   │ State update triggers re-render
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│            AGENT UI DISPLAY                               │
│  ────────────────────────────────────────────────────    │
│                                                           │
│  💬 Transcript Panel                                     │
│     • Customer: Hello                                    │
│     • Agent: Hi, how can I help?                         │
│     • Customer: I need help with my billing              │
│                                                           │
│  🎯 Intent Badge: account_inquiry (80%)                  │
│                                                           │
│  📚 Knowledge Base Suggestions                           │
│     1. Account Balance FAQ                               │
│     2. Billing Questions                                 │
│     3. Payment Methods                                   │
└──────────────────────────────────────────────────────────┘
```

---

## 🚨 Critical Issue Identified from Your Logs

### **Problem: OLD ARCHITECTURE (TranscriptConsumer) IS STILL RUNNING**

Your logs show:
```
[TranscriptConsumer] Received transcript message
[RedisStreamsAdapter] messages
[TranscriptConsumer] Processing transcript via direct function call
```

This means:
- ❌ TranscriptConsumer is still consuming from Redis Streams
- ❌ The new API is likely also processing transcripts
- ⚠️ **You have DUAL processing happening** (old + new)
- ⚠️ This can cause race conditions and duplicate entries

---

## ⚡ IMMEDIATE FIX REQUIRED

### Option 1: Set Environment Variable (Recommended)

**Go to Render Dashboard:**

1. Frontend Service → **Environment** tab
2. Click **Add Environment Variable**
3. **Key**: `ENABLE_TRANSCRIPT_CONSUMER`
4. **Value**: `false`
5. Click **Save Changes**
6. Service will auto-redeploy

**Wait 2-3 minutes**, then check logs for:
```
✅ "[instrumentation] TranscriptConsumer disabled (using direct API integration)"
```

### Option 2: Hard-Code Disable (If env var doesn't work)

I can hard-code the disable in the code itself. Would you like me to do this?

---

## 🔍 Why UI Isn't Showing Transcripts

Based on your logs, I can see:

1. ✅ Transcripts ARE being stored in Supabase
   ```
   [ingest-transcript-core] Stored in Supabase: [
     { call_id: 'c89034cc555419c3c65441d313bc19bs', seq: 1764318401, text: 'OK' }
   ]
   ```

2. ✅ Intent detection IS working
   ```
   [intent] Detected intent: { raw: 'account_inquiry', confidence: 0.8 }
   ```

3. ✅ KB articles ARE being found
   ```
   [ingest-transcript-core] Found KB articles: { count: 6 }
   ```

4. ✅ Broadcasting IS happening
   ```
   [ingest-transcript-core] ✅ Broadcast transcript_line
   ```

**BUT**:

5. ❓ Is the UI polling the correct `callId`?
6. ❓ Is the UI actually making polling requests?
7. ❓ Is the `/api/transcripts/latest` returning the correct data?

---

## 🧪 Step-by-Step Debug Commands

### Command 1: Check What's in Database

```bash
# See the actual callIds that have transcripts
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=c89034cc555419c3c65441d313bc19bs" | python3 -m json.tool
```

**Expected**: Should show transcripts for this callId

### Command 2: Check UI Logs

Open: https://frontend-8jdd.onrender.com/live

**Browser Console → Look for:**
```javascript
// What callId is the UI using?
"[Live] ✅ CallId updated"
"[useRealtimeTranscript] 🔄 CallId changed"

// Is it polling?
"[useRealtimeTranscript] 📊 Polling for transcripts"

// Does callId match database?
// Compare with: c89034cc555419c3c65441d313bc19bs
```

### Command 3: Check Network Tab

**Browser DevTools → Network → Filter by "transcripts"**

**Look for:**
- Requests to `/api/transcripts/latest?callId=xxx`
- Status: 200 OK
- Response body: Check if `transcripts` array has data

---

## 📋 Provide This Information to CTO

### 1. Environment Status

```bash
# Check on Render Dashboard → Environment
ENABLE_TRANSCRIPT_CONSUMER = ?  # Should be 'false'
NEXT_PUBLIC_SUPABASE_URL = ?    # Should be set
SUPABASE_SERVICE_ROLE_KEY = ?   # Should be set
LLM_PROVIDER = ?                # Should be 'gemini'
GEMINI_API_KEY = ?              # Should be set
```

### 2. Database Query Results

```sql
-- Run in Supabase SQL Editor
SELECT call_id, COUNT(*) as transcript_count, MIN(created_at) as first_seen, MAX(created_at) as last_seen
FROM ingest_events
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY call_id
ORDER BY last_seen DESC
LIMIT 10;
```

### 3. API Test Results

```bash
# Test receiving
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{"callId":"cto-test-001","transcript":"CTO debug test","timestamp":"2024-11-28T12:00:00Z","isFinal":true,"asr_service":"Debug","session_id":null}'

# Test retrieval
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=cto-test-001"
```

### 4. Frontend Logs

From browser console at https://frontend-8jdd.onrender.com/live:
- All logs with `[useRealtimeTranscript]`
- All logs with `[Live]`
- Network requests to `/api/transcripts/latest`

---

## 🎯 Most Likely Issue

Based on your logs showing TranscriptConsumer activity, **99% certain the issue is:**

**The old TranscriptConsumer is still running because `ENABLE_TRANSCRIPT_CONSUMER` env var is not set to `false` on Render.**

This causes:
- Duplicate processing
- Potential race conditions
- Confusion about which architecture is active

**Fix**: Set the environment variable on Render and redeploy.

---

**Share this document with your CTO for debugging session.**


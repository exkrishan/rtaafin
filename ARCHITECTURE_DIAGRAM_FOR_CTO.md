# Real-Time Agent Assist Architecture - CTO Debugging Guide

## 🎯 Executive Summary

**System**: Real-time agent assist with AI-powered intent detection, KB article surfacing, and disposition generation.

**Current Issue**: Transcripts stored in database but not appearing in UI.

**Root Cause Analysis Required**: See debugging checkpoints below.

---

## 📊 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL ASR SERVICE                                │
│                      (Azure Speech SDK / Custom)                             │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               │ HTTP POST (Real-time)
                               │ Every 100-500ms per transcript chunk
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND SERVICE (Next.js)                           │
│                    https://frontend-8jdd.onrender.com                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  POST /api/transcripts/receive                                        │  │
│  │  ────────────────────────────────────────────────────────────────    │  │
│  │  File: app/api/transcripts/receive/route.ts                          │  │
│  │                                                                        │  │
│  │  Input:                                                                │  │
│  │    {                                                                   │  │
│  │      callId: "c89034cc555419c3c65441d313bc19bs",                      │  │
│  │      transcript: "Hello",                                             │  │
│  │      timestamp: "2024-11-28T12:00:00Z",                               │  │
│  │      isFinal: false,                                                  │  │
│  │      asr_service: "Azure"                                             │  │
│  │    }                                                                   │  │
│  │                                                                        │  │
│  │  Processing:                                                           │  │
│  │    1. Validate required fields ✓                                      │  │
│  │    2. Auto-generate seq number (cached 1s) ✓                          │  │
│  │    3. Call ingestTranscriptCore() ✓                                   │  │
│  │    4. Return 200 OK immediately ✓                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                   │                                           │
│                                   │ Fire-and-forget async                    │
│                                   ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  ingestTranscriptCore()                                               │  │
│  │  ───────────────────────────────────────────────────────────────     │  │
│  │  File: lib/ingest-transcript-core.ts                                 │  │
│  │                                                                        │  │
│  │  Step 1: Speaker Detection                                            │  │
│  │    ├─ Analyze text patterns ("hello", "how can I help")              │  │
│  │    ├─ Alternate based on seq number                                  │  │
│  │    └─ Assign: "customer" or "agent"                                  │  │
│  │                                                                        │  │
│  │  Step 2: Store in Supabase ✓                                          │  │
│  │    ├─ Table: ingest_events                                            │  │
│  │    ├─ Fields: call_id, seq, text, ts, speaker, created_at            │  │
│  │    └─ Unique constraint: (call_id, seq)                              │  │
│  │                                                                        │  │
│  │  Step 3: Broadcast via SSE ✓                                          │  │
│  │    ├─ Event: "transcript_line"                                        │  │
│  │    ├─ Target: callId-specific subscribers                             │  │
│  │    └─ Payload: { callId, seq, text, speaker, ts }                    │  │
│  │                                                                        │  │
│  │  Step 4: Intent Detection (Async) 🔄                                  │  │
│  │    ├─ LLM: Google Gemini 2.0 Flash                                   │  │
│  │    ├─ Latency: ~1-2 seconds                                           │  │
│  │    ├─ Store in: intents table                                         │  │
│  │    └─ Broadcast: "intent_update" event                                │  │
│  │                                                                        │  │
│  │  Step 5: KB Article Surfacing (Async) 🔄                             │  │
│  │    ├─ Search: kb_articles table                                       │  │
│  │    ├─ Latency: ~50-500ms                                              │  │
│  │    ├─ Top 5 articles                                                  │  │
│  │    └─ Included in: "intent_update" event                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │
                                │ SSE Events
                                │ GET /api/events/stream?callId=xxx
                                │
┌───────────────────────────────┴───────────────────────────────────────────────┐
│                          SUPABASE DATABASE                                    │
│                    (PostgreSQL - Single Source of Truth)                      │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  Table: ingest_events                                                         │
│  ─────────────────────────────────────────────────────────────────────       │
│  ┌──────────────┬────────────┬─────┬────────────┬──────────┬────────────┐   │
│  │ id (UUID)    │ call_id    │ seq │ text       │ speaker  │ ts         │   │
│  ├──────────────┼────────────┼─────┼────────────┼──────────┼────────────┤   │
│  │ a1b2c3...    │ c89034cc.. │ 1   │ "Hello"    │ customer │ 2024-11-28 │   │
│  │ d4e5f6...    │ c89034cc.. │ 2   │ "Hi"       │ agent    │ 2024-11-28 │   │
│  │ g7h8i9...    │ c89034cc.. │ 3   │ "I need.." │ customer │ 2024-11-28 │   │
│  └──────────────┴────────────┴─────┴────────────┴──────────┴────────────┘   │
│  Index: (call_id, seq) - UNIQUE                                               │
│  Index: (call_id) - for fast lookups                                          │
│                                                                                │
│  Table: intents                                                                │
│  ─────────────────────────────────────────────────────────────────────       │
│  ┌──────────────┬────────────┬─────┬──────────────────┬────────────┐        │
│  │ id (UUID)    │ call_id    │ seq │ intent           │ confidence │        │
│  ├──────────────┼────────────┼─────┼──────────────────┼────────────┤        │
│  │ j1k2l3...    │ c89034cc.. │ 5   │ account_inquiry  │ 0.8        │        │
│  └──────────────┴────────────┴─────┴──────────────────┴────────────┘        │
│                                                                                │
│  Table: kb_articles                                                            │
│  ─────────────────────────────────────────────────────────────────────       │
│  ┌──────┬─────────────────────────┬──────────────────┬────────────┐         │
│  │ id   │ title                   │ snippet          │ tags       │         │
│  ├──────┼─────────────────────────┼──────────────────┼────────────┤         │
│  │ kb-1 │ Account Balance Inquiry │ How to check...  │ [account]  │         │
│  │ kb-2 │ Billing Questions       │ Billing FAQ...   │ [billing]  │         │
│  └──────┴─────────────────────────┴──────────────────┴────────────┘         │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                │
                                │ Polling API
                                │ GET /api/transcripts/latest?callId=xxx
                                │ Every 5 seconds
                                │
┌───────────────────────────────┴───────────────────────────────────────────────┐
│                         FRONTEND UI (React/Next.js)                            │
│                    https://frontend-8jdd.onrender.com/live                     │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Component: AgentAssistPanelV2                                                 │
│  ─────────────────────────────────────────────────────────────────────────    │
│  File: components/AgentAssistPanelV2.tsx                                      │
│                                                                                 │
│  Hook: useRealtimeTranscript()                                                 │
│  ─────────────────────────────────────────────────────────────────────────    │
│  File: hooks/useRealtimeTranscript.ts                                         │
│                                                                                 │
│  Mode: POLLING (pollMode = true)                                               │
│                                                                                 │
│  Polling Loop (Every 5 seconds):                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │ 1. Fetch: GET /api/transcripts/latest?callId=xxx                     │     │
│  │                                                                       │     │
│  │ 2. Response:                                                          │     │
│  │    {                                                                  │     │
│  │      ok: true,                                                        │     │
│  │      callId: "c89034cc...",                                           │     │
│  │      transcripts: [                                                   │     │
│  │        { id, text: "Hello", speaker: "customer", seq: 1 },           │     │
│  │        { id, text: "Hi", speaker: "agent", seq: 2 },                 │     │
│  │        { id, text: "I need help", speaker: "customer", seq: 3 }      │     │
│  │      ],                                                               │     │
│  │      intent: "account_inquiry",                                       │     │
│  │      confidence: 0.8,                                                 │     │
│  │      articles: [                                                      │     │
│  │        { id: "kb-1", title: "Account Balance...", ... }              │     │
│  │      ]                                                                │     │
│  │    }                                                                  │     │
│  │                                                                       │     │
│  │ 3. Update UI State:                                                   │     │
│  │    - transcripts → Render in chat UI                                 │     │
│  │    - intent → Display badge                                           │     │
│  │    - articles → Show in KB panel                                      │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                                 │
│  Display:                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │ 💬 Transcript Panel                                                   │     │
│  │ ───────────────────────────────────────────────────────────────      │     │
│  │ Customer: Hello                                                       │     │
│  │ Agent: Hi                                                             │     │
│  │ Customer: I need help with billing                                    │     │
│  │                                                                       │     │
│  │ 🎯 Intent: account_inquiry (80% confidence)                          │     │
│  │                                                                       │     │
│  │ 📚 Knowledge Base Suggestions                                         │     │
│  │ ───────────────────────────────────────────────────────────────      │     │
│  │ 1. Account Balance Inquiry                                            │     │
│  │ 2. Billing Questions FAQ                                              │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Data Flow with Timing

```
TIME    COMPONENT                   ACTION                              DATA
═════════════════════════════════════════════════════════════════════════════════

T+0ms   External ASR                POST /api/transcripts/receive      callId: c89034cc...
        └─> Frontend API                                               text: "Hello"
                                                                        seq: (auto-gen)

T+50ms  API Route Handler           Validate request                   ✓ All fields present
        └─> route.ts                Auto-generate seq = 1              ✓ Seq cached
                                    Call ingestTranscriptCore()        ✓ Async
                                    Return 200 OK                      ✓ Client receives

T+100ms ingestTranscriptCore        Detect speaker                     speaker: "customer"
        └─> lib/ingest-              Store in Supabase                 ✓ Row inserted
            transcript-core.ts       Broadcast SSE event                ✓ Event sent
                                    Trigger intent detection           🔄 Async (bg)
                                    Trigger KB search                  🔄 Async (bg)

T+150ms Supabase Database           INSERT INTO ingest_events          ✓ Stored
        └─> ingest_events           (call_id, seq, text, speaker)      id: a1b2c3...
            table

T+200ms SSE Broadcaster             Emit "transcript_line"             ✓ Broadcast
        └─> lib/realtime.ts         Target: callId subscribers         (if any listening)

T+5000ms Frontend Polling           GET /api/transcripts/latest        ✓ Request sent
         └─> useRealtimeTranscript   callId=c89034cc...

T+5100ms API /transcripts/latest    SELECT * FROM ingest_events        ✓ Query Supabase
         └─> route.ts               WHERE call_id = 'c89034cc...'      ✓ Returns rows
                                    ORDER BY seq ASC

T+5200ms Frontend Receives          Response: { transcripts: [...] }   ✓ Data received
         └─> useRealtimeTranscript   Update state                       ✓ State updated

T+5250ms React Re-render            Display transcripts in UI          ✓ UI updated
         └─> AgentAssistPanelV2

T+2000ms LLM Intent Detection       Gemini API response                intent: "account_inquiry"
         (Background)               Store in intents table             ✓ Stored
         └─> lib/intent.ts          Broadcast "intent_update"          ✓ Event sent

T+10000ms Frontend Polling          GET /api/transcripts/latest        ✓ Now includes intent
          (Next cycle)              Response: { intent, articles }     ✓ UI shows KB
```

---

## 🚨 Debugging Checkpoints - Check These in Order

### ✅ Checkpoint 1: External ASR → API

**Test Command:**
```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "debug-test-001",
    "transcript": "Debug checkpoint 1",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "2024-11-28T12:00:00Z",
    "isFinal": true
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "callId": "debug-test-001",
  "seq": 1,
  "message": "Transcript received and processing"
}
```

**✅ SUCCESS**: API is reachable and accepting requests  
**❌ FAILURE**: Check network, URL, request format

---

### ✅ Checkpoint 2: API → Supabase Storage

**Check Render Logs:**
```
Search for: "[ReceiveTranscript] Received transcript"
Expected: Log showing callId and transcript text

Search for: "[ingest-transcript-core] Stored in Supabase"
Expected: Log showing inserted row with id, call_id, seq
```

**Check Supabase Database:**
```sql
-- Run this query in Supabase SQL Editor
SELECT * FROM ingest_events 
WHERE call_id = 'debug-test-001'
ORDER BY seq ASC;

-- Expected: At least 1 row with text "Debug checkpoint 1"
```

**✅ SUCCESS**: Row exists in database  
**❌ FAILURE**: Check Supabase connection, env vars (SUPABASE_SERVICE_ROLE_KEY)

---

### ✅ Checkpoint 3: TranscriptConsumer Status

**Check Render Logs on Startup:**
```
Search for: "[instrumentation]"

✅ GOOD LOG:
"[instrumentation] TranscriptConsumer disabled (using direct API integration)"

❌ BAD LOG:
"[instrumentation] ✅ Transcript consumer started"
"[TranscriptConsumer] Received transcript message"
```

**If BAD LOG appears:**
```bash
# Action Required: Set environment variable on Render
ENABLE_TRANSCRIPT_CONSUMER=false

# Then redeploy the service
```

**✅ SUCCESS**: TranscriptConsumer is disabled  
**❌ FAILURE**: Old architecture is interfering - set env var above

---

### ✅ Checkpoint 4: Supabase → API Response

**Test API Endpoint:**
```bash
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=debug-test-001"
```

**Expected Response:**
```json
{
  "ok": true,
  "callId": "debug-test-001",
  "transcripts": [
    {
      "id": "debug-test-001-1",
      "text": "Debug checkpoint 1",
      "speaker": "customer",
      "timestamp": "2024-11-28T12:00:00Z",
      "seq": 1
    }
  ],
  "count": 1,
  "intent": "unknown",
  "confidence": 0,
  "articles": []
}
```

**✅ SUCCESS**: API can read from Supabase  
**❌ FAILURE**: Check Supabase connection, query logic

---

### ✅ Checkpoint 5: Frontend Polling

**Check Browser Console (https://frontend-8jdd.onrender.com/live):**

**Open DevTools → Console, look for:**
```javascript
// ✅ GOOD LOGS:
"[useRealtimeTranscript] 📊 Polling for transcripts"
"[useRealtimeTranscript] 📥 Received transcripts: 1"

// ✅ GOOD NETWORK REQUEST:
// DevTools → Network → Look for:
// GET /api/transcripts/latest?callId=xxx
// Status: 200
// Response: { ok: true, transcripts: [...] }

// ❌ BAD LOGS:
"[useRealtimeTranscript] ⚠️ No transcripts received"
"[useRealtimeTranscript] ❌ Polling error: ..."
```

**Check Polling Interval:**
```javascript
// In hooks/useRealtimeTranscript.ts
// Should see requests every 5 seconds
setInterval(() => { /* fetch */ }, 5000);
```

**✅ SUCCESS**: Frontend is polling and receiving data  
**❌ FAILURE**: Check frontend logs, polling logic, callId matching

---

### ✅ Checkpoint 6: UI State Update

**Check React DevTools:**
```javascript
// Component: AgentAssistPanelV2
// State: transcripts
// Expected: Array with transcript objects

// Component: useRealtimeTranscript
// State: utterances
// Expected: Array with transcript objects
```

**Check Render:**
```javascript
// In browser, check if transcript panel exists:
document.querySelector('[data-testid="transcript-panel"]')

// Check if transcripts are rendered:
document.querySelectorAll('.transcript-message')
```

**✅ SUCCESS**: UI is updating  
**❌ FAILURE**: Check React state management, component rendering

---

## 🔧 Common Issues & Fixes

### Issue 1: "Transcripts in DB but not in UI"

**Root Cause**: callId mismatch

**Debug:**
```bash
# Check what callId UI is using
# Browser Console → Look for:
"[useRealtimeTranscript] Using callId: xxx"

# Check what callId is in database
SELECT DISTINCT call_id FROM ingest_events ORDER BY created_at DESC LIMIT 10;

# Compare the two - they MUST match exactly
```

**Fix:**
```javascript
// Ensure external ASR sends consistent callId
// Case-sensitive, exact match required
```

---

### Issue 2: "TranscriptConsumer Still Running"

**Root Cause**: Environment variable not set

**Debug:**
```bash
# Check Render logs for:
grep "TranscriptConsumer" logs

# If you see:
"[TranscriptConsumer] Received transcript message"
# Then the old consumer is still active
```

**Fix:**
```bash
# Render Dashboard → Environment → Add:
ENABLE_TRANSCRIPT_CONSUMER=false

# Then redeploy
```

---

### Issue 3: "Polling Not Happening"

**Root Cause**: pollMode not set or callId missing

**Debug:**
```javascript
// Browser Console → Check:
// 1. Is pollMode true?
// hooks/useRealtimeTranscript.ts: const pollMode = true;

// 2. Is callId set?
console.log('Current callId:', callId);

// 3. Is polling interval running?
// Should see logs every 5 seconds
```

**Fix:**
```typescript
// In hooks/useRealtimeTranscript.ts
const pollMode = true; // Ensure this is true

// In app/live/page.tsx
// Ensure callId is set from active call discovery
```

---

### Issue 4: "Empty Transcripts Response"

**Root Cause**: Supabase query filtering by wrong callId

**Debug:**
```sql
-- Check all recent transcripts:
SELECT call_id, seq, text, created_at 
FROM ingest_events 
ORDER BY created_at DESC 
LIMIT 20;

-- Check specific callId:
SELECT * FROM ingest_events 
WHERE call_id = 'your-call-id-here'
ORDER BY seq ASC;
```

**Fix:**
```bash
# Ensure external ASR is sending correct callId
# Ensure UI is requesting correct callId
# Both must match exactly (case-sensitive)
```

---

## 📊 Performance Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| API Response Time | < 100ms | ? | ❓ |
| Supabase Write | < 200ms | ? | ❓ |
| UI Polling Interval | 5s | 5s | ✅ |
| Intent Detection | 1-2s | 1-2s | ✅ |
| KB Search | 50-500ms | 50-500ms | ✅ |
| End-to-End Latency | < 6s | ? | ❓ |

---

## 🎯 Quick Diagnostic Script

Run this to check all components:

```bash
#!/bin/bash

echo "=== RTAA System Diagnostic ==="
echo ""

# 1. Test API Endpoint
echo "1. Testing API endpoint..."
RESPONSE=$(curl -s -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "diagnostic-'$(date +%s)'",
    "transcript": "System diagnostic test",
    "session_id": null,
    "asr_service": "Diagnostic",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }')

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ API endpoint is working"
  CALL_ID=$(echo "$RESPONSE" | grep -o '"callId":"[^"]*"' | cut -d'"' -f4)
  echo "   Generated callId: $CALL_ID"
else
  echo "❌ API endpoint failed"
  echo "   Response: $RESPONSE"
  exit 1
fi

# 2. Wait for processing
echo ""
echo "2. Waiting 3 seconds for processing..."
sleep 3

# 3. Test retrieval
echo ""
echo "3. Testing transcript retrieval..."
RETRIEVE_RESPONSE=$(curl -s "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=$CALL_ID")

if echo "$RETRIEVE_RESPONSE" | grep -q '"ok":true'; then
  echo "✅ Retrieval API is working"
  COUNT=$(echo "$RETRIEVE_RESPONSE" | grep -o '"count":[0-9]*' | cut -d':' -f2)
  echo "   Transcripts found: $COUNT"
  
  if [ "$COUNT" -gt 0 ]; then
    echo "✅ DIAGNOSTIC PASSED: Transcripts are being stored and retrieved"
  else
    echo "❌ DIAGNOSTIC FAILED: No transcripts found in database"
  fi
else
  echo "❌ Retrieval API failed"
  echo "   Response: $RETRIEVE_RESPONSE"
fi

echo ""
echo "=== Diagnostic Complete ==="
echo "Share this output with your development team."
```

---

## 📞 What to Share with CTO

1. **This architecture diagram** (this file)
2. **Render logs** from the last 30 minutes showing:
   - `[ReceiveTranscript]` entries
   - `[ingest-transcript-core]` entries
   - `[TranscriptConsumer]` entries (should be none)
3. **Supabase query results**:
   ```sql
   SELECT call_id, seq, text, speaker, created_at 
   FROM ingest_events 
   ORDER BY created_at DESC 
   LIMIT 20;
   ```
4. **Browser console logs** from https://frontend-8jdd.onrender.com/live
5. **Network tab** showing `/api/transcripts/latest` requests and responses

---

## 🚀 Expected Behavior Summary

1. ✅ External ASR POSTs transcript → API returns 200 OK in < 100ms
2. ✅ API stores in Supabase → Row appears in `ingest_events` table
3. ✅ Frontend polls every 5s → GET `/api/transcripts/latest`
4. ✅ API returns transcripts → Frontend receives array
5. ✅ React updates state → UI renders transcripts
6. ✅ LLM detects intent (bg) → Intent badge appears in UI
7. ✅ KB search completes (bg) → Articles appear in sidebar

**Total time from POST to UI**: ~5-10 seconds (limited by polling interval)

---

**Document Version**: 1.0  
**Last Updated**: November 28, 2024  
**Status**: 🔍 Awaiting Diagnostic Results


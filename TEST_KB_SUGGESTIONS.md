# KB Suggestions Flow - Test Guide

## Test 1: KB Suggestions Flow End-to-End

### Prerequisites
- Server running (`npm run dev`)
- Supabase configured with KB articles
- Test callId available

### Test Steps

#### Step 1: Send Initial Transcript
```bash
curl -X POST http://localhost:3000/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-kb-flow-001",
    "seq": 1,
    "text": "I need to block my credit card immediately, there has been fraudulent activity",
    "ts": "2025-11-28T10:00:00Z",
    "speaker": "customer"
  }'
```

**Expected Result:**
- Transcript is ingested
- Intent is detected (e.g., "credit_card_block" or "fraud")
- KB articles are surfaced via SSE broadcast
- Articles appear in UI

#### Step 2: Check Transcripts Endpoint
```bash
curl "http://localhost:3000/api/transcripts/latest?callId=test-kb-flow-001"
```

**Expected Result:**
- Returns transcripts with `seq: 1`
- Returns intent (if detected)
- Returns KB articles array

#### Step 3: Send Second Transcript (Different Intent)
```bash
curl -X POST http://localhost:3000/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-kb-flow-001",
    "seq": 2,
    "text": "I want to check my account balance and recent transactions",
    "ts": "2025-11-28T10:01:00Z",
    "speaker": "customer"
  }'
```

**Expected Result:**
- New transcript ingested
- New intent detected (e.g., "account_balance" or "transaction_inquiry")
- New KB articles surfaced
- **NEW articles should appear at TOP of list**

#### Step 4: Verify KB Articles Order
Check the UI or API response:
```bash
curl "http://localhost:3000/api/transcripts/latest?callId=test-kb-flow-001"
```

**Expected Result:**
- Articles from transcript 2 (newer) appear first
- Articles from transcript 1 (older) appear below

---

## Test 2: New Suggestions on Top, Old Ones Go Down

### Test Scenario: Sequential Transcripts with Different Intents

#### Step 1: Send Transcript 1 (Fraud Intent)
```bash
curl -X POST http://localhost:3000/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-sorting-001",
    "seq": 1,
    "text": "My card was stolen, I need to report fraud",
    "ts": "2025-11-28T10:00:00Z",
    "speaker": "customer"
  }'
```

**Wait 2 seconds for processing**

#### Step 2: Send Transcript 2 (Balance Intent)
```bash
curl -X POST http://localhost:3000/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-sorting-001",
    "seq": 2,
    "text": "What is my current account balance?",
    "ts": "2025-11-28T10:01:00Z",
    "speaker": "customer"
  }'
```

**Wait 2 seconds for processing**

#### Step 3: Send Transcript 3 (PIN Reset Intent)
```bash
curl -X POST http://localhost:3000/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-sorting-001",
    "seq": 3,
    "text": "How do I reset my PIN for my debit card?",
    "ts": "2025-11-28T10:02:00Z",
    "speaker": "customer"
  }'
```

**Wait 2 seconds for processing**

#### Step 4: Verify Order in UI
1. Open `/live?callId=test-sorting-001` in browser
2. Check Agent Copilot panel
3. Verify KB suggestions order:

**Expected Order (Newest First):**
1. **PIN Reset articles** (from transcript 3 - newest)
2. **Balance articles** (from transcript 2 - middle)
3. **Fraud articles** (from transcript 1 - oldest)

---

## Test 3: Manual KB Search (Should Also Sort Newest First)

### Step 1: Open Live UI
Navigate to: `http://localhost:3000/live?callId=test-sorting-001`

### Step 2: Perform Manual Search
1. In Agent Copilot panel, use the KB search box
2. Search for: "account balance"
3. Wait for results

### Step 3: Perform Another Search
1. Search for: "fraud dispute"
2. Wait for results

### Expected Result:
- New search results appear at TOP
- Previous search results move DOWN
- All articles sorted by timestamp (newest first)

---

## Automated Test Script

Run the automated test:

```bash
npm run test:kb-suggestions
```

This script will:
1. Send 3 sequential transcripts with different intents
2. Verify transcripts are cached
3. Simulate UI state updates
4. Verify sorting (newest first)
5. Print detailed test results

---

## Verification Checklist

- [ ] Transcripts are ingested successfully
- [ ] Intent is detected for each transcript
- [ ] KB articles are surfaced for each intent
- [ ] New articles appear at TOP of list
- [ ] Old articles move DOWN in list
- [ ] Sorting is maintained across multiple updates
- [ ] Manual search results also sort newest first
- [ ] No duplicate articles (deduplication works)
- [ ] Articles have timestamps for sorting
- [ ] UI updates in real-time via SSE

---

## Troubleshooting

### Issue: Articles not appearing
- Check Supabase KB articles table has data
- Verify intent detection is working
- Check browser console for SSE events
- Verify `/api/transcripts/latest` returns articles

### Issue: Articles not sorting correctly
- Check browser console for sorting logs
- Verify articles have `timestamp` property
- Check `AgentAssistPanelV2.tsx` sorting logic
- Verify `handleKbArticlesUpdate` in `app/live/page.tsx`

### Issue: Old articles not moving down
- Verify new articles have newer timestamps
- Check sorting function: `bTime - aTime` (newest first)
- Verify articles are being prepended, not appended

---

## Expected Console Logs

When testing, you should see logs like:

```
[ingest-transcript-core] ✅ Transcript cached in-memory
[ingest-transcript-core] Intent detected: credit_card_block
[ingest-transcript-core] Found KB articles: { count: 3 }
[AgentAssistPanel] 📥 Received intent_update event
[PERF-UI] 🔀 KB articles sort (newest first)
[Live] ✅ KB articles sorted (newest first)
```


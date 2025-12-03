# Manual KB Suggestions Test Guide

## Quick Test Commands

### Test 1: KB Flow End-to-End

#### Step 1: Send First Transcript (Fraud Intent)
```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-kb-manual-001",
    "seq": 1,
    "text": "I need to block my credit card immediately, there has been fraudulent activity on my account",
    "ts": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "speaker": "customer"
  }'
```

**Wait 3 seconds**, then check results:
```bash
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=test-kb-manual-001"
```

**Expected:**
- `transcripts` array with 1 item
- `intent` field (e.g., "credit_card_block" or "fraud")
- `articles` array with KB suggestions

#### Step 2: Send Second Transcript (Balance Intent)
```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-kb-manual-001",
    "seq": 2,
    "text": "What is my current account balance? I need to check my recent transactions",
    "ts": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "speaker": "customer"
  }'
```

**Wait 3 seconds**, then check results:
```bash
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=test-kb-manual-001"
```

**Expected:**
- `transcripts` array with 2 items
- New `intent` detected
- `articles` array with **NEW articles at the beginning** (if you check UI)

#### Step 3: Send Third Transcript (PIN Reset Intent)
```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-kb-manual-001",
    "seq": 3,
    "text": "How do I reset my PIN for my debit card? I forgot my current PIN",
    "ts": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "speaker": "customer"
  }'
```

**Wait 3 seconds**, then check results:
```bash
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=test-kb-manual-001"
```

---

### Test 2: Verify Sorting in UI

1. **Open Live UI:**
   ```
   https://frontend-8jdd.onrender.com/live?callId=test-kb-manual-001
   ```

2. **Check Agent Copilot Panel:**
   - Look at "Knowledge Base Suggestions" section
   - Verify articles are displayed
   - **Newest articles should be at TOP**
   - **Older articles should be BELOW**

3. **Expected Order (Newest First):**
   - PIN Reset articles (from transcript 3)
   - Balance articles (from transcript 2)
   - Fraud articles (from transcript 1)

---

### Test 3: Manual Search Sorting

1. **In the UI**, use the KB search box
2. **Search for:** "account balance"
3. **Wait for results** to appear
4. **Search again for:** "fraud dispute"
5. **Verify:** New search results appear at TOP, old ones move down

---

## Verification Checklist

### KB Flow End-to-End ✅
- [ ] Transcripts are received and cached
- [ ] Intent is detected for each transcript
- [ ] KB articles are surfaced via intent detection
- [ ] Articles appear in `/api/transcripts/latest` response
- [ ] Articles appear in UI via SSE

### Sorting (Newest First) ✅
- [ ] New articles from latest transcript appear at TOP
- [ ] Old articles from previous transcripts move DOWN
- [ ] Manual search results also sort newest first
- [ ] Sorting is maintained when new articles arrive
- [ ] No duplicate articles (deduplication works)

---

## Expected API Response Format

```json
{
  "ok": true,
  "callId": "test-kb-manual-001",
  "transcripts": [
    {
      "id": "test-kb-manual-001-1-...",
      "text": "I need to block my credit card...",
      "speaker": "customer",
      "timestamp": "2025-12-01T12:00:00Z",
      "seq": 1
    }
  ],
  "intent": "credit_card_block",
  "confidence": 0.85,
  "articles": [
    {
      "id": "article-1",
      "title": "How to Block a Credit Card",
      "snippet": "...",
      "url": "...",
      "confidence": 0.9
    }
  ]
}
```

---

## Troubleshooting

### No articles appearing?
- Check Supabase has KB articles in `kb_articles` table
- Verify intent detection is working (check `intent` field in response)
- Check browser console for SSE events

### Articles not sorting?
- Open browser DevTools → Console
- Look for logs: `[PERF-UI] 🔀 KB articles sort (newest first)`
- Verify articles have `timestamp` property
- Check that new articles are prepended, not appended

### Old articles not moving down?
- Verify new articles have newer timestamps
- Check sorting logic: `bTime - aTime` (newest first)
- Ensure `setKbArticles` is using merge + sort pattern

---

## Console Logs to Watch

When testing, you should see in browser console:

```
[AgentAssistPanel] 📥 Received intent_update event
[PERF-UI] 🔀 KB articles sort (newest first) { newArticlesCount: 2, items_sorted: 5 }
[Live] ✅ KB articles sorted (newest first) { newCount: 2, totalCount: 5 }
```


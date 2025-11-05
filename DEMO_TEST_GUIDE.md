# Full Demo Test Guide: Start Call → Disposition

## Overview
This guide walks you through testing the complete Agent Assist flow from starting a call to disposition.

## Prerequisites

1. **Server Running**:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 20 && npm run dev
   ```
   Server should be on: http://localhost:3000

2. **Intent Detection Fixed**:
   - ✅ Model: `gemini-2.0-flash` (no thinking tokens)
   - ✅ Token limit: 200 tokens
   - ✅ Truncation handling implemented

## Test Flow

### Step 1: Open Demo Page
```
http://localhost:3000/demo
```

### Step 2: Initial State (Before Call)
**What to Verify:**
- ✅ Left panel: Empty transcript area
- ✅ Right panel (Agent Assist): Shows "Looking for suggestions" (empty)
- ✅ Bottom left: Green "▶ Start Call" button visible

**Expected Behavior:**
- **KB Articles should NOT be visible** - Panel should be empty
- This is correct! Articles only appear after intent detection

### Step 3: Start Call
**Action:** Click the green "▶ Start Call" button

**What Happens:**
1. Transcript lines start appearing in the left panel
2. Lines are sent to `/api/calls/ingest-transcript`
3. Each line triggers intent detection
4. Intent detection uses Gemini API (gemini-2.0-flash)

**Timeline:**
- **Line 1** (Agent greeting): Intent may be "unknown" or "general_inquiry"
- **Line 2** (Customer: "fraudulent transaction"): Intent should be detected!
  - Expected: `credit_card_fraud`, `fraudulent_transaction`, or similar
  - Confidence: Should be > 0.7

### Step 4: Intent Detection & KB Articles
**What to Verify:**
- ✅ After 2-3 transcript lines, intent should be detected
- ✅ KB articles should **automatically appear** in the right panel
- ✅ Articles appear via SSE `intent_update` events (no page refresh needed)
- ✅ Articles show relevance scores (e.g., "85% Relevant")

**Expected Articles for Fraud Scenario:**
- "Fraud Dispute Process"
- "Card Blocking Procedures"
- "Reset Debit Card PIN"
- Other fraud/security related articles

**Timeline:**
- **~2-3 seconds** after Line 2: Intent detected
- **Immediately after**: KB articles appear in right panel
- Articles continue to accumulate as more intents are detected

### Step 5: During Call
**What to Verify:**
- ✅ Transcript continues streaming
- ✅ KB articles remain visible
- ✅ You can:
  - Search KB articles (search box)
  - Like/dislike articles (thumbs up/down)
  - Copy article URLs
  - Open articles in new tab

**Expected Behavior:**
- Articles update in real-time as new intents are detected
- Search filters articles instantly
- Feedback actions work (check console for logs)

### Step 6: End Call & Disposition
**Action:** Click the red hang up button (phone icon) in the call controls

**What Happens:**
1. Call ends (if still active)
2. `/api/calls/end` is called
3. `/api/calls/summary` is triggered
4. Summary generation uses Gemini API
5. Disposition modal opens automatically

**What to Verify:**
- ✅ Disposition modal appears (centered on screen)
- ✅ Modal shows:
  - **Disposition dropdown**: With detected intents (e.g., "Credit Card", "Fraud")
  - **Sub-disposition dropdown**: (placeholder for now)
  - **Notes textarea**: Auto-generated summary with LLM indicator badge
  - **Buttons**: "Retry" and "Save & Sync"

**Expected Summary Content:**
- Issue: Description of the customer's problem
- Resolution: What was done/suggested
- Next Steps: Follow-up actions
- Dispositions: List of detected intents with scores

### Step 7: Disposition Actions

#### Test "Retry" Button
**Action:** Click "Retry" button

**What Happens:**
- Re-runs `/api/calls/summary`
- Updates disposition suggestions and notes
- Shows loading spinner during retry

**Expected:**
- New summary generated (may vary slightly)
- Disposition dropdown updates
- Notes textarea updates

#### Test "Save & Sync" Button
**Action:** 
1. Select a disposition from dropdown
2. Optionally edit notes
3. Click "Save & Sync"

**What Happens:**
- Calls `/api/calls/auto_notes`
- Saves disposition and notes to database
- Shows success toast
- Modal closes after 500ms

**Expected:**
- ✅ Toast notification: "Saved and synced"
- ✅ Modal closes
- ✅ Data persisted to database

## Troubleshooting

### Issue: KB Articles Not Appearing

**Check:**
1. **Server terminal logs** - Look for:
   ```
   [intent] Starting detection
   [intent] Calling Google Gemini API
   [intent] Detected intent: ...
   [ingest-transcript] Found KB articles: ...
   ```

2. **Browser console** - Look for:
   ```
   [AgentAssistPanel] Received intent_update
   ```

3. **Intent detection working?**
   - Test: `curl http://localhost:3000/api/debug/intent`
   - Should return intent (not "unknown")

**Fix:**
- Restart server if intent detection is failing
- Check `.env.local` has `LLM_API_KEY` set
- Verify `LLM_PROVIDER=gemini`

### Issue: Disposition Modal Not Opening

**Check:**
1. Is call ended? (check `callEnded` state)
2. Server terminal logs for `/api/calls/summary` errors
3. Browser console for errors

**Fix:**
- Ensure call is stopped/ended before clicking hang up
- Check server logs for summary generation errors

### Issue: Transcript Not Streaming

**Check:**
1. SSE connection in browser console
2. Server logs for `/api/calls/ingest-transcript` calls
3. Network tab for SSE events

**Fix:**
- Check server is running
- Verify callId is consistent
- Check SSE endpoint: `/api/events/stream?callId=...`

## Expected Console Logs

### Server Terminal:
```
[ingest-transcript] Received chunk
[intent] Starting detection
[intent] Calling Google Gemini API
[intent] Detected intent: credit_card_fraud
[ingest-transcript] Found KB articles: 3
[realtime] Broadcast intent_update
```

### Browser Console:
```
[Demo] Sent transcript line
[TranscriptPanel] Received transcript_line event
[AgentAssistPanel] Received intent_update
[Demo] Article feedback: { articleId: '...', liked: true }
```

## Success Criteria

✅ **Full Flow Working:**
1. ✅ Call starts → Transcript appears
2. ✅ Intent detected → KB articles appear automatically
3. ✅ Call ends → Disposition modal opens
4. ✅ Summary generated → Shows dispositions and notes
5. ✅ Save works → Data persisted, toast shown

✅ **KB Articles Behavior:**
- ✅ Start empty (before call)
- ✅ Appear only after intent detection
- ✅ Update in real-time via SSE
- ✅ Search works
- ✅ Feedback actions work

## Test Data

**Call ID:** `demo-call-{timestamp}` (auto-generated)

**Test Transcript:**
- Credit card fraud scenario
- 16 lines total
- Customer mentions "fraudulent transaction"
- Should trigger fraud-related intents

## Next Steps

After successful test:
1. ✅ Intent detection working
2. ✅ KB articles surfacing correctly
3. ✅ Disposition flow complete
4. ✅ Full pipeline operational

If issues persist, check:
- Server logs for detailed errors
- Browser console for client-side errors
- Network tab for API call failures

---

**Happy Testing! 🎉**


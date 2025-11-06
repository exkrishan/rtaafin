# Local Demo Guide - Complete RTAA Flow Testing

## 🚀 Quick Start

### 1. Ensure Server is Running
```bash
# Check if server is running
curl http://localhost:3000 | head -5

# If not running, start it:
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
source ~/.nvm/nvm.sh && nvm use 20
npm run dev
```

### 2. Open Demo Pages

**Main Demo Page**: http://localhost:3000
- Preview components
- Test transcript panel
- Test KB suggestions

**Live Demo (Full Flow)**: http://localhost:3000/demo
- Complete call simulation
- Real-time transcript ingestion
- Intent detection
- KB article surfacing
- Auto-disposition modal

**Agent Assist UI**: http://localhost:3000/test-agent-assist
- Full agent assist interface
- Disposition taxonomy testing

---

## 📋 Complete Demo Flow

### Step 1: Start Live Demo
1. Open http://localhost:3000/demo in your browser
2. Click "Start Call" button
3. You'll see:
   - Call ID generated
   - Transcript panel (left side)
   - Agent Assist panel (right side)
   - Control buttons

### Step 2: Simulate Transcript Ingestion
1. Click "Send Transcript Chunk" button
2. Watch for:
   - ✅ Transcript appears in real-time (auto-scrolls to bottom)
   - ✅ Intent detection happens automatically
   - ✅ KB articles appear in Agent Assist panel (new ones at top)
   - ✅ Confidence scores shown for each article

### Step 3: Test Intent Detection
The demo includes sample conversations about:
- Credit card issues
- Debit card problems
- Account inquiries
- Payment issues

**Expected Behavior:**
- Correct intent detected (e.g., "credit_card_block" for credit card conversations)
- Relevant KB articles surfaced (not salary account articles for credit card issues)
- Confidence scores displayed (0-100%)

### Step 4: Test KB Article Surfacing
1. Articles should appear automatically after intent detection
2. New articles appear at the **top** of the list
3. Each article shows:
   - Title
   - Confidence score (e.g., "Confidence: 85%")
   - Thumbs up/down buttons (dislike icon is upside down)
   - Snippet preview

### Step 5: End Call & Test Disposition
1. Click "End Call" button
2. Auto-disposition modal should appear with:
   - ✅ Auto-selected disposition (best match)
   - ✅ Sub-disposition dropdown (behaves like main disposition)
   - ✅ Auto-generated notes
   - ✅ Confidence score
3. Verify:
   - Disposition and sub-disposition are pre-selected
   - You can change them from dropdowns
   - Notes are editable
   - "Save" button works

---

## 🧪 Testing Checklist

### ✅ Transcript Ingestion
- [ ] Transcript appears in real-time
- [ ] Auto-scrolls to latest utterance
- [ ] Multiple speakers shown correctly
- [ ] Timestamps displayed

### ✅ Intent Detection
- [ ] Intent detected correctly (not generic "unknown")
- [ ] Specific intents (credit_card_block, debit_card_fraud, etc.)
- [ ] No mismatches (e.g., salary account for credit card issues)

### ✅ KB Article Surfacing
- [ ] Articles appear after intent detection
- [ ] New articles appear at **top** (not bottom)
- [ ] Confidence scores displayed
- [ ] Relevant articles only (no SIM replacement for credit card issues)
- [ ] Thumbs up/down icons work (dislike is upside down)

### ✅ Disposition Modal
- [ ] Opens automatically on "End Call"
- [ ] Disposition auto-selected (best match)
- [ ] Sub-disposition dropdown works (same behavior as main)
- [ ] Notes auto-generated
- [ ] Can edit and save
- [ ] Transcript shows in modal

---

## 🔍 Debugging Tips

### Check API Endpoints
```bash
# Test dispositions API
curl http://localhost:3000/api/dispositions | jq '.ok'

# Test intent detection
curl -X POST http://localhost:3000/api/calls/ingest-transcript \
  -H "Content-Type: application/json" \
  -d '{"callId":"test-123","text":"I need help with my credit card","tenantId":"default"}' | jq

# Test KB search
curl "http://localhost:3000/api/kb/search?q=credit%20card" | jq
```

### Check Server Logs
```bash
# View Next.js dev server logs
tail -f /tmp/next-dev.log

# Look for:
# - "[supabase] TLS Configuration" (should show ALLOW_INSECURE_TLS: true)
# - Intent detection logs
# - KB search logs
# - Any errors
```

### Check Browser Console
1. Open browser DevTools (F12)
2. Check Console tab for:
   - SSE connection messages
   - API errors
   - Intent update events

---

## 🎯 Expected Results

### Credit Card Issue Conversation
**Input**: "I need to block my credit card, someone stole it"
**Expected**:
- Intent: `credit_card_block` or `credit_card_fraud`
- KB Articles: Credit card related (NOT salary account or SIM replacement)
- Confidence: > 70%
- Disposition: Fraud-related or Card Security

### Debit Card Issue Conversation
**Input**: "My debit card is not working at the ATM"
**Expected**:
- Intent: `debit_card_issue` or `debit_card_block`
- KB Articles: Debit card related
- Confidence: > 70%

### Account Inquiry
**Input**: "What's my account balance?"
**Expected**:
- Intent: `account_balance` or `account_inquiry`
- KB Articles: Account-related
- Confidence: > 70%

---

## 🐛 Common Issues

### Issue: "Internal Server Error" on /api/dispositions
**Fix**: Ensure `ALLOW_INSECURE_TLS=true` in `.env.local` and restart server

### Issue: No KB articles appearing
**Check**:
1. Intent detection working? (check logs)
2. KB search API working? (test endpoint)
3. SSE connection established? (check browser console)

### Issue: Wrong articles appearing
**Check**:
1. Intent detection accuracy (should be specific, not generic)
2. KB search terms (should prioritize specific card/account terms)

### Issue: Disposition modal not opening
**Check**:
1. "End Call" button clicked?
2. Summary API working? (check logs)
3. Modal component mounted?

---

## 📊 Performance Expectations

- Intent detection: < 2 seconds
- KB article surfacing: < 1 second after intent
- Disposition generation: < 3 seconds
- Transcript real-time updates: < 500ms

---

## 🎬 Demo Script

1. **Start**: Open http://localhost:3000/demo
2. **Begin Call**: Click "Start Call"
3. **Send Transcript**: Click "Send Transcript Chunk" multiple times
4. **Observe**: Watch intent detection and KB articles appear
5. **End Call**: Click "End Call"
6. **Review**: Check auto-disposition and notes
7. **Save**: Click "Save" to complete

---

## ✅ Success Criteria

The demo is successful if:
- ✅ All transcript chunks appear in real-time
- ✅ Intent is detected correctly (not "unknown")
- ✅ Relevant KB articles appear (not wrong category)
- ✅ Confidence scores are displayed
- ✅ Disposition modal opens with auto-selected values
- ✅ Sub-disposition dropdown works
- ✅ Notes are auto-generated
- ✅ Everything saves successfully

---

## 📞 Next Steps After Testing

1. **Verify all features work** as described above
2. **Test edge cases** (empty transcript, no intent detected, etc.)
3. **Check error handling** (network errors, API failures)
4. **Review performance** (response times, UI responsiveness)
5. **Document any issues** found during testing

Happy testing! 🚀


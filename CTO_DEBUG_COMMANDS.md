# CTO Debug Commands - Run These to Identify the Issue

## 🎯 Objective

Identify why transcripts are being stored in the database but not appearing in the UI.

---

## ✅ Step 1: Verify API is Working

```bash
# Send a test transcript
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "cto-debug-'$(date +%s)'",
    "transcript": "CTO debugging - this is a test transcript",
    "session_id": null,
    "asr_service": "Manual-Test",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }' && echo ""
```

**Expected Output:**
```json
{
  "ok": true,
  "callId": "cto-debug-1701177600",
  "seq": 1,
  "message": "Transcript received and processing"
}
```

**If you get this ✅**: API is working, proceed to Step 2  
**If you get an error ❌**: API endpoint is broken, check Render deployment logs

---

## ✅ Step 2: Verify Database Storage

**Note the callId from Step 1** (e.g., `cto-debug-1701177600`)

```bash
# Wait 2 seconds for processing
sleep 2

# Fetch from API (this queries Supabase)
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=YOUR_CALL_ID_HERE" | python3 -m json.tool
```

**Replace `YOUR_CALL_ID_HERE` with actual callId from Step 1**

**Expected Output:**
```json
{
  "ok": true,
  "callId": "cto-debug-1701177600",
  "transcripts": [
    {
      "id": "cto-debug-1701177600-1",
      "text": "CTO debugging - this is a test transcript",
      "speaker": "customer",
      "timestamp": "2024-11-28T12:00:00Z",
      "seq": 1
    }
  ],
  "count": 1,
  "intent": "unknown",
  "articles": []
}
```

**If you get transcripts ✅**: Database storage is working, proceed to Step 3  
**If transcripts array is empty ❌**: Database write is failing, check Supabase logs

---

## ✅ Step 3: Check Render Environment Variables

**Go to**: Render Dashboard → Your Frontend Service → **Environment** tab

**Verify these are set:**

| Variable | Value | Status |
|----------|-------|--------|
| `ENABLE_TRANSCRIPT_CONSUMER` | `false` | ⚠️ **CRITICAL** |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://...supabase.co` | ✅ Required |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | ✅ Required |
| `LLM_PROVIDER` | `gemini` | ✅ Required |
| `GEMINI_API_KEY` | `AIza...` | ✅ Required |
| `NODE_ENV` | `production` | ✅ Required |

**If `ENABLE_TRANSCRIPT_CONSUMER` is NOT set to `false`:**

1. Click **Add Environment Variable**
2. Key: `ENABLE_TRANSCRIPT_CONSUMER`
3. Value: `false`
4. Click **Save Changes**
5. Service will auto-redeploy (wait 2-3 minutes)

---

## ✅ Step 4: Check Render Logs After Redeploy

**Go to**: Render Dashboard → Your Frontend Service → **Logs** tab

**Search for** (Ctrl+F): `instrumentation`

**✅ GOOD LOG (TranscriptConsumer disabled):**
```
[instrumentation] TranscriptConsumer disabled (using direct API integration)
```

**❌ BAD LOG (TranscriptConsumer still active):**
```
[instrumentation] ✅ Transcript consumer started
[TranscriptConsumer] Received transcript message
[RedisStreamsAdapter] Starting consumer loop
```

**If you see BAD LOGS ❌**: The environment variable didn't take effect. Contact me to hard-code the disable.

---

## ✅ Step 5: Check Frontend UI Behavior

### 5a. Open the UI

```
https://frontend-8jdd.onrender.com/live
```

### 5b. Open Browser DevTools

**Press F12** or **Right-click → Inspect**

### 5c. Go to Console Tab

**Look for these logs** (they appear every 5 seconds):

**✅ GOOD LOGS:**
```javascript
[useRealtimeTranscript] 📊 Polling for transcripts { callId: "xxx" }
[useRealtimeTranscript] 📥 Received X transcripts
[useRealtimeTranscript] 💾 Stored in memory: X items
```

**❌ BAD LOGS:**
```javascript
[useRealtimeTranscript] ⚠️ No callId set, skipping poll
[useRealtimeTranscript] ❌ Polling error: ...
```

### 5d. Go to Network Tab

**Filter by**: `latest`

**Look for requests**:
```
GET /api/transcripts/latest?callId=xxx
```

**Click on a request → Preview/Response:**
```json
{
  "ok": true,
  "callId": "...",
  "transcripts": [ ... ],  // ← Should have data
  "count": 5  // ← Should be > 0
}
```

**If count is 0 ❌**: callId mismatch between UI and database

---

## ✅ Step 6: Verify callId Matching

### 6a. Get callId from UI

**Browser Console → Type:**
```javascript
// This will show the current callId
window.location.search
```

**Or look for log:**
```javascript
"[Live] ✅ CallId updated" // Shows the callId UI is using
```

### 6b. Get callId from Database

```bash
# See recent callIds in database
curl "https://frontend-8jdd.onrender.com/api/calls/active?limit=10"
```

### 6c. Compare

**They MUST match exactly** (case-sensitive, character-for-character)

**Example:**
```
UI callId:       c89034cc555419c3c65441d313bc19bs
Database callId: c89034cc555419c3c65441d313bc19bs
Match: ✅ YES
```

**If they don't match ❌**: Your external ASR is using different callId than UI expects

---

## ✅ Step 7: End-to-End Test with Known callId

```bash
# Use a callId you know is in the UI
KNOWN_CALL_ID="c89034cc555419c3c65441d313bc19bs"  # From your logs

# Send a test transcript to that callId
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "'$KNOWN_CALL_ID'",
    "transcript": "This is a manual test from CTO debugging session",
    "session_id": null,
    "asr_service": "Manual-CTO-Test",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'

# Wait 10 seconds (2 polling cycles)
sleep 10

# Check if it appears in API
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=$KNOWN_CALL_ID" | python3 -m json.tool
```

**Look for**: Your test transcript "This is a manual test from CTO debugging session"

**If it appears in API but NOT in UI ❌**: Frontend polling logic is broken  
**If it appears in BOTH API and UI ✅**: System is working!

---

## 📊 Diagnostic Checklist for CTO

| # | Check | Command | Expected Result | Actual Result |
|---|-------|---------|-----------------|---------------|
| 1 | API Reachable | `curl POST /api/transcripts/receive` | 200 OK | ? |
| 2 | Database Write | `curl GET /api/transcripts/latest` | count > 0 | ? |
| 3 | Env Var Set | Check Render Dashboard | `ENABLE_TRANSCRIPT_CONSUMER=false` | ? |
| 4 | Logs Show Disabled | Check Render Logs | "TranscriptConsumer disabled" | ? |
| 5 | UI Polling Active | Browser Console | "Polling for transcripts" every 5s | ? |
| 6 | Network Requests | Browser Network Tab | GET requests to `/latest` | ? |
| 7 | callId Match | Compare UI vs DB | Exact match | ? |

---

## 🚨 Most Likely Issues (Ranked by Probability)

### 1️⃣ **TranscriptConsumer Still Running (90% likely)**

**Symptom**: Render logs show `[TranscriptConsumer]` messages

**Cause**: `ENABLE_TRANSCRIPT_CONSUMER` not set to `false` on Render

**Fix**: Set environment variable and redeploy

**Verification**: Logs should show `TranscriptConsumer disabled`

---

### 2️⃣ **callId Mismatch (5% likely)**

**Symptom**: API has data but UI shows empty

**Cause**: UI is using different callId than what's in database

**Fix**: Ensure external ASR sends correct callId format

**Verification**: Compare callIds in browser console vs database

---

### 3️⃣ **Frontend Polling Not Active (3% likely)**

**Symptom**: No network requests in browser DevTools

**Cause**: `pollMode` not enabled or callId not set

**Fix**: Verify `pollMode = true` in code

**Verification**: Browser console shows polling logs every 5s

---

### 4️⃣ **Supabase Connection Issue (2% likely)**

**Symptom**: 500 errors in API responses

**Cause**: Invalid Supabase credentials

**Fix**: Verify environment variables

**Verification**: API returns 200 OK with data

---

## 📞 Escalation Path

If after following all steps above, issue persists:

1. **Capture these artifacts**:
   - Complete Render logs (last 30 minutes)
   - Browser console logs (full output)
   - Browser network tab (export as HAR)
   - Supabase query results (last 20 transcripts)
   - Environment variables list (screenshot from Render)

2. **Check these specific files**:
   - `instrumentation.ts` - Is TranscriptConsumer disabled?
   - `hooks/useRealtimeTranscript.ts` - Is pollMode true?
   - `app/api/transcripts/latest/route.ts` - Is Supabase query correct?

3. **Emergency workaround**:
   - Hard-code disable TranscriptConsumer in code
   - Force enable verbose logging in frontend
   - Add explicit callId in URL for testing

---

## 💡 Quick Win Test

**To prove the system works end-to-end:**

```bash
# 1. Send transcript with NEW callId
TEST_CALL="test-$(date +%s)"
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "'$TEST_CALL'",
    "transcript": "Test message 1",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true,
    "asr_service": "Test",
    "session_id": null
  }'

sleep 2

# 2. Send another transcript to same callId
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "'$TEST_CALL'",
    "transcript": "Test message 2",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true,
    "asr_service": "Test",
    "session_id": null
  }'

sleep 2

# 3. Verify they're both stored
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=$TEST_CALL"

# 4. Manually open UI with this callId
echo "Now open: https://frontend-8jdd.onrender.com/live?callId=$TEST_CALL"
echo "Check if you see the 2 test messages in the UI"
```

---

**These two documents should give your CTO everything needed to debug:**
- `ARCHITECTURE_DIAGRAM_FOR_CTO.md` (this file)
- `SIMPLE_FLOW_DIAGRAM.md` (visual flow)
- `CTO_DEBUG_COMMANDS.md` (commands to run)


# Why Transcripts Aren't Showing in UI - Root Cause & Fix

## 🔴 Root Cause

There's a **callId mismatch** between:
- What you're sending in the curl command: `"callId": "test-deployment-001"`  
- What the UI is actually polling for: **A different callId (likely from the active Exotel session)**

## 📊 How the System Works

### Flow Diagram:
```
1. curl POST /api/transcripts/receive
   └─> Stores transcript in database with callId="test-deployment-001"
   
2. UI polls /api/transcripts/latest?callId=<DIFFERENT_CALL_ID>
   └─> Doesn't find "test-deployment-001", returns empty
   
3. UI shows: "Waiting for transcript..." ⚠️
```

## ✅ The Fix (3 Options)

### Option 1: Find & Use the Correct CallID (Recommended)

**Step 1:** Look at your browser screenshot or open the browser console (F12)

**Step 2:** Find logs that look like:
```
[API-CALL] 🌐 Making polling request
{
  callId: "SOME_CALL_ID_HERE",  <-- THIS IS WHAT YOU NEED
  url: "/api/transcripts/latest?callId=SOME_CALL_ID_HERE"
}
```

**Step 3:** Copy that exact callId and use it in your curl:

```bash
# Replace <CALL_ID_FROM_CONSOLE> with the actual value from browser
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "<CALL_ID_FROM_CONSOLE>",
    "transcript": "Testing ASR - should appear in UI now!",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'
```

**Result:** Transcript will appear in UI within 5 seconds (next poll cycle) ✅

---

### Option 2: Set Your Own Test CallID in UI

**Step 1:** Open browser console (F12) on the live page

**Step 2:** Run this code to set a custom callId:
```javascript
// Subscribe to your custom callId
fetch('/api/transcripts/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ interactionId: 'my-test-123' })
}).then(r => r.json()).then(console.log);

// Reload page with your callId
setTimeout(() => {
  window.location.href = '/live?callId=my-test-123';
}, 1000);
```

**Step 3:** Now send curl with that callId:
```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "my-test-123",
    "transcript": "Testing with custom callId!",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'
```

**Result:** Transcript will appear immediately ✅

---

### Option 3: Start an Actual Exotel Call

If you want to test with real Exotel integration:

**Step 1:** Initiate an Exotel call to your app

**Step 2:** The Exotel CallSid will be used as callId automatically

**Step 3:** Send transcripts using that CallSid:
```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "<EXOTEL_CALL_SID>",
    "transcript": "Customer says: I need help with my account",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'
```

**Result:** Transcript appears in the live call UI ✅

---

## 🔍 How to Verify It's Working

### 1. Check if API Received the Transcript

```bash
# Replace <YOUR_CALL_ID> with the callId you used
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=<YOUR_CALL_ID>"
```

**Expected response:**
```json
{
  "ok": true,
  "callId": "<YOUR_CALL_ID>",
  "transcripts": [
    {
      "id": "...",
      "text": "Testing ASR - should appear in UI now!",
      "speaker": "customer",
      "timestamp": "...",
      "seq": 1
    }
  ],
  "count": 1
}
```

### 2. Check Browser Console

You should see:
```
[PERF] 📦 JSON parse completed
  transcript_count: 1  <-- Should be > 0

[PERF] ✅ Complete transcript update
  count: 1  <-- Transcripts found!
```

### 3. Check UI

- Right panel "Transcripts" section should show your text
- Should update within 5 seconds (polling interval)

---

## 🐛 Still Not Working? Debug Checklist

### ✅ Verify callId Match
```javascript
// In browser console, check what callId the UI is using:
// Look for logs with: [API-CALL] 🌐 Making polling request
// The callId in that log MUST match your curl command
```

### ✅ Verify API Received Data
```bash
# Check if data was stored (use your actual callId)
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=test-deployment-001"
```

### ✅ Check Browser Network Tab
1. Open DevTools → Network tab
2. Filter for "transcripts"
3. Look for `/api/transcripts/latest?callId=...`
4. Click on the request
5. Check the "Response" tab - should show transcripts if callId matches

### ✅ Check for Errors
```javascript
// In browser console, look for:
- Red error messages
- Failed network requests
- "Polling failed" messages
```

---

## 📝 Example Working Flow

```bash
# 1. Find callId from browser console
# Let's say you found: "exotel_abc123"

# 2. Send transcript with that exact callId
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "exotel_abc123",
    "transcript": "Hello, I need help with my credit card",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "2025-11-28T12:00:00Z",
    "isFinal": true
  }'

# 3. Wait 5 seconds (or less)

# 4. Transcript appears in UI! ✅
```

---

## 🎯 Key Takeaway

**The callId in your curl command MUST exactly match the callId the UI is polling for.**

The easiest way to ensure this:
1. Check browser console for the actual callId being used
2. Use that exact same callId in your curl command
3. Profit! 🎉

---

## 📚 Related Files

- API endpoint: `/app/api/transcripts/receive/route.ts`
- Polling logic: `/hooks/useRealtimeTranscript.ts`
- Latest API: `/app/api/transcripts/latest/route.ts`


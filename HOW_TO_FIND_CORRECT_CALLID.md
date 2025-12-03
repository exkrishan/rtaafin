# How to Find the Correct CallID for Testing

## Problem
Your UI shows "Waiting for transcript..." because there's a mismatch between:
- The `callId` you're sending in the curl command (`test-deployment-001`)
- The `callId` the UI is actually polling for

## Solution: Find the UI's CallID

### Step 1: Open Browser DevTools

1. Open your live page: https://frontend-8jdd.onrender.com/live
2. Press `F12` (or `Cmd+Option+I` on Mac) to open DevTools
3. Click on the **Console** tab

### Step 2: Look for Polling Logs

Look for logs that say:
```
[API-CALL] 🌐 Making polling request
```

The log will show something like:
```json
{
  "callId": "ACTUAL_CALL_ID_HERE",
  "url": "/api/transcripts/latest?callId=ACTUAL_CALL_ID_HERE",
  "timestamp": "2025-11-28T..."
}
```

### Step 3: Copy the Actual CallID

Note the `callId` value from the console log. This is what the UI is actually using.

### Step 4: Send Curl with Correct CallID

Now use that EXACT callId in your curl command:

```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "PASTE_ACTUAL_CALLID_FROM_CONSOLE_HERE",
    "transcript": "Testing external ASR integration - this should show up now!",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'
```

### Step 5: Verify in UI

After sending the curl command with the correct callId:
1. The transcript should appear in the UI within 5 seconds (polling interval)
2. You should see it in the "Transcripts" section on the right panel

## Alternative: Check What's in the Database

You can also check what callIds are currently in the database:

### Option A: Via Browser Console

Run this in the browser console:
```javascript
fetch('/api/transcripts/latest?callId=test-deployment-001')
  .then(r => r.json())
  .then(data => console.log('Transcripts for test-deployment-001:', data));
```

### Option B: Check All Recent Calls

```bash
# Query Supabase directly to see all recent callIds
psql $DATABASE_URL -c "SELECT DISTINCT call_id, COUNT(*) as transcript_count, MAX(created_at) as latest FROM ingest_events GROUP BY call_id ORDER BY latest DESC LIMIT 10;"
```

## Common Scenarios

### Scenario 1: Testing with a Live Call

If you have an active Exotel call:
- The callId will be the Exotel call SID (e.g., `exotel_12345678`)
- Look in the console for this value
- Use it in your curl command

### Scenario 2: Testing without a Call

If there's no active call:
1. The UI might generate a test callId
2. Check the console logs to see what it's using
3. Or start a new call and note the callId from the logs

### Scenario 3: Creating Your Own Test Call

You can manually set a callId in the browser console:
```javascript
// In browser console, trigger subscription for your test callId
fetch('/api/transcripts/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ interactionId: 'my-test-call-123' })
})
.then(() => console.log('Subscribed to my-test-call-123'));

// Then reload the page with ?callId=my-test-call-123
window.location.href = '/live?callId=my-test-call-123';
```

Now send your curl with `callId: "my-test-call-123"`.

## Debugging Tips

### 1. Check if Transcript was Received

```bash
curl https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=test-deployment-001
```

If you get transcripts back, then they were stored successfully but the UI is polling for a different callId.

### 2. Check Browser Network Tab

1. Open DevTools → Network tab
2. Filter for "transcripts"
3. Look for the `/api/transcripts/latest?callId=...` requests
4. Check what callId the UI is using

### 3. Check Console for Errors

Look for any errors in the console that might indicate:
- Connection issues
- API errors
- Polling failures

## Summary

**The Key Issue:** CallID mismatch between your test data and what the UI expects.

**The Fix:** Find the callId the UI is actually using (from browser console) and use that exact value in your curl command.


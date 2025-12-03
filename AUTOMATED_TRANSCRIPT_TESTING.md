# Fully Automated Transcript Testing Guide

## 🎯 Problem SOLVED!

You can now send transcripts via API with ANY callId and they will **automatically show up in the UI** - no manual configuration needed!

## ✅ How It Works Now (Fully Automated)

```
1. Send transcript via API with any callId
   ↓
2. API stores it in database
   ↓
3. API returns a viewUrl you can visit
   ↓
4. UI auto-discovers the call (within 10 seconds)
   ↓
5. Transcripts appear automatically! 🎉
```

## 🚀 Quick Start - Just 2 Steps!

### Step 1: Send Your Transcript (Any CallID)

```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "my-test-call-001",
    "transcript": "Hello! This is an automated test.",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'
```

**Response:**
```json
{
  "ok": true,
  "callId": "my-test-call-001",
  "seq": 1,
  "message": "Transcript received and processing",
  "viewUrl": "https://frontend-8jdd.onrender.com/live?callId=my-test-call-001",
  "autoDiscovery": "The /live page will auto-discover this call within 10 seconds, or visit the viewUrl directly"
}
```

### Step 2: View Your Transcripts (Choose One)

**Option A: Auto-Discovery (Wait 10 seconds)**
1. Open: https://frontend-8jdd.onrender.com/live
2. Wait up to 10 seconds
3. UI automatically discovers your call
4. Transcripts appear! ✅

**Option B: Direct Link (Instant)**
1. Copy the `viewUrl` from the API response
2. Open it in your browser
3. Transcripts appear instantly! ✅

## 📝 Full Example - Send Multiple Transcripts

```bash
# Send transcript 1
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "demo-call-123",
    "transcript": "Customer: Hi, I need help with my credit card.",
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'

# Wait 1 second
sleep 1

# Send transcript 2
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "demo-call-123",
    "transcript": "Agent: I can help you with that. What seems to be the issue?",
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'

# Wait 1 second
sleep 1

# Send transcript 3
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type": application/json" \
  -d '{
    "callId": "demo-call-123",
    "transcript": "Customer: There are some fraudulent charges on my statement.",
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'

echo ""
echo "✅ Transcripts sent!"
echo "📺 View at: https://frontend-8jdd.onrender.com/live?callId=demo-call-123"
echo "🔄 Or wait 10s and visit: https://frontend-8jdd.onrender.com/live (auto-discovery)"
```

## 🎬 What Happens Behind The Scenes

### When You Send a Transcript:

1. **API receives it** (`/api/transcripts/receive`)
   - Validates required fields
   - Generates sequence number automatically
   - Stores in Supabase database
   - Triggers intent detection (background)
   - Surfaces KB articles (background)
   - Returns success with `viewUrl`

2. **Database stores it** (`ingest_events` table)
   - Records: `call_id`, `seq`, `text`, `timestamp`
   - Available for querying immediately

3. **Broadcast happens** (SSE)
   - Sends to all connected clients
   - Real-time update if someone is watching

### When You Open /live Page:

1. **Page checks URL** for `?callId=...` parameter
   - If present: Uses that callId immediately ✅
   - If absent: Starts auto-discovery 🔍

2. **Auto-discovery runs** (every 10 seconds)
   - Step 1: Checks `/api/calls/active` for active Exotel calls
   - Step 2: If none found, checks `/api/calls/latest` for any calls with transcripts
   - Step 3: Automatically sets the callId and starts polling

3. **Polling starts** (`useRealtimeTranscript` hook)
   - Fetches `/api/transcripts/latest?callId=...` every 5 seconds
   - Updates UI with new transcripts
   - Displays KB suggestions
   - Shows intent detection results

## 🔧 New APIs You Can Use

### 1. Get Latest Call

```bash
curl https://frontend-8jdd.onrender.com/api/calls/latest
```

**Response:**
```json
{
  "ok": true,
  "callId": "demo-call-123",
  "transcriptCount": 5,
  "latestActivity": "2025-11-28T12:34:56Z",
  "viewUrl": "/live?callId=demo-call-123"
}
```

### 2. Get Transcripts for a Call

```bash
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=demo-call-123"
```

**Response:**
```json
{
  "ok": true,
  "callId": "demo-call-123",
  "transcripts": [
    {
      "id": "demo-call-123-1",
      "text": "Customer: Hi, I need help with my credit card.",
      "speaker": "customer",
      "timestamp": "2025-11-28T12:00:00Z",
      "seq": 1
    },
    {
      "id": "demo-call-123-2",
      "text": "Agent: I can help you with that.",
      "speaker": "agent",
      "timestamp": "2025-11-28T12:00:05Z",
      "seq": 2
    }
  ],
  "count": 2,
  "intent": "credit_card_fraud",
  "confidence": 0.92,
  "articles": [...]
}
```

## 🎯 Use Cases

### Use Case 1: Automated Testing

```bash
#!/bin/bash
# test-transcript-flow.sh

CALL_ID="automated-test-$(date +%s)"

echo "Testing automated transcript flow..."
echo "CallID: $CALL_ID"

# Send test transcript
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Automated test transcript\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }"

echo ""
echo "✅ Test transcript sent!"
echo "📺 View at: https://frontend-8jdd.onrender.com/live?callId=$CALL_ID"
```

### Use Case 2: External ASR Integration

```python
# Your external ASR service sends transcripts in real-time
import requests
from datetime import datetime

def send_transcript(call_id, text, is_final=False):
    """Send transcript to RTAA platform"""
    response = requests.post(
        'https://frontend-8jdd.onrender.com/api/transcripts/receive',
        json={
            'callId': call_id,
            'transcript': text,
            'asr_service': 'Azure',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'isFinal': is_final
        }
    )
    
    data = response.json()
    if data['ok']:
        print(f"✅ Transcript sent (seq={data['seq']})")
        print(f"📺 View at: {data['viewUrl']}")
    return data

# Usage:
send_transcript('call-123', 'Customer says: I need help', is_final=False)
send_transcript('call-123', 'Customer says: I need help with my account', is_final=True)
```

### Use Case 3: Manual Testing / Demo

Just send curls with any callId and open the /live page - it will auto-discover within 10 seconds!

## 🔍 Troubleshooting

### Transcripts Not Appearing?

**Check 1: Was the API call successful?**
```bash
# You should see: "ok": true
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{...}'
```

**Check 2: Are transcripts in the database?**
```bash
curl "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=YOUR_CALL_ID"
# You should see your transcripts in the response
```

**Check 3: Is auto-discovery working?**
- Open browser console (F12) on /live page
- Look for: `[Live] ✅ Found latest call with transcripts`
- Should happen within 10 seconds

**Check 4: Try direct link**
- Use the `viewUrl` from the API response
- Should work immediately

### Still Not Working?

1. **Check browser console** for errors
2. **Check network tab** - look for failed requests
3. **Try with a new callId** - sometimes caching issues
4. **Hard refresh** the page (Cmd+Shift+R or Ctrl+Shift+R)

## 📊 Timing

- **API response**: Immediate (< 100ms)
- **Database storage**: Immediate (< 200ms)
- **Direct link**: Works instantly
- **Auto-discovery**: Up to 10 seconds
- **Polling updates**: Every 5 seconds
- **Real-time (SSE)**: Instant (when enabled)

## 🎉 Summary

You can now:
- ✅ Send transcripts with ANY callId via API
- ✅ UI auto-discovers them automatically
- ✅ No manual setup or callId matching needed
- ✅ Works for automated testing, external integrations, and manual demos
- ✅ Get a direct viewUrl in the API response
- ✅ Everything is fully automated!

Just send your curl and either:
1. Visit the `viewUrl` from the response (instant), OR
2. Open /live and wait 10 seconds (auto-discovery)

**It just works!** 🚀


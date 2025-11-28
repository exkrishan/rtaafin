# 🚀 API Quick Reference - External ASR Integration

## Endpoint
```
POST https://frontend-8jdd.onrender.com/api/transcripts/receive
```

## Request (JSON)
```json
{
  "callId": "your-call-id",              // REQUIRED: Same for all transcripts in one call
  "transcript": "transcribed text",      // REQUIRED: The text
  "timestamp": "2024-11-28T12:00:00Z",   // REQUIRED: ISO 8601 format
  "isFinal": true,                       // REQUIRED: true=final, false=partial
  "asr_service": "Azure",                // REQUIRED: Your service name
  "session_id": null                     // OPTIONAL: Can be null
}
```

## Response (200 OK)
```json
{
  "ok": true,
  "callId": "your-call-id",
  "seq": 1,
  "message": "Transcript received and processing"
}
```

## Test Command
```bash
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-001",
    "transcript": "Hello, I need help with my billing",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "2024-11-28T12:00:00Z",
    "isFinal": true
  }'
```

## Node.js Example
```javascript
await fetch('https://frontend-8jdd.onrender.com/api/transcripts/receive', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    callId: callId,
    transcript: text,
    timestamp: new Date().toISOString(),
    isFinal: isFinal,
    asr_service: 'Azure',
    session_id: null
  })
});
```

## Important Rules
1. ✅ **Same callId** for all transcripts from one call
2. ✅ **Send both** partial (`isFinal: false`) and final (`isFinal: true`)
3. ✅ **ISO 8601 timestamp**: `YYYY-MM-DDTHH:mm:ss.sssZ`
4. ✅ **Fire-and-forget**: Don't wait for processing, just check for 200 OK
5. ✅ **Retry on 5xx errors**, don't retry on 4xx errors

## What Happens Next
1. Transcript stored in database (immediate)
2. Intent detected by AI (2-3 seconds)
3. KB articles surfaced (2-3 seconds)
4. UI updates in real-time (< 1 second)
5. Disposition generated on call end

## View Live UI
👉 https://frontend-8jdd.onrender.com/live

## Full Documentation
📖 See `DEVELOPER_INTEGRATION_GUIDE.md` for complete details


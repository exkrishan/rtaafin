# Render Deployment Checklist - External ASR Integration

## 🚨 Critical: Environment Variables to Update

### ✅ Required Environment Variables

Set these in Render dashboard for the **Frontend Service**:

```bash
# Disable old TranscriptConsumer (CRITICAL - prevents duplicate processing)
ENABLE_TRANSCRIPT_CONSUMER=false

# Supabase (already set)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# LLM Provider (already set)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-api-key

# Node Environment (already set)
NODE_ENV=production
```

### ❌ Variables to REMOVE (No Longer Needed)

Remove these from Render:
```bash
REDIS_URL                    # ❌ Remove (or keep if used elsewhere)
REDISCLOUD_URL              # ❌ Remove (or keep if used elsewhere)
PUBSUB_ADAPTER              # ❌ Remove
RENDER_SERVICE_URL          # ❌ Remove (only needed for old TranscriptConsumer)
```

---

## 📋 Step-by-Step Deployment

### Step 1: Update Environment Variables on Render

1. Go to Render Dashboard → Frontend Service → Environment
2. **Add**:
   ```
   ENABLE_TRANSCRIPT_CONSUMER=false
   ```
3. **Save Changes**
4. **Redeploy** the service

### Step 2: Verify TranscriptConsumer is Disabled

After deployment, check logs for:

✅ **Expected log** (TranscriptConsumer disabled):
```
[instrumentation] TranscriptConsumer disabled (using direct API integration)
```

❌ **Bad log** (TranscriptConsumer still active):
```
[TranscriptConsumer] Received transcript message
[RedisStreamsAdapter] messages
```

### Step 3: Test the New API Endpoint

```bash
# Send a test transcript
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-render-001",
    "transcript": "Testing after disabling TranscriptConsumer",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "isFinal": true
  }'

# Expected response:
# {"ok":true,"callId":"test-render-001","seq":1,"message":"Transcript received and processing"}
```

### Step 4: Verify UI Receives Transcripts

1. Open: https://frontend-8jdd.onrender.com/live
2. Send test transcript (above command)
3. Check if transcript appears in UI within 5 seconds (polling interval)

---

## 🐛 Troubleshooting

### Issue: Transcripts still not appearing in UI

**Check Render Logs for**:
```bash
# 1. Verify TranscriptConsumer is disabled
grep "TranscriptConsumer disabled" logs

# 2. Check if API receives transcript
grep "ReceiveTranscript" logs

# 3. Check if Supabase storage works
grep "Stored in Supabase" logs

# 4. Check if broadcasting works
grep "Broadcasting transcript_line" logs
```

**Check Frontend Logs** (browser console):
```javascript
// 1. Verify polling is active
// Look for: "[useRealtimeTranscript] 📊 Polling for transcripts"

// 2. Check API responses
// Look for: "/api/transcripts/latest?callId=xxx"

// 3. Check for errors
// Look for any errors in console
```

### Issue: UI shows "excessive discovery calls"

This is a **separate issue** from transcript display. To fix:

1. Check `app/live/page.tsx` - the auto-discovery polling interval
2. Current setting: Every 30 seconds when callId is set
3. If needed, increase the interval to 60 seconds

---

## 🔧 Quick Fixes

### Fix 1: Force Disable TranscriptConsumer in Code

If env var doesn't work, hard-code it:

**File**: `instrumentation.ts`

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // HARD-CODED: Always disable TranscriptConsumer
    const FORCE_DISABLE = true; // Set to false to re-enable
    
    if (FORCE_DISABLE || process.env.ENABLE_TRANSCRIPT_CONSUMER !== 'true') {
      console.info('[instrumentation] TranscriptConsumer disabled');
      return;
    }
    
    // ... rest of the code
  }
}
```

### Fix 2: Check Polling Mode in Frontend

**File**: `hooks/useRealtimeTranscript.ts`

Verify `pollMode` is set:
```typescript
const pollMode = true; // Should be true for polling mode
```

---

## 📊 Success Criteria

After deployment, verify:

- ✅ No `[TranscriptConsumer]` logs in Render
- ✅ `/api/transcripts/receive` returns 200 OK
- ✅ Transcripts stored in Supabase (`ingest_events` table)
- ✅ Transcripts appear in UI within 5 seconds
- ✅ Intent detection works
- ✅ KB articles surface
- ✅ No excessive discovery warnings

---

## 📞 Contact Your External ASR Developer

Share this API endpoint information:

**Production Endpoint**:
```
POST https://frontend-8jdd.onrender.com/api/transcripts/receive
```

**Request Format**:
```json
{
  "callId": "string",
  "transcript": "string",
  "timestamp": "2024-11-28T12:00:00Z",
  "isFinal": boolean,
  "asr_service": "Azure",
  "session_id": null
}
```

**No authentication required**.

---

## 🚀 Next Steps

1. ✅ Set `ENABLE_TRANSCRIPT_CONSUMER=false` on Render
2. ✅ Redeploy frontend service
3. ✅ Test with curl command
4. ✅ Configure external ASR to POST to the endpoint
5. ✅ Verify transcripts in UI
6. ✅ Monitor Render logs for 24 hours
7. ✅ Once stable, remove old services (Ingest, ASR Worker)

---

**Last Updated**: November 28, 2024  
**Status**: Ready for Deployment


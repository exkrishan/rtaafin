# 🚨 Urgent Debug Guide - Demo & Live URLs Not Working

## Step 1: Verify Deployment Status

### Check Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your **frontend service** (e.g., `rtaa-frontend`)
3. Check **Status:**
   - ✅ **"Live"** = Service is running
   - ❌ **"Failed"** = Service failed (check logs)
   - ⏳ **"Building"** = Still building

### Check Build Logs

1. Click on your frontend service
2. Go to **"Logs"** tab
3. Scroll to **build section**
4. Look for:
   - ✅ `✓ Compiled successfully`
   - ✅ `✓ Ready in X seconds`
   - ❌ `Build failed`
   - ❌ `Error: Cannot find module...`

**If build failed:**
- Copy the error message
- Check what's missing
- Common issues: TypeScript errors, missing dependencies

### Check Branch

1. Go to **Settings** → **Build & Deploy**
2. Verify **Branch** is: `demo/live-agent-assist/auto-20250109`
3. If not, update it and redeploy

---

## Step 2: Test URLs Directly

### Test Root URL

```bash
curl https://rtaa-frontend.onrender.com/
```

**Expected:** HTML content (200 OK)  
**If 404:** Service not deployed or wrong URL

### Test Health Endpoint

```bash
curl https://rtaa-frontend.onrender.com/api/health
```

**Expected:** `{"status":"ok"}`  
**If 404:** API routes not working

### Test Demo Route

```bash
curl https://rtaa-frontend.onrender.com/demo
```

**Expected:** HTML content (200 OK)  
**If 404:** Route not found - check if `app/demo/page.tsx` exists

### Test Live Route

```bash
curl https://rtaa-frontend.onrender.com/live
```

**Expected:** HTML content (200 OK)  
**If 404:** Route not found - check if `app/live/page.tsx` exists

---

## Step 3: Debug Transcript Issue in Browser

### Open Demo Page

1. Open: `https://rtaa-frontend.onrender.com/demo`
2. Open **Browser Console** (F12)
3. Look for these logs:

**On Page Load:**
```
[Demo] ✅ Loaded transcript: 100 lines
[TranscriptPanel] 🔌 Connecting to SSE stream { callId: 'demo-call-...' }
[TranscriptPanel] SSE URL: /api/events/stream?callId=...
[TranscriptPanel] ✅ SSE connection opened { callId: 'demo-call-...' }
```

**If you see errors:**
- `Failed to load demo_playback.json` → JSON file not found
- `SSE connection closed` → SSE endpoint not working
- `404` on `/api/events/stream` → API route not deployed

### Click "Start Call"

**Expected logs:**
```
[Demo] Starting call: { callId: '...', transcriptLines: 100 }
[Demo] 📤 Sending transcript line: { seq: 1, index: 0, callId: '...', ... }
[Demo] ✅ Transcript line sent successfully: { seq: 1, intent: '...' }
[TranscriptPanel] Received transcript_line event { eventCallId: '...', expectedCallId: '...', hasText: true }
[TranscriptPanel] Adding transcript line { seq: 1, text: '...' }
```

**If you DON'T see these:**
- Check Network tab for `/api/calls/ingest-transcript` requests
- Check if requests return 200 OK or error
- Check if SSE connection is still open

---

## Step 4: Test Transcript Broadcasting Manually

### Use Debug Endpoint

Open browser console and run:

```javascript
// Test transcript broadcasting
fetch('/api/debug/test-transcript', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    callId: 'demo-call-test',
    text: 'Test transcript line',
    seq: 1
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

**Expected:** `{ ok: true, message: 'Test transcript broadcasted', ... }`

**Then check TranscriptPanel:**
- Should see: `[TranscriptPanel] Received transcript_line event`
- Should see transcript appear in UI

**If not working:**
- SSE connection might not be established
- `broadcastEvent` might not be working
- Check server logs for errors

---

## Step 5: Check Server Logs

### In Render Dashboard

1. Go to Frontend service → **Logs**
2. Look for:

**SSE Connection:**
```
[sse-endpoint] New connection request { callId: 'demo-call-...' }
[realtime] New SSE client connected { clientId: '...', callId: 'demo-call-...' }
```

**Transcript Ingestion:**
```
[ingest-transcript] Received transcript { callId: '...', seq: 1, textLength: 50 }
[realtime] Broadcast transcript_line { callId: '...', seq: 1, recipients: 1 }
```

**If you see errors:**
- `Failed to register client` → SSE endpoint issue
- `Failed to broadcast` → Real-time module issue
- `Cannot find module` → Missing dependency

---

## Step 6: Common Fixes

### Fix 1: Routes Not Found (404)

**Cause:** Build didn't include routes or wrong branch

**Fix:**
1. Verify branch: `demo/live-agent-assist/auto-20250109`
2. Clear build cache: Render Dashboard → Manual Deploy → "Clear build cache & deploy"
3. Wait for rebuild

### Fix 2: Transcripts Not Appearing

**Cause:** SSE connection not established or broadcastEvent not working

**Fix:**
1. Check if SSE endpoint is accessible: `curl https://rtaa-frontend.onrender.com/api/events/stream?callId=test`
2. Check browser console for SSE errors
3. Verify `broadcastEvent` is being called (check server logs)

### Fix 3: Demo JSON Not Loading

**Cause:** `demo_playback.json` not in `public/` folder

**Fix:**
1. Verify file exists: `public/demo_playback.json`
2. Check file is valid JSON
3. Verify file is included in build

### Fix 4: API Routes Not Working

**Cause:** Next.js API routes not deployed correctly

**Fix:**
1. Check `app/api/` folder structure
2. Verify routes have `export const runtime = 'nodejs'` if needed
3. Check for TypeScript compilation errors

---

## Step 7: Quick Test Script

Run this in browser console on Demo page:

```javascript
// 1. Check if transcript loaded
console.log('Transcript loaded:', window.demoTranscript?.length || 'NO');

// 2. Check SSE connection
const testEventSource = new EventSource('/api/events/stream?callId=test');
testEventSource.onopen = () => console.log('✅ SSE works');
testEventSource.onerror = (e) => console.error('❌ SSE error:', e);

// 3. Test transcript send
fetch('/api/calls/ingest-transcript', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'default' },
  body: JSON.stringify({
    callId: 'test-call',
    seq: 1,
    ts: new Date().toISOString(),
    text: 'Test: Agent: Hello'
  })
})
.then(r => r.json())
.then(d => console.log('✅ Ingest response:', d))
.catch(e => console.error('❌ Ingest error:', e));
```

---

## Step 8: Verify File Structure

Ensure these files exist:

```
app/
  ├── demo/
  │   └── page.tsx          ✅ Must exist
  ├── live/
  │   └── page.tsx          ✅ Must exist
  ├── api/
  │   ├── events/
  │   │   └── stream/
  │   │       └── route.ts  ✅ Must exist
  │   └── calls/
  │       └── ingest-transcript/
  │           └── route.ts  ✅ Must exist
public/
  └── demo_playback.json    ✅ Must exist
```

---

## Step 9: Check Environment Variables

In Render Dashboard → Environment, verify:

**Required for Demo:**
- `NEXT_PUBLIC_SUPABASE_URL` ✅
- `SUPABASE_SERVICE_ROLE_KEY` ✅

**Required for Live:**
- `REDIS_URL` ✅
- `GEMINI_API_KEY` ✅

---

## Step 10: Last Resort - Redeploy

If nothing works:

1. **Clear Build Cache:**
   - Render Dashboard → Manual Deploy → "Clear build cache & deploy"

2. **Verify Branch:**
   - Settings → Build & Deploy → Branch: `demo/live-agent-assist/auto-20250109`

3. **Check Build Command:**
   - Should be: `npm ci && npm run build`

4. **Check Start Command:**
   - Should be: `npm run start`

5. **Wait for Full Deployment:**
   - Build: ~5-10 minutes
   - Service start: ~1-2 minutes

---

## 📞 What to Report

If still not working, provide:

1. **Render Logs:**
   - Build logs (last 50 lines)
   - Runtime logs (last 50 lines)

2. **Browser Console:**
   - All errors and warnings
   - Network tab for failed requests

3. **Service Status:**
   - Service name
   - Status (Live/Failed/Building)
   - Branch name

4. **Test Results:**
   - Root URL works? (Y/N)
   - Health endpoint works? (Y/N)
   - Demo URL works? (Y/N)
   - Live URL works? (Y/N)

---

**Last Updated:** 2025-01-09  
**Branch:** `demo/live-agent-assist/auto-20250109`


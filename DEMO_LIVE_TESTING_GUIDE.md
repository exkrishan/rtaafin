# 🧪 Demo & Live UI Testing Guide

## ✅ Changes Made

1. **Unified Layout**: Both Demo and Live pages now use the same complete Agent desktop layout (3-column grid matching Dashboard)
2. **Fixed Transcript Firing**: Added 500ms delay after "Start Call" to ensure SSE connection is established
3. **Improved Logging**: Added console logs to track transcript sending and receiving

---

## 🚀 Deployment Steps

### 1. Update Render Frontend Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your **frontend service** (`rtaa-frontend` or similar)
3. Go to **Settings** → **Build & Deploy**
4. Update **Branch** to: `demo/live-agent-assist/auto-20250109`
5. Click **Save Changes**
6. Wait for deployment to complete (~5-10 minutes)

### 2. Verify Deployment

After deployment, check:

**Service Status:**
- Status should be **"Live"** (green)
- Build logs should show: `✓ Compiled successfully`
- Runtime logs should show: `Ready in X seconds`

**Health Check:**
```bash
curl https://rtaa-frontend.onrender.com/api/health
# Expected: {"status":"ok"}
```

---

## 🧪 Manual Testing - Demo UI

### Step 1: Access Demo Page

1. Open browser: `https://rtaa-frontend.onrender.com/demo`
2. **Expected:** Page loads with 3-column layout:
   - Left: Transcript panel with "Start Call" button
   - Center: Customer Info placeholder
   - Right: Agent Assist panel

### Step 2: Test Transcript Playback

1. **Click "Start Call" button** (top right of Transcript panel)
2. **Expected Behavior:**
   - Progress bar appears at top
   - Transcript lines appear in Transcript panel (every ~2 seconds)
   - KB suggestions appear in Agent Assist panel (when intent detected)
   - Progress bar fills up (0% → 100%)

3. **Check Browser Console (F12):**
   - Should see: `[Demo] Starting call: { callId: '...', transcriptLines: 100 }`
   - Should see: `[Demo] Sending transcript line: { seq: 1, ... }`
   - Should see: `[Demo] ✅ Transcript line sent successfully`
   - Should see: `[TranscriptPanel] Received transcript_line event`
   - Should see: `[TranscriptPanel] Adding transcript line`

### Step 3: Test Controls

**While Playing:**
- Click **"Pause"** → Playback pauses
- Click **"Resume"** → Playback resumes
- Click **"Stop"** → Playback stops, call ends

**After Playback:**
- Disposition modal should auto-open
- Click **"Reset"** → Resets to initial state
- Click **"Export"** → Downloads JSON file

### Step 4: Verify Transcript Display

**Expected:**
- Transcript lines appear in real-time
- Each line shows speaker (Agent/Customer) and text
- Lines are formatted correctly
- Scroll auto-follows new lines

---

## 🧪 Manual Testing - Live UI

### Step 1: Access Live Page

1. Open browser: `https://rtaa-frontend.onrender.com/live`
2. **Expected:** 
   - Page loads with 3-column layout (same as Demo)
   - Environment variable banner may appear if vars are missing
   - Interaction ID input field at top

### Step 2: Test with Real Interaction ID

1. **Get Interaction ID from ASR Worker logs:**
   - Go to Render Dashboard → ASR Worker → Logs
   - Look for: `interaction_id: '34fdf329ef5d13c1a7c1e33be86a19b9'`
   - Copy the interaction_id

2. **Enter Interaction ID:**
   - Paste into input field
   - **Expected:** Transcripts start appearing automatically (if ASR Worker is processing)

3. **Check Browser Console:**
   - Should see: `[Live] Subscribing to transcripts for: <interaction_id>`
   - Should see: `[Live] ✅ Subscribed to transcripts`
   - Should see: `[TranscriptPanel] Received transcript_line event`

### Step 3: Test Disposition

1. Click **"📝 Dispose Call"** button
2. **Expected:**
   - Disposition modal opens
   - Shows suggested dispositions
   - Shows auto-generated notes

---

## 🔍 Troubleshooting

### Issue 1: URLs Return 404

**Symptoms:**
- `https://rtaa-frontend.onrender.com/demo` → 404 Not Found
- `https://rtaa-frontend.onrender.com/live` → 404 Not Found

**Solutions:**
1. **Check Branch:** Ensure Render service is using branch `demo/live-agent-assist/auto-20250109`
2. **Check Build:** Look for build errors in Render logs
3. **Clear Cache:** Try "Clear build cache & deploy" in Render
4. **Wait:** Render URLs may take a few minutes to propagate

### Issue 2: Transcripts Not Appearing in Demo

**Symptoms:**
- Click "Start Call" but no transcripts appear
- Progress bar moves but Transcript panel stays empty

**Solutions:**
1. **Check Browser Console:**
   - Look for errors
   - Check if `[Demo] Sending transcript line` appears
   - Check if `[TranscriptPanel] Received transcript_line event` appears

2. **Check Network Tab:**
   - Look for `/api/calls/ingest-transcript` requests
   - Should return `200 OK`
   - Check response body for errors

3. **Check SSE Connection:**
   - Look for `/api/events/stream?callId=...` request
   - Should show "EventStream" type
   - Should stay open (not close immediately)

4. **Verify JSON File:**
   - Check if `/demo_playback.json` loads correctly
   - Should return JSON array with transcript lines

### Issue 3: Transcripts Not Appearing in Live

**Symptoms:**
- Enter interaction ID but no transcripts appear

**Solutions:**
1. **Check Environment Variables:**
   - `REDIS_URL` must be set
   - `GEMINI_API_KEY` must be set (for intent detection)
   - `NEXT_PUBLIC_SUPABASE_URL` must be set

2. **Check ASR Worker:**
   - Verify ASR Worker is running and processing audio
   - Check ASR Worker logs for transcript publications

3. **Check Transcript Consumer:**
   - Verify transcript consumer is running (in Next.js API)
   - Check logs for subscription messages

4. **Check Redis:**
   - Verify Redis connection is working
   - Check if transcripts are being published to Redis Streams

### Issue 4: Layout Issues

**Symptoms:**
- Layout looks broken
- Columns not aligned correctly

**Solutions:**
1. **Clear Browser Cache:** Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
2. **Check CSS:** Verify Tailwind classes are being applied
3. **Check Viewport:** Ensure browser window is wide enough (layout is responsive)

---

## 📊 Expected Console Logs

### Demo Page - Successful Playback

```
[Demo] Loaded transcript: 100 lines
[Demo] Starting call: { callId: 'demo-call-...', transcriptLines: 100 }
[Demo] Sending transcript line: { seq: 1, index: 0, text: 'Agent: Good morning!...' }
[Demo] ✅ Transcript line sent successfully: { seq: 1, intent: 'greeting' }
[TranscriptPanel] Received transcript_line event { eventCallId: 'demo-call-...', expectedCallId: 'demo-call-...', hasText: true }
[TranscriptPanel] Adding transcript line { seq: 1, text: 'Agent: Good morning!...' }
[Demo] Sending transcript line: { seq: 2, index: 1, ... }
...
[Demo] All transcript lines sent
```

### Live Page - Successful Subscription

```
[Live] Subscribing to transcripts for: 34fdf329ef5d13c1a7c1e33be86a19b9
[Live] ✅ Subscribed to transcripts { interactionId: '34fdf329ef5d13c1a7c1e33be86a19b9' }
[TranscriptPanel] Received transcript_line event { eventCallId: '34fdf329ef5d13c1a7c1e33be86a19b9', ... }
[TranscriptPanel] Adding transcript line { seq: 1, ... }
```

---

## ✅ Acceptance Criteria

### Demo UI
- [ ] Page loads at `/demo` route
- [ ] 3-column layout displays correctly
- [ ] "Start Call" button is visible and enabled
- [ ] Clicking "Start Call" triggers transcript playback
- [ ] Transcripts appear in real-time (~2s cadence)
- [ ] Progress bar shows progress (0% → 100%)
- [ ] KB suggestions appear when intent detected
- [ ] Disposition modal auto-opens after playback
- [ ] "Reset" button works
- [ ] "Export" button downloads JSON

### Live UI
- [ ] Page loads at `/live` route
- [ ] 3-column layout displays correctly (same as Demo)
- [ ] Environment variable banner shows if vars missing
- [ ] Interaction ID input field is visible
- [ ] Entering interaction ID subscribes to transcripts
- [ ] Transcripts appear in real-time (if ASR Worker is processing)
- [ ] "Dispose Call" button works
- [ ] Disposition modal opens with suggestions

---

## 🎯 Next Steps After Testing

1. **If Everything Works:**
   - ✅ Demo and Live UIs are ready for demo
   - ✅ Both use same complete Agent desktop layout
   - ✅ Transcripts fire correctly in Demo
   - ✅ Live UI connects to real-time transcripts

2. **If Issues Found:**
   - Check browser console for errors
   - Check Render logs for build/runtime errors
   - Verify environment variables are set correctly
   - Test locally first: `npm run dev`

---

**Last Updated:** 2025-01-09  
**Branch:** `demo/live-agent-assist/auto-20250109`


# 🧪 Complete Testing Guide - Step by Step

## Prerequisites

1. **Next.js Running Locally:**
   ```bash
   # Check if running
   curl http://localhost:3000/api/health
   
   # If not running, start it:
   ./start-dev.sh
   # or
   npm run dev
   ```

2. **Transcript Consumer Active:**
   ```bash
   curl http://localhost:3000/api/transcripts/status
   ```
   Should show: `"isRunning": true`

---

## Step 1: Test UI Locally (Verify UI Works)

1. **Open Test UI:**
   ```
   http://localhost:3000/test-transcripts
   ```

2. **Test Manual Injection:**
   - Enter interaction ID: `test-123`
   - Click: **"Send Test Transcript"** (green button)
   - ✅ Transcript should appear immediately
   - This confirms the UI works

---

## Step 2: Make a NEW Call from Exotel

⚠️ **IMPORTANT:** Make a **NEW** call, not the old one!

- Start a fresh call from Exotel
- Get the **NEW interaction ID** from:
  - Exotel dashboard, OR
  - Render ASR worker logs (look for new `call-*` ID)
- Example: `call-1762531234567` (new ID, not `call-1762530768573`)

**Why NEW call?**
- Old call (`call-1762530768573`) has cached empty state
- New call will use fresh mock provider state with the fix

---

## Step 3: Subscribe in Test UI

1. **Open Test UI:**
   ```
   http://localhost:3000/test-transcripts
   ```

2. **Enter the NEW Interaction ID:**
   - Paste the interaction ID from Step 2
   - Example: `call-1762531234567`

3. **Click: "Subscribe to Transcripts"** (blue button)
   - Status should show: `✅ Subscribed to transcripts`
   - Green "Subscribed" badge should appear at top right

---

## Step 4: Watch for Transcripts

- Transcripts should appear **automatically** in the list below
- Should see **actual text** (not empty or `[EMPTY]`)
- Watch the count increase: `Transcripts (1)`, `Transcripts (2)`, etc.
- Each transcript shows:
  - Type: `partial` or `final`
  - Sequence number
  - **Text content** (should have words!)
  - Timestamp

---

## Step 5: Verify in Logs

### Render ASR Worker Logs

**✅ GOOD (New Call):**
```
[ASRWorker] Published partial transcript {
  interaction_id: 'call-1762531234567',
  text: 'Hello',
  textLength: 5,
  seq: 1,
  provider: 'mock'
}
```

**❌ BAD (Old Call - Expected):**
```
[ASRWorker] Published partial transcript {
  interaction_id: 'call-1762530768573',
  text: '',
  textLength: 0,
  seq: 4
}
⚠️ WARNING: Published transcript with EMPTY text!
```

### Next.js Terminal Logs

**✅ GOOD:**
```
[TranscriptConsumer] Received transcript message {
  interaction_id: 'call-1762531234567',
  type: 'partial',
  seq: 1,
  textLength: 5,
  textPreview: 'Hello'
}
[TranscriptConsumer] ✅ Forwarded transcript successfully {
  intent: 'credit_card_issue',
  articlesCount: 3
}
```

**❌ BAD (Old Call):**
```
[TranscriptConsumer] ⚠️ Received transcript with EMPTY text (allowing through for debugging)
[TranscriptConsumer] Received transcript message {
  textLength: 0,
  textPreview: ''
}
```

### Browser Console (F12)

**✅ GOOD:**
```
[TestUI] Received SSE event: { type: 'transcript_line', text: 'Hello', seq: 1 }
```

---

## ✅ Success Indicators

### In Render ASR Worker:
- ✅ `text: 'Hello'` (actual text, not empty)
- ✅ `textLength: 5` (or higher)
- ✅ No `⚠️ WARNING: Published transcript with EMPTY text!` for new calls

### In Next.js Terminal:
- ✅ `textLength: 5` (or higher)
- ✅ `✅ Forwarded transcript successfully`
- ✅ `intent: 'credit_card_issue'` (or similar)
- ✅ `articlesCount: 3` (or similar)

### In Test UI:
- ✅ Transcripts appear in the list
- ✅ Text shows actual words: `"Hello"`, `"Hello, I"`, etc.
- ✅ Count increases: `Transcripts (1)`, `Transcripts (2)`, etc.
- ✅ Green "Subscribed" badge visible

---

## ❌ Troubleshooting

### No Transcripts Appearing in UI

1. **Check Transcript Consumer:**
   ```bash
   curl http://localhost:3000/api/transcripts/status
   ```
   Should show: `"isRunning": true`

2. **Check Subscription:**
   - Look for green "Subscribed" badge in UI
   - Check browser console (F12) for SSE connection
   - Should see: `[TestUI] Received SSE event`

3. **Check Next.js Logs:**
   - Should see: `[TranscriptConsumer] Received transcript message`
   - Should see: `[TranscriptConsumer] ✅ Forwarded transcript successfully`

4. **Check ASR Worker:**
   - Check Render ASR worker logs
   - Should see: `[ASRWorker] Published partial transcript`
   - Verify it's a **NEW call** (not old one)

5. **Verify It's a NEW Call:**
   - Old call (`call-1762530768573`) will show empty text
   - Need a **fresh call** to test the fix

### Still Seeing Empty Text

- **If it's the old call:** This is expected - make a NEW call
- **If it's a new call:** Check Render logs for:
  - `⚠️ WARNING: Published transcript with EMPTY text!`
  - `[MockProvider] ⚠️ CRITICAL: Generated EMPTY text!`
  - This will help debug the mock provider

### UI Not Loading

- Check Next.js is running: `curl http://localhost:3000/api/health`
- Check browser console for errors
- Try refreshing the page

---

## 🎯 Quick Test Checklist

- [ ] Next.js running on port 3000
- [ ] Test UI opens: `http://localhost:3000/test-transcripts`
- [ ] "Send Test Transcript" works (UI verified)
- [ ] Made a **NEW** call from Exotel
- [ ] Got new interaction ID
- [ ] Subscribed to new interaction ID in UI
- [ ] Transcripts appear with actual text
- [ ] Render logs show `textLength > 0` for new call
- [ ] Next.js logs show successful forwarding

---

## 📞 Support

If issues persist:
1. Check all logs (Render, Next.js, Browser console)
2. Verify it's a NEW call (not old cached one)
3. Check transcript consumer status
4. Verify ASR worker is processing audio

---

**🎉 Ready to test! Follow the steps above and you should see transcripts with text!**

   - Old call (`call-1762530768573`) will show empty text
   - Need a **fresh call** to test the fix

### Still Seeing Empty Text

- **If it's the old call:** This is expected - make a NEW call
- **If it's a new call:** Check Render logs for:
  - `⚠️ WARNING: Published transcript with EMPTY text!`
  - `[MockProvider] ⚠️ CRITICAL: Generated EMPTY text!`
  - This will help debug the mock provider

### UI Not Loading

- Check Next.js is running: `curl http://localhost:3000/api/health`
- Check browser console for errors
- Try refreshing the page

---

## 🎯 Quick Test Checklist

- [ ] Next.js running on port 3000
- [ ] Test UI opens: `http://localhost:3000/test-transcripts`
- [ ] "Send Test Transcript" works (UI verified)
- [ ] Made a **NEW** call from Exotel
- [ ] Got new interaction ID
- [ ] Subscribed to new interaction ID in UI
- [ ] Transcripts appear with actual text
- [ ] Render logs show `textLength > 0` for new call
- [ ] Next.js logs show successful forwarding

---

## 📞 Support

If issues persist:
1. Check all logs (Render, Next.js, Browser console)
2. Verify it's a NEW call (not old cached one)
3. Check transcript consumer status
4. Verify ASR worker is processing audio

---

**🎉 Ready to test! Follow the steps above and you should see transcripts with text!**

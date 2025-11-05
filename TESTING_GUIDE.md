# Agent Assist UI - Local Testing Guide

## 🚀 Quick Start

The dev server should already be running. If not, start it with:

```bash
npm run dev
```

## 📍 Access the Demo Page

Open your browser and navigate to:
**http://localhost:3000/demo**

## ✅ Testing Checklist

### 1. **Layout & Visual Structure**
- [ ] **Top Bar**: Should show "Agent Assist 22" with notification bell and "SM" avatar with green dot
- [ ] **Left Navigation**: Dark gray sidebar with icons (home, arrow, headset, plus, calendar, search, settings)
- [ ] **Three Columns**: 
  - Left: Call/Transcript panel (320px)
  - Center: Customer details (flexible width)
  - Right: Agent Assist panel (320px)

### 2. **Left Column - Call/Transcript**
- [ ] **Call Header**: Green dot, "Manish", timer "01:33", navigation arrows
- [ ] **Call Controls**: Microphone, pause, rewind, fast-forward, hang up buttons
- [ ] **Transcript Header**: "Transcript" title with search icon and "All" dropdown
- [ ] **Call Details**: Campaign, Queue, Call Type, DID displayed
- [ ] **Transcript Messages**: Should be empty initially (waiting for call to start)

### 3. **Center Column - Customer Details**
- [ ] **Customer Header**: "Manish Jain" with "M" avatar, green checkmark, phone/edit icons
- [ ] **Tabs**: "Customer" (active) and "LeadSquare" tabs
- [ ] **Customer Info Card**: 
  - Contact details (phone, email, Instagram)
  - Sentiment Trend graph placeholder
  - "Positive" sentiment indicator
- [ ] **Summary Section**: "Summary" title with "Last 5 Interaction" button
- [ ] **Past Interactions**: 
  - Intent: "Complex Trade Execution Support" with "Neutral" pill
  - Case cards with descriptions and timestamps

### 4. **Right Column - Agent Assist Panel**
- [ ] **Header**: "Agent Assist" with "AI Powered Suggestions" subtitle and collapse icon
- [ ] **Search Box**: Input with magnifying glass icon, placeholder "Search"
- [ ] **Empty State**: Should show "Looking for suggestions" when no KB articles are available

### 5. **Testing the Call Flow**

#### Step 1: Start a Call
1. Click the **"▶ Start Call"** button (bottom left)
2. Watch the transcript panel - messages should appear one by one
3. Messages should display as chat bubbles:
   - Agent messages (blue/purple) on the right
   - Customer messages (white/gray) on the left with "M" avatar

#### Step 2: Check KB Suggestions
- After a few transcript lines, KB articles should appear in the right panel
- Each article card should show:
  - Title (bold)
  - Relevance pill (green, e.g., "90% Relevant")
  - Description (2-line truncated)
  - Action buttons: thumbs up, thumbs down, copy, open

#### Step 3: Test KB Article Actions
1. Click **thumbs up** on an article → Should show "Good Response" toast
2. Click **copy** button → Should show "Copied link" toast
3. Click **open** button → Should open article in new tab

#### Step 4: Stop/End Call
1. Click **"⏹ Stop Call"** to stop sending transcript lines
2. Or wait for all lines to finish (call will auto-end)

#### Step 5: Dispose Call
1. Click **"📝 Dispose Call"** button
2. **Disposition Modal** should appear:
   - Floating panel from left side (~360px wide)
   - "Dispose" header with X close button
   - Disposition dropdown (with emoji, e.g., "💳 Credit Card")
   - Sub-disposition dropdown
   - Call Notes textarea (with light background #FAFBFE)
   - LLM indicator icon (purple) in bottom-right of textarea
   - Warning text: "AI-suggested dispositions may be inaccurate..."
   - "Save and Dispose" button (primary blue)
   - "Dispose and Dial" button (secondary)

#### Step 6: Test Disposition Modal
1. Review the auto-generated notes
2. Select a disposition from dropdown
3. Optionally select a sub-disposition
4. Edit notes if needed
5. Click **"Save and Dispose"** → Should save and close modal, show success toast
6. Or click **"Dispose and Dial"** → Should retry summary generation

### 6. **Keyboard Accessibility**
- [ ] Press **Tab** to navigate through interactive elements
- [ ] Press **Enter** to activate buttons
- [ ] In modal, press **Esc** to close
- [ ] Focus should be visible on all interactive elements

### 7. **Responsive Design**
- [ ] Resize browser window to mobile size (< 768px)
- [ ] Columns should stack vertically
- [ ] Layout should remain usable

## 🐛 Common Issues & Solutions

### Issue: "Server is not running"
**Solution**: Run `npm run dev` in terminal

### Issue: "Transcript not appearing"
**Solution**: 
1. Check browser console for errors
2. Verify SSE connection: Look for "Connected to realtime stream" message
3. Click "Start Call" button to send test transcript

### Issue: "KB articles not showing"
**Solution**:
1. Wait a few seconds after transcript lines start
2. Check browser console for `intent_update` events
3. Verify `/api/kb/search` endpoint is working

### Issue: "Disposition modal not opening"
**Solution**:
1. Make sure call has ended (not actively sending lines)
2. Check browser console for errors
3. Verify `/api/calls/summary` endpoint is accessible

### Issue: "Styling looks broken"
**Solution**:
1. Ensure Tailwind CSS is compiled: Check `tailwind.config.js` exists
2. Clear browser cache and hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
3. Check browser console for CSS errors

## 🔍 Debugging Tips

### Browser Console
Open DevTools (F12) and look for:
- `[Demo] Sent transcript line` - confirms transcript is being sent
- `[TranscriptPanel] Received transcript_line` - confirms SSE events are received
- `[KBSuggestions] Received intent_update` - confirms KB articles are being received
- Any error messages in red

### Network Tab
Check Network tab in DevTools:
- `/api/calls/ingest-transcript` - should return 200 OK
- `/api/events/stream` - should show EventStream connection
- `/api/calls/summary` - should return JSON with dispositions

### Server Logs
Check terminal where `npm run dev` is running:
- Look for `[ingest-transcript]` logs
- Look for `[realtime] Broadcast` logs
- Check for any error messages

## 📝 Test Data

The demo uses a pre-configured test transcript with 16 messages simulating a credit card delivery inquiry conversation between Agent (Priya) and Customer (Manish).

## 🎯 Expected Behavior

1. **On Page Load**: 
   - Empty transcript panel
   - Customer details displayed
   - Empty KB suggestions panel

2. **After Clicking "Start Call"**:
   - Transcript messages appear one by one (1.5s intervals)
   - Chat bubbles appear with proper styling
   - KB articles appear after intent detection

3. **After Call Ends**:
   - "Dispose Call" button becomes enabled
   - Clicking it opens disposition modal with AI-generated notes

4. **In Disposition Modal**:
   - Dispositions are pre-filled from LLM
   - Notes are auto-generated
   - Can edit and save

## ✨ Next Steps

Once basic testing is complete, you can:
1. Test with different call scenarios
2. Test KB search functionality
3. Test feedback actions (like/dislike)
4. Verify database persistence of dispositions
5. Test with multiple concurrent calls

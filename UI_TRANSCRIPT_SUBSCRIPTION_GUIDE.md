# 📺 UI Transcript Subscription Guide

## 🔍 How Transcript Subscription Works

### **Automatic Subscription (No Click Required)** ✅

The `TranscriptPanel` component **automatically subscribes** to transcripts when:
1. A `callId` is provided
2. The component mounts (page loads)

**How it works:**
- Component uses `useEffect` to create an SSE (Server-Sent Events) connection
- Connects to: `/api/events/stream?callId=YOUR_CALL_ID`
- Automatically receives transcript updates in real-time
- **No button click needed!**

---

## 📍 Different Pages, Different Behavior

### 1. **Dashboard Page** (`/dashboard`)

**Current Setup:**
- Uses **hardcoded** `callId='call-123'`
- TranscriptPanel **automatically subscribes** to `call-123`
- **No click needed** - but only shows transcripts for `call-123`

**For Exotel Calls:**
- ❌ Won't show Exotel transcripts (wrong callId)
- ✅ Need to update `callId` to match your Exotel call ID

**How to use with Exotel:**
1. Get the call ID from Exotel (e.g., `call-1762532332133`)
2. Update the dashboard to use that callId (or make it dynamic)
3. Transcripts will appear automatically

---

### 2. **Home Page** (`/`)

**Current Setup:**
- Uses **hardcoded** `callId="demo-call-001"`
- TranscriptPanel **automatically subscribes** to `demo-call-001`
- **No click needed** - but only shows transcripts for `demo-call-001`

**For Exotel Calls:**
- ❌ Won't show Exotel transcripts (wrong callId)
- ✅ Use "Send Test Lines" button to test, or update callId

---

### 3. **Test Transcripts Page** (`/test-transcripts`)

**Current Setup:**
- **Manual subscription** required
- User must:
  1. Enter interaction ID (call ID)
  2. Click "Subscribe to Transcripts" button
  3. Then transcripts appear

**For Exotel Calls:**
- ✅ **This is the page to use!**
- Enter your Exotel call ID (e.g., `call-1762532332133`)
- Click "Subscribe to Transcripts"
- Transcripts will appear automatically after subscription

---

## 🎯 For Your Exotel Test

### **Option 1: Use Test Transcripts Page** (Recommended)

1. Go to: `https://rtaa-frontend.onrender.com/test-transcripts`
2. Enter your Exotel call ID (from logs: `call-1762532332133`)
3. Click **"Subscribe to Transcripts"** button
4. Transcripts will appear automatically as they come in

**Why this works:**
- You control which call ID to subscribe to
- Works with any Exotel call ID
- Manual but reliable

---

### **Option 2: Update Dashboard Call ID**

1. Go to: `https://rtaa-frontend.onrender.com/dashboard`
2. Currently shows transcripts for `call-123` (hardcoded)
3. To see Exotel transcripts, you'd need to:
   - Update the code to use your Exotel call ID
   - Or make it dynamic (enter call ID in UI)

**Current limitation:**
- Hardcoded callId won't match Exotel calls

---

## 🔄 Auto-Discovery (Future Enhancement)

The system has auto-discovery capability:
- TranscriptConsumer automatically discovers new transcript streams
- Runs every 30 seconds
- Auto-subscribes to new streams

**However:**
- UI components still need the correct `callId` to filter transcripts
- Auto-discovery works on backend, but UI needs to know which call to show

---

## ✅ Quick Answer

**Do you need to click anything?**

**For Dashboard/Home pages:**
- ❌ **No click needed** - but only works for hardcoded call IDs
- ⚠️ Won't show Exotel transcripts (wrong callId)

**For Test Transcripts page:**
- ✅ **Yes, you need to click "Subscribe to Transcripts"**
- Enter your Exotel call ID first
- Then click the button
- After that, transcripts appear automatically

---

## 🚀 Recommended Workflow for Exotel Testing

1. **Make Exotel call**
2. **Get call ID from logs** (e.g., `call-1762532332133`)
3. **Go to:** `https://rtaa-frontend.onrender.com/test-transcripts`
4. **Enter call ID** in the input field
5. **Click "Subscribe to Transcripts"**
6. **Watch transcripts appear** in real-time

---

## 🔧 Making It Fully Automatic (Future)

To make it fully automatic (no clicks):

1. **Auto-discover active calls** and show them in a list
2. **Auto-select the latest call** or let user choose
3. **Auto-subscribe** when call is selected
4. **Show transcripts** automatically

This would require UI changes to:
- Fetch list of active calls
- Display them in a dropdown/selector
- Auto-subscribe when selected

---

## 📝 Summary

**Current State:**
- ✅ TranscriptPanel auto-subscribes when callId is provided
- ⚠️ But callId is hardcoded in Dashboard/Home pages
- ✅ Test Transcripts page requires manual subscription (but works with any callId)

**For Exotel:**
- Use `/test-transcripts` page
- Enter Exotel call ID
- Click "Subscribe to Transcripts"
- Then transcripts appear automatically (no more clicks needed)


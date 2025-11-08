# 🖥️ UI Access Guide - Where to Check the Agent Assist Interface

## 🚀 Quick Access

### Main Pages

1. **Demo Page** (Recommended for Testing)
   - **URL:** `http://localhost:3000/demo`
   - **Purpose:** Full Agent Assist interface with transcript panel, KB articles, and disposition modal
   - **Features:**
     - Real-time transcript display (via SSE)
     - KB article recommendations
     - Intent detection display
     - Auto-disposition modal
     - Call controls (start/stop)

2. **Dashboard Page**
   - **URL:** `http://localhost:3000/dashboard`
   - **Purpose:** Dashboard view with transcript, customer info, and agent assist panel
   - **Features:**
     - 3-column layout
     - Transcript panel
     - Customer information
     - KB suggestions panel

3. **Home Page**
   - **URL:** `http://localhost:3000/`
   - **Purpose:** Landing page (may redirect or show overview)

---

## 🧪 Testing Pages

4. **Test Agent Assist Page**
   - **URL:** `http://localhost:3000/test-agent-assist`
   - **Purpose:** Test disposition taxonomy and KB article surfacing

5. **Test Ingest Page**
   - **URL:** `http://localhost:3000/test-ingest`
   - **Purpose:** Test transcript ingestion manually

---

## 📋 How to Test the Complete Flow

### Step 1: Start Next.js App

```bash
npm run dev
```

The app will start on `http://localhost:3000` (or the port specified in `PORT` env var).

### Step 2: Open Demo Page

Navigate to:
```
http://localhost:3000/demo
```

### Step 3: Start a Call

1. **Option A: Use Demo Controls**
   - Click "Start Call" button (if available)
   - Or use the demo controls to simulate a call

2. **Option B: Make Real Call from Exotel**
   - Configure Exotel to stream to your ingestion service
   - Make a call through Exotel
   - The call will flow: Exotel → Ingestion → ASR → Transcript Consumer → UI

### Step 4: Verify Real-Time Updates

Once a call is active, you should see:

1. **Transcript Panel (Left)**
   - Real-time transcript lines appearing
   - Auto-scrolling to latest utterance
   - Connection status indicator

2. **Agent Assist Panel (Right)**
   - KB articles appearing automatically
   - Confidence scores displayed
   - Like/dislike buttons

3. **Intent Detection**
   - Intent label and confidence score
   - Updates as conversation progresses

4. **Disposition Modal**
   - Auto-opens when call ends
   - Pre-filled with suggested disposition
   - Sub-disposition dropdown

---

## 🔍 What to Look For

### ✅ Success Indicators

1. **Transcript Consumer Working:**
   - Check Next.js server logs for:
     - `[TranscriptConsumer] Auto-discovered transcript stream`
     - `[TranscriptConsumer] Received transcript message`
     - `[TranscriptConsumer] ✅ Forwarded transcript successfully`

2. **SSE Connection:**
   - Browser console should show:
     - `[TranscriptPanel] SSE error` (should NOT appear)
     - `[TranscriptPanel] Received transcript_line event`
     - `[AgentAssistPanel] Received intent_update`

3. **UI Updates:**
   - Transcript lines appear in real-time
   - KB articles appear automatically
   - Intent updates show in console/logs

### ❌ Troubleshooting

**No Transcripts Appearing:**
1. Check if ASR Worker is running and processing audio
2. Check if Transcript Consumer is running: `curl http://localhost:3000/api/transcripts/status`
3. Check browser console for SSE errors
4. Check Next.js server logs for errors

**No KB Articles:**
1. Check if intent detection is working (check logs)
2. Verify KB articles exist in Supabase
3. Check browser console for intent_update events

**SSE Connection Errors:**
1. Verify `/api/events/stream` endpoint is accessible
2. Check CORS settings
3. Verify `callId` matches between frontend and backend

---

## 🌐 Production URLs

When deployed to Render or other platforms:

- **Frontend:** `https://your-app.onrender.com/demo`
- **Dashboard:** `https://your-app.onrender.com/dashboard`

---

## 📊 Monitoring Endpoints

While testing, you can check:

1. **Transcript Consumer Status:**
   ```bash
   curl http://localhost:3000/api/transcripts/status
   ```

2. **Health Check:**
   ```bash
   curl http://localhost:3000/api/health
   ```

3. **Config:**
   ```bash
   curl http://localhost:3000/api/config
   ```

---

## 🎯 Recommended Testing Flow

1. **Start Next.js:** `npm run dev`
2. **Open Browser:** `http://localhost:3000/demo`
3. **Open DevTools:** F12 (to see console logs)
4. **Make Call:** Either use demo controls or real Exotel call
5. **Watch Console:** Should see SSE events and transcript updates
6. **Verify UI:** Transcripts and KB articles should appear automatically

---

## 📝 Key URLs Summary

| Page | URL | Purpose |
|------|-----|---------|
| Demo | `/demo` | Full Agent Assist interface (recommended) |
| Dashboard | `/dashboard` | Dashboard layout |
| Test Agent Assist | `/test-agent-assist` | Test disposition/KB |
| Test Ingest | `/test-ingest` | Test ingestion |
| Health | `/api/health` | Service health |
| Transcript Status | `/api/transcripts/status` | Consumer status |

---

**🎉 Ready to test! Open `http://localhost:3000/demo` and make a call!**


## 🚀 Quick Access

### Main Pages

1. **Demo Page** (Recommended for Testing)
   - **URL:** `http://localhost:3000/demo`
   - **Purpose:** Full Agent Assist interface with transcript panel, KB articles, and disposition modal
   - **Features:**
     - Real-time transcript display (via SSE)
     - KB article recommendations
     - Intent detection display
     - Auto-disposition modal
     - Call controls (start/stop)

2. **Dashboard Page**
   - **URL:** `http://localhost:3000/dashboard`
   - **Purpose:** Dashboard view with transcript, customer info, and agent assist panel
   - **Features:**
     - 3-column layout
     - Transcript panel
     - Customer information
     - KB suggestions panel

3. **Home Page**
   - **URL:** `http://localhost:3000/`
   - **Purpose:** Landing page (may redirect or show overview)

---

## 🧪 Testing Pages

4. **Test Agent Assist Page**
   - **URL:** `http://localhost:3000/test-agent-assist`
   - **Purpose:** Test disposition taxonomy and KB article surfacing

5. **Test Ingest Page**
   - **URL:** `http://localhost:3000/test-ingest`
   - **Purpose:** Test transcript ingestion manually

---

## 📋 How to Test the Complete Flow

### Step 1: Start Next.js App

```bash
npm run dev
```

The app will start on `http://localhost:3000` (or the port specified in `PORT` env var).

### Step 2: Open Demo Page

Navigate to:
```
http://localhost:3000/demo
```

### Step 3: Start a Call

1. **Option A: Use Demo Controls**
   - Click "Start Call" button (if available)
   - Or use the demo controls to simulate a call

2. **Option B: Make Real Call from Exotel**
   - Configure Exotel to stream to your ingestion service
   - Make a call through Exotel
   - The call will flow: Exotel → Ingestion → ASR → Transcript Consumer → UI

### Step 4: Verify Real-Time Updates

Once a call is active, you should see:

1. **Transcript Panel (Left)**
   - Real-time transcript lines appearing
   - Auto-scrolling to latest utterance
   - Connection status indicator

2. **Agent Assist Panel (Right)**
   - KB articles appearing automatically
   - Confidence scores displayed
   - Like/dislike buttons

3. **Intent Detection**
   - Intent label and confidence score
   - Updates as conversation progresses

4. **Disposition Modal**
   - Auto-opens when call ends
   - Pre-filled with suggested disposition
   - Sub-disposition dropdown

---

## 🔍 What to Look For

### ✅ Success Indicators

1. **Transcript Consumer Working:**
   - Check Next.js server logs for:
     - `[TranscriptConsumer] Auto-discovered transcript stream`
     - `[TranscriptConsumer] Received transcript message`
     - `[TranscriptConsumer] ✅ Forwarded transcript successfully`

2. **SSE Connection:**
   - Browser console should show:
     - `[TranscriptPanel] SSE error` (should NOT appear)
     - `[TranscriptPanel] Received transcript_line event`
     - `[AgentAssistPanel] Received intent_update`

3. **UI Updates:**
   - Transcript lines appear in real-time
   - KB articles appear automatically
   - Intent updates show in console/logs

### ❌ Troubleshooting

**No Transcripts Appearing:**
1. Check if ASR Worker is running and processing audio
2. Check if Transcript Consumer is running: `curl http://localhost:3000/api/transcripts/status`
3. Check browser console for SSE errors
4. Check Next.js server logs for errors

**No KB Articles:**
1. Check if intent detection is working (check logs)
2. Verify KB articles exist in Supabase
3. Check browser console for intent_update events

**SSE Connection Errors:**
1. Verify `/api/events/stream` endpoint is accessible
2. Check CORS settings
3. Verify `callId` matches between frontend and backend

---

## 🌐 Production URLs

When deployed to Render or other platforms:

- **Frontend:** `https://your-app.onrender.com/demo`
- **Dashboard:** `https://your-app.onrender.com/dashboard`

---

## 📊 Monitoring Endpoints

While testing, you can check:

1. **Transcript Consumer Status:**
   ```bash
   curl http://localhost:3000/api/transcripts/status
   ```

2. **Health Check:**
   ```bash
   curl http://localhost:3000/api/health
   ```

3. **Config:**
   ```bash
   curl http://localhost:3000/api/config
   ```

---

## 🎯 Recommended Testing Flow

1. **Start Next.js:** `npm run dev`
2. **Open Browser:** `http://localhost:3000/demo`
3. **Open DevTools:** F12 (to see console logs)
4. **Make Call:** Either use demo controls or real Exotel call
5. **Watch Console:** Should see SSE events and transcript updates
6. **Verify UI:** Transcripts and KB articles should appear automatically

---

## 📝 Key URLs Summary

| Page | URL | Purpose |
|------|-----|---------|
| Demo | `/demo` | Full Agent Assist interface (recommended) |
| Dashboard | `/dashboard` | Dashboard layout |
| Test Agent Assist | `/test-agent-assist` | Test disposition/KB |
| Test Ingest | `/test-ingest` | Test ingestion |
| Health | `/api/health` | Service health |
| Transcript Status | `/api/transcripts/status` | Consumer status |

---

**🎉 Ready to test! Open `http://localhost:3000/demo` and make a call!**


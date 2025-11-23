# 🔍 UI Transcript Display Issue - Diagnostic Report

**Date:** 2025-11-17  
**Target Interaction ID:** `ab7cbdeac69d2a44ef890ecf164e19bh`

---

## ✅ Verified Working Components

### 1. Transcript Consumer
- **Status:** ✅ Running
- **Subscription:** ✅ Subscribed to target interaction ID
- **Transcripts Processed:** 16 transcripts

### 2. Ingest Transcript API
- **Status:** ✅ Accessible
- **Broadcast:** ✅ Test broadcast successful
- **Intent Detection:** ✅ Working

### 3. Transcript Parsing
- **Status:** ✅ Fixed (deployed)
- **Extraction:** Enhanced to handle multiple data structures

---

## 🔍 Root Cause Analysis

### Issue: UI Not Displaying Transcripts

**Possible Causes:**

1. **CallId Mismatch** (Most Likely)
   - UI connects to SSE with one `callId`
   - Transcripts are broadcast with a different `callId`
   - Result: Events don't match, UI skips them

2. **SSE Connection Not Established**
   - UI component not mounting
   - SSE connection failing silently
   - Component using wrong page/route

3. **Event Filtering**
   - UI filtering out events incorrectly
   - Empty text being filtered
   - System messages being skipped

---

## 📋 UI Component Usage

### Pages and Components

#### 1. `/live` Page
- **Component:** `AgentAssistPanelV2`
- **Prop:** `interactionId={callId}`
- **SSE URL:** `/api/events/stream?callId={callId}`
- **Source:** User input (state variable)
- **Status:** ✅ Should work if user enters correct ID

#### 2. `/dashboard` Page
- **Component:** `TranscriptPanel`
- **Prop:** `callId='call-123'` (hardcoded)
- **SSE URL:** `/api/events/stream?callId=call-123`
- **Source:** Hardcoded
- **Status:** ❌ **Won't match Exotel interaction IDs**

#### 3. `/test-agent-assist` Page
- **Component:** `AgentAssistPanelV2`
- **Prop:** `interactionId={callId}`
- **SSE URL:** `/api/events/stream?callId={callId}`
- **Source:** State variable (default: "test-call-123")
- **Status:** ✅ Should work if user updates the ID

---

## 🔄 Complete Flow

```
1. Exotel Call → Ingestion Service
2. Ingestion → Redis (audio_stream)
3. ASR Worker → Processes audio → ElevenLabs
4. ElevenLabs → Returns transcripts → ASR Worker
5. ASR Worker → Redis (transcript.{interaction_id})
6. Transcript Consumer → Subscribes to transcript.*
7. Transcript Consumer → Forwards to /api/calls/ingest-transcript
   - Uses callId = interactionId
8. Ingest API → Broadcasts via SSE
   - Uses callId from request body
9. SSE System → Matches clients by callId
10. UI Component → Receives events if callId matches
```

**Critical Point:** Step 7-10 must all use the **same callId**

---

## 🐛 Identified Issues

### Issue 1: Dashboard Page Hardcoded CallId
**Location:** `app/dashboard/page.tsx`
**Problem:** Hardcoded `callId='call-123'` won't match Exotel interaction IDs
**Fix:** Make it dynamic or use the actual interaction ID

### Issue 2: CallId Matching Logic
**Location:** `components/AgentAssistPanelV2.tsx` (line 309)
**Current Logic:**
```typescript
const callIdMatches = !eventCallId || eventCallId === interactionId;
```
**Status:** ✅ Correct - strict matching

**Location:** `components/TranscriptPanel.tsx` (line 89)
**Current Logic:**
```typescript
if (data.callId === callId && data.text && data.callId !== 'system') {
```
**Status:** ✅ Correct - strict matching

### Issue 3: Event Extraction
**Location:** `components/AgentAssistPanelV2.tsx` (line 290)
**Current Logic:**
```typescript
const eventCallId = data.callId || data.interaction_id || data.interactionId;
```
**Status:** ✅ Handles multiple field names

---

## 🔧 Recommended Fixes

### Fix 1: Update Dashboard Page
**File:** `app/dashboard/page.tsx`

**Current:**
```typescript
const [callId] = useState('call-123');
```

**Fix Options:**
1. **Make it dynamic from URL params:**
```typescript
const searchParams = useSearchParams();
const [callId] = useState(searchParams.get('callId') || 'call-123');
```

2. **Make it a user input:**
```typescript
const [callId, setCallId] = useState('');
// Add input field for user to enter callId
```

3. **Fetch from API:**
```typescript
// Fetch active calls and let user select
```

### Fix 2: Add Better Logging
**File:** `components/AgentAssistPanelV2.tsx`

Add more detailed logging to track:
- SSE connection establishment
- Event receipt
- CallId matching
- Event filtering

### Fix 3: Add Debug Endpoint
**File:** `app/api/debug/sse-clients/route.ts` (new)

Create an endpoint to list active SSE clients:
```typescript
export async function GET() {
  const clients = getSseClients(); // Need to export from realtime.ts
  return NextResponse.json({ clients });
}
```

---

## 🧪 Testing Steps

### Step 1: Verify UI Page
1. Go to `/live` page
2. Enter interaction ID: `ab7cbdeac69d2a44ef890ecf164e19bh`
3. Check browser console for:
   - `[AgentAssistPanel] Starting SSE connection`
   - `[AgentAssistPanel] ✅ SSE connection opened`
   - `[AgentAssistPanel] 📥 Received transcript_line event`

### Step 2: Check CallId Match
1. Open browser DevTools → Console
2. Look for transcript_line events
3. Verify:
   - `eventCallId` matches `expectedCallId`
   - No "Skipping transcript_line" messages
   - Events are being added to state

### Step 3: Test Broadcast
1. Run diagnostic script:
   ```bash
   INTERACTION_ID=ab7cbdeac69d2a44ef890ecf164e19bh npx tsx scripts/check-ui-sse-connection.ts
   ```
2. Check if test transcript appears in UI
3. Check browser console for test transcript event

### Step 4: Check Server Logs
1. Check `/api/events/stream` logs for:
   - Client registration
   - Event broadcasts
   - `recipients` count in broadcast logs
2. Check `/api/calls/ingest-transcript` logs for:
   - Transcript receipt
   - Broadcast calls
   - CallId used in broadcast

---

## 📊 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Transcript Consumer | ✅ Working | Subscribed, processing transcripts |
| Ingest API | ✅ Working | Broadcasting successfully |
| Transcript Parsing | ✅ Fixed | Enhanced extraction deployed |
| SSE System | ✅ Working | Clients can connect |
| UI Components | ⚠️ Needs Verification | Need to check actual usage |
| CallId Matching | ✅ Correct Logic | Strict matching implemented |

---

## 🎯 Next Steps

1. **Verify UI Usage:**
   - Check which page the user is viewing
   - Verify the callId being used
   - Check browser console for errors

2. **Fix Dashboard Page:**
   - Make callId dynamic
   - Add user input for interaction ID

3. **Add Debug Tools:**
   - Create SSE clients endpoint
   - Add more detailed logging
   - Add UI debug panel

4. **Monitor After Fix:**
   - Check broadcast logs for `recipients > 0`
   - Verify events reaching UI
   - Confirm transcripts displaying

---

## 🔗 Related Files

- `components/AgentAssistPanelV2.tsx` - Main UI component
- `components/TranscriptPanel.tsx` - Transcript display component
- `app/api/events/stream/route.ts` - SSE endpoint
- `lib/realtime.ts` - SSE pub/sub system
- `app/api/calls/ingest-transcript/route.ts` - Transcript ingestion
- `lib/transcript-consumer.ts` - Transcript forwarding
- `app/dashboard/page.tsx` - Dashboard page (needs fix)
- `app/live/page.tsx` - Live page (should work)

---

## 💡 Quick Fix for Testing

To quickly test if the issue is callId mismatch:

1. **Update Dashboard Page:**
   ```typescript
   const [callId] = useState('ab7cbdeac69d2a44ef890ecf164e19bh');
   ```

2. **Or use Live Page:**
   - Go to `/live`
   - Enter: `ab7cbdeac69d2a44ef890ecf164e19bh`
   - Check if transcripts appear

3. **Check Browser Console:**
   - Look for SSE connection logs
   - Look for transcript_line events
   - Check callId matching


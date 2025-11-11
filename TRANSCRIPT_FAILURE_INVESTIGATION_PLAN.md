# Transcript Failure Investigation Plan - CTO Analysis

**Date:** 2025-11-09  
**Issue:** Transcripts not appearing in deployed demo  
**Status:** 🔴 Critical - Blocking Demo

---

## Executive Summary

Transcripts are failing to display in the deployed demo environment. This document provides a comprehensive investigation plan covering all potential failure points in the transcript flow.

---

## 1. Complete Transcript Flow Architecture

### Flow Diagram
```
Demo Page (app/demo/page.tsx)
  ↓
1. Load demo_playback.json
  ↓
2. User clicks "Start Call"
  ↓
3. sendTranscriptLine() called every 2s
  ↓
4. POST /api/calls/ingest-transcript
  ├─→ Store in Supabase (ingest_events)
  ├─→ broadcastEvent() → lib/realtime.ts
  │   └─→ Send to all SSE clients matching callId
  └─→ Intent detection + KB search
      └─→ broadcastEvent() → intent_update
  ↓
5. AgentAssistPanelV2 SSE Connection
  ├─→ GET /api/events/stream?callId={interactionId}
  ├─→ Listens for 'transcript_line' events
  └─→ Updates utterances state
  ↓
6. UI displays transcripts
```

---

## 2. Critical Failure Points Analysis

### 🔴 **Failure Point 1: SSE Connection Timing**

**Location:** `app/demo/page.tsx:224-232`

**Issue:**
- Demo waits 1500ms before sending first transcript line
- SSE connection might not be established yet
- AgentAssistPanelV2 mounts when `viewMode === 'agent-assist'`
- If panel is not visible, SSE might not connect

**Evidence:**
```typescript
// Demo page - line 224
setTimeout(() => {
  sendTranscriptLine(0);
}, 1500); // May not be enough time

// AgentAssistPanelV2 - line 417
{viewMode === 'agent-assist' && (
  <AgentAssistPanelV2 interactionId={callId} ... />
)}
```

**Risk Level:** 🔴 HIGH  
**Impact:** Transcripts sent before SSE connection ready

---

### 🔴 **Failure Point 2: CallId Mismatch**

**Location:** `components/AgentAssistPanelV2.tsx:142-160`

**Issue:**
- Demo sends with `callId` (e.g., `demo-call-1234567890`)
- SSE connection uses `interactionId={callId}` 
- Broadcast uses `callId: body.callId`
- Matching logic: `!eventCallId || eventCallId === interactionId`

**Potential Mismatch:**
```typescript
// Demo sends:
{ callId: 'demo-call-1234567890', ... }

// SSE subscribes to:
/api/events/stream?callId=demo-call-1234567890

// Broadcast sends:
{ type: 'transcript_line', callId: 'demo-call-1234567890', ... }

// Matching check:
const eventCallId = data.callId || data.interaction_id || data.interactionId;
const callIdMatches = !eventCallId || eventCallId === interactionId;
```

**Risk Level:** 🟡 MEDIUM  
**Impact:** Events might be filtered out if callId doesn't match exactly

---

### 🔴 **Failure Point 3: SSE Connection State**

**Location:** `components/AgentAssistPanelV2.tsx:133-137`

**Issue:**
- `eventSource.onerror` immediately sets `wsConnected = false`
- EventSource fires `onerror` during:
  - Initial connection (CONNECTING state)
  - Temporary network issues (auto-retries)
  - Reconnection attempts
  - Actual disconnections (CLOSED state)
- No distinction between temporary and permanent failures

**Current Code:**
```typescript
eventSource.onerror = (err) => {
  console.error('[AgentAssistPanel] SSE connection error', err);
  setWsConnected(false); // ⚠️ Shows "Stream disconnected" immediately
  setHealthStatus('error');
};
```

**Risk Level:** 🔴 HIGH  
**Impact:** False "disconnected" warnings, connection might actually be working

---

### 🔴 **Failure Point 4: Deployment Platform (Render) Issues**

**Location:** `app/api/events/stream/route.ts`

**Potential Issues:**
1. **SSE Timeout:** Render might have different timeout settings
2. **Streaming Support:** Next.js streaming might behave differently on Render
3. **Memory/Connection Limits:** In-memory client store might be cleared
4. **Load Balancer:** Multiple instances might not share client connections

**Evidence:**
- Works locally but fails on Render
- "Stream disconnected" appears immediately
- No transcripts received

**Risk Level:** 🔴 HIGH  
**Impact:** Platform-specific behavior breaking SSE

---

### 🟡 **Failure Point 5: Text Filtering**

**Location:** `components/AgentAssistPanelV2.tsx:154-157, 181-184`

**Issue:**
- System messages filtered: `'Connected to realtime stream'`, `'clientId:'`
- Empty text filtered: `!text || text.length === 0`
- Speaker prefix parsing might fail

**Risk Level:** 🟡 MEDIUM  
**Impact:** Valid transcripts might be filtered out

---

### 🟡 **Failure Point 6: Broadcast Event Delivery**

**Location:** `lib/realtime.ts:140-165`

**Issue:**
- `broadcastEvent()` sends to all matching clients
- If no clients connected, events are lost
- No queue/buffer for events sent before connection

**Risk Level:** 🟡 MEDIUM  
**Impact:** Early transcript lines might be lost

---

## 3. Recent Commit Analysis

### Commit: `f4093e4` - "Ensure SSE connection always starts"
**Date:** Mon Nov 10 09:44:15 2025

**Changes:**
- Removed `isCollapsed` check from SSE connection
- SSE always connects when `interactionId` available
- Improved callId matching

**Potential Issue:**
- SSE connection might start before AgentAssistPanelV2 is mounted
- If `viewMode !== 'agent-assist'`, panel not rendered, but SSE tries to connect?

**Analysis:**
```typescript
// Line 417: Panel only renders when viewMode === 'agent-assist'
{viewMode === 'agent-assist' && (
  <AgentAssistPanelV2 interactionId={callId} ... />
)}

// But SSE connection in AgentAssistPanelV2 starts when interactionId exists
// If panel not mounted, SSE connection never starts!
```

**Risk Level:** 🔴 CRITICAL  
**Impact:** SSE connection never established if panel not visible

---

## 4. Root Cause Hypothesis

### Primary Hypothesis: **SSE Connection Never Established**

**Evidence:**
1. "Stream disconnected" appears immediately
2. No transcripts received
3. Panel might not be mounted when SSE tries to connect
4. `viewMode` state might prevent panel rendering

**Flow:**
```
1. Demo page loads
2. viewMode = 'agent-assist' (default) ✅
3. AgentAssistPanelV2 mounts
4. SSE connection starts
5. User clicks "Start Call"
6. Transcripts sent
7. BUT: If viewMode changed or panel unmounted, SSE disconnects
```

### Secondary Hypothesis: **CallId Mismatch**

**Evidence:**
1. Demo uses `callId` variable
2. Panel uses `interactionId` prop
3. Matching logic might be too strict

---

## 5. Investigation Checklist

### Phase 1: Verify SSE Connection
- [ ] Check browser console for SSE connection logs
- [ ] Verify `/api/events/stream?callId=...` returns 200
- [ ] Check if EventSource.readyState is OPEN
- [ ] Verify `registerSseClient()` is called
- [ ] Check `lib/realtime.ts` client count

### Phase 2: Verify Event Broadcasting
- [ ] Check `/api/calls/ingest-transcript` logs
- [ ] Verify `broadcastEvent()` is called
- [ ] Check if events are sent to clients
- [ ] Verify callId in broadcast matches SSE subscription

### Phase 3: Verify Event Reception
- [ ] Check if `transcript_line` events are received
- [ ] Verify callId matching logic
- [ ] Check text filtering logic
- [ ] Verify utterances state updates

### Phase 4: Verify UI Rendering
- [ ] Check if `viewMode === 'agent-assist'`
- [ ] Verify AgentAssistPanelV2 is mounted
- [ ] Check utterances array length
- [ ] Verify transcript rendering logic

---

## 6. Immediate Fixes Required

### Fix 1: Ensure SSE Connection Before Sending Transcripts
**Priority:** 🔴 CRITICAL

```typescript
// In app/demo/page.tsx
const [sseReady, setSseReady] = useState(false);

// Wait for SSE connection confirmation
useEffect(() => {
  if (isCallActive && !sseReady) {
    // Poll or wait for SSE connection
    const checkInterval = setInterval(() => {
      // Check if SSE is ready (via custom event or state)
    }, 100);
    return () => clearInterval(checkInterval);
  }
}, [isCallActive, sseReady]);

// Only start sending when SSE ready
if (!sseReady) {
  // Wait longer or show message
}
```

### Fix 2: Improve SSE Error Handling
**Priority:** 🔴 CRITICAL

```typescript
// In components/AgentAssistPanelV2.tsx
eventSource.onerror = (err) => {
  // Check readyState before showing error
  if (eventSource.readyState === EventSource.CLOSED) {
    // Actually disconnected
    setWsConnected(false);
    setHealthStatus('error');
  } else {
    // Still connecting or open - EventSource will auto-retry
    console.warn('[AgentAssistPanel] SSE connection issue (auto-retrying)');
  }
};
```

### Fix 3: Add Connection State Callback
**Priority:** 🟡 HIGH

```typescript
// Add onConnectionStateChange prop to AgentAssistPanelV2
onConnectionStateChange?: (connected: boolean) => void;

// Call it when connection state changes
eventSource.onopen = () => {
  setWsConnected(true);
  onConnectionStateChange?.(true);
};
```

### Fix 4: Increase Initial Delay
**Priority:** 🟡 MEDIUM

```typescript
// Increase delay to 3000ms to ensure SSE connection
setTimeout(() => {
  sendTranscriptLine(0);
}, 3000); // Increased from 1500ms
```

---

## 7. Debugging Strategy

### Step 1: Add Comprehensive Logging
Add logs at every step:
- Demo page: When sending transcript
- Ingest API: When receiving and broadcasting
- Realtime: When clients connect/disconnect
- AgentAssistPanel: When receiving events

### Step 2: Add Connection Health Check
```typescript
// Add endpoint to check SSE connection status
GET /api/debug/sse-status?callId=...
```

### Step 3: Add Event Queue
Buffer events if no clients connected, send when client connects.

### Step 4: Test Locally First
Verify all fixes work locally before deploying.

---

## 8. Deployment-Specific Considerations

### Render Platform
- Check Render logs for SSE connection errors
- Verify streaming is supported
- Check timeout settings
- Consider using Redis for client state (multi-instance)

### Next.js Streaming
- Verify `runtime = 'nodejs'` is set
- Check if streaming works on Render
- Consider fallback to polling if SSE fails

---

## 9. Success Criteria

- [ ] SSE connection established before first transcript sent
- [ ] All transcript lines received and displayed
- [ ] No false "disconnected" warnings
- [ ] Works consistently on deployed environment
- [ ] Connection auto-reconnects on failure

---

## 10. Next Steps

1. **Immediate:** Implement Fix 1 and Fix 2
2. **Short-term:** Add comprehensive logging
3. **Medium-term:** Add connection health monitoring
4. **Long-term:** Consider Redis-based client state for multi-instance

---

**Prepared by:** CTO Analysis  
**Review Status:** Ready for Implementation


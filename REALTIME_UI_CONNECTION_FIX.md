# 🎯 Real-Time UI Connection Fix

## Root Cause

The UI is defaulting to `test-call-123` when auto-discovery fails, causing a `callId` mismatch. Transcripts are published for the actual Exotel `interactionId`, but the UI is listening to `test-call-123`, so they never match.

## Solution

1. **Make auto-discovery more aggressive** (check every 2 seconds, include recently ended calls)
2. **Add fallback: global subscription** (if auto-discovery fails, listen to ALL transcripts and filter client-side)
3. **Add real-time connection status** in UI to show why transcripts aren't appearing
4. **Ensure call registry registration works** (verify the path fix is deployed)

## Implementation

### 1. Enhanced Auto-Discovery (app/test-agent-assist/page.tsx)

- Poll every 2 seconds (instead of 5)
- Include recently ended calls (within 60 seconds)
- Add fallback to global subscription if no calls found

### 2. Global Subscription Fallback (components/AgentAssistPanelV2.tsx)

- If `interactionId` is `test-call-123` and no calls are discovered, use global subscription
- Filter transcripts client-side by checking if they match any discovered `interactionId`
- Show connection status in UI

### 3. Better Error Messages

- Show "Waiting for call..." if no calls are registered
- Show "Connected to [interactionId]" when connected
- Show "No transcripts yet - waiting for audio..." during the 2-second buffering period



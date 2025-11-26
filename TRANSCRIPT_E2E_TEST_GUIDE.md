# Transcript E2E Test Guide - Phase 2

## Overview

This is a comprehensive end-to-end test that simulates the complete transcript pipeline to identify exactly where transcripts are getting lost.

## What It Tests

1. **SSE Connection**: Connects to `/api/events/stream` (simulating frontend)
2. **Ingest API**: Sends progressive transcripts via `/api/calls/ingest-transcript`
3. **Event Monitoring**: Tracks all SSE events received
4. **Pipeline Analysis**: Identifies where transcripts are lost

## Usage

### Basic Usage
```bash
npx tsx scripts/test-transcript-e2e-debug.ts
```

### With Specific CallId
```bash
npx tsx scripts/test-transcript-e2e-debug.ts test-call-123
```

### With Custom CallId (for testing with UI)
```bash
# In terminal 1: Run the test
npx tsx scripts/test-transcript-e2e-debug.ts my-test-call-456

# In browser: Open UI with same callId
# http://localhost:3000/test-agent-assist?callId=my-test-call-456
```

## What It Does

### Step 1: SSE Connection Test
- Connects to SSE endpoint
- Verifies connection is established
- Starts listening for events
- Reports connection status

### Step 2: Progressive Transcript Sending
- Sends 5 test transcripts with 1-second delays
- Each transcript includes:
  - `callId`: The test call ID
  - `seq`: Sequence number (1, 2, 3, 4, 5)
  - `text`: Transcript text with speaker prefix
  - `ts`: ISO timestamp
- Monitors ingest API responses
- Tracks successful/failed sends

### Step 3: Analysis & Diagnostics
- Compares transcripts sent vs events received
- Analyzes callId matching
- Checks text content validity
- Identifies filtering issues
- Provides detailed event log

## Output Interpretation

### ✅ Success Case
```
📊 Summary:
   Transcripts Sent: 5
   Transcript Events Received: 5
   
🎯 Verdict:
   ✅ SUCCESS: All transcripts should appear in UI!
```

### ❌ CallId Mismatch
```
📊 Summary:
   Transcripts Sent: 5
   Transcript Events Received: 0
   
🎯 Verdict:
   ❌ FAILURE: CallId mismatch detected!
   💡 Solution: Ensure UI connects with callId: "test-call-123"
```

### ⚠️ Partial Success
```
📊 Summary:
   Transcripts Sent: 5
   Transcript Events Received: 3
   
🎯 Verdict:
   ⚠️  PARTIAL: Some transcripts missing
   - 2 transcripts lost
```

## Detailed Event Log

For each event received, the script shows:
- **Type**: Event type (transcript_line, intent_update, etc.)
- **CallId**: Event callId vs expected callId (✅ or ❌)
- **Seq**: Sequence number
- **Text**: First 50 characters of text
- **Speaker**: Speaker information
- **Will appear in UI**: Final verdict (✅ YES or ❌ NO)

## Common Issues & Solutions

### Issue 1: No Events Received
**Symptoms**: `Transcript Events Received: 0`
**Possible Causes**:
- SSE connection not established
- Backend not broadcasting events
- Network issues

**Solution**: Check server logs for broadcast events

### Issue 2: CallId Mismatch
**Symptoms**: `Mismatched callId: 5` (all events)
**Possible Causes**:
- UI connected with different callId
- Backend using different callId format

**Solution**: Ensure UI uses exact same callId as test script

### Issue 3: Events Received But No Text
**Symptoms**: `Events without text: 5`
**Possible Causes**:
- Backend sending empty text
- Text being stripped during processing

**Solution**: Check backend logs for text content

### Issue 4: Partial Events
**Symptoms**: `Transcript Events Received: 3` (sent 5)
**Possible Causes**:
- Some transcripts failing to ingest
- Some events being filtered
- Timing issues

**Solution**: Check ingest API responses for failures

## Testing with UI

To test while UI is open:

1. **Start the test script**:
   ```bash
   npx tsx scripts/test-transcript-e2e-debug.ts my-test-call-789
   ```

2. **Open UI with same callId**:
   ```
   http://localhost:3000/test-agent-assist?callId=my-test-call-789
   ```

3. **Watch both**:
   - Script output (terminal) - Shows what's being sent/received
   - Browser console - Shows what frontend receives
   - UI - Shows if transcripts appear

4. **Compare**:
   - Script shows events received → Check if UI console shows same events
   - Script shows callId match → Check if UI filters them out
   - Script shows text content → Check if UI processes them correctly

## Expected Flow

```
1. Script connects to SSE → ✅ Connection established
2. Script sends transcript 1 → ✅ Ingest API accepts
3. Backend broadcasts event → ✅ Script receives event
4. Event has matching callId → ✅ Should appear in UI
5. Event has valid text → ✅ Should appear in UI
6. UI receives event → ✅ Should add to utterances
7. UI renders utterance → ✅ Should display in transcript panel
```

## Debugging Checklist

If transcripts don't appear in UI:

- [ ] Script shows events received with matching callId?
- [ ] Browser console shows `[AgentAssistPanel] 📥 Received transcript_line event`?
- [ ] Browser console shows `[AgentAssistPanel] ✅ Adding utterance`?
- [ ] Browser console shows `[AgentAssistPanel] ⚠️ CallId mismatch`?
- [ ] Browser console shows `[AgentAssistPanel] Skipping empty text`?
- [ ] UI shows "Stream disconnected" banner?
- [ ] `utterances` state has items (check React DevTools)?

## Next Steps After Test

Based on test results:

1. **If callId mismatch**: Fix callId synchronization
2. **If no events received**: Check backend broadcast logic
3. **If events filtered**: Check frontend filtering logic
4. **If events received but not rendered**: Check React state updates


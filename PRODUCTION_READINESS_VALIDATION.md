# Production Readiness Validation Guide

This document provides a step-by-step guide to validate that the agent copilot module is production-ready.

## Prerequisites

1. All three services running:
   - Ingest Service (port 8443)
   - ASR Worker (port 3001)
   - Frontend/Next.js (port 3000)

2. Environment variables configured:
   - `REDIS_URL`
   - `ELEVENLABS_API_KEY`
   - `GEMINI_API_KEY`
   - `SUPPORT_EXOTEL=true`
   - `ASR_PROVIDER=elevenlabs`
   - `LLM_PROVIDER=gemini`

3. Exotel configured to stream to ingest service

## Validation Steps

### Step 1: Run Production Readiness Test Script

```bash
npx tsx scripts/test-production-readiness.ts
```

**Expected Result:** All critical tests pass

### Step 2: Verify Auto-Discovery UI

1. Open frontend URL: `http://localhost:3000/live` (or production URL)
2. **Verify:** No manual call ID input field visible
3. **Verify:** Status shows "🔄 Auto-discovering active calls..."
4. **Verify:** UI automatically connects when Exotel call starts

**Success Criteria:**
- UI shows auto-discovery status
- No manual input required
- Automatically detects active calls

### Step 3: Test Exotel → Transcript Flow

1. Make a test call through Exotel
2. **Verify:** Ingest service logs show `[exotel] New Exotel WebSocket connection`
3. **Verify:** Ingest service logs show `[exotel] ✅ Call registered in call registry`
4. **Verify:** ASR Worker logs show audio frames being processed
5. **Verify:** Transcripts appear in UI within 2-3 seconds of speech

**Success Criteria:**
- Audio flows from Exotel to ASR Worker
- Transcripts generated and displayed in real-time
- No missing transcript chunks

### Step 4: Test Intent Detection & KB Surfacing

1. During active call, speak phrases like:
   - "I need to block my credit card"
   - "My debit card was stolen"
   - "I want to check my account balance"

2. **Verify:** Intent detected within 1-2 seconds
3. **Verify:** KB articles appear in UI panel
4. **Verify:** Articles are relevant to detected intent

**Success Criteria:**
- Intent detection works for common scenarios
- KB articles surface automatically
- Articles are relevant and clickable

### Step 5: Test Disposition Generation

1. Click "End Call & Generate Disposition" button
2. **Verify:** Disposition modal opens automatically
3. **Verify:** Suggested dispositions displayed with confidence scores
4. **Verify:** Sub-dispositions shown (if applicable)
5. **Verify:** Auto-notes pre-filled with summary

**Success Criteria:**
- Disposition generated within 30-45 seconds
- All disposition data visible
- Notes contain relevant information

### Step 6: Test Error Handling

1. **Test Service Restart:**
   - Restart ASR Worker during active call
   - **Verify:** Service reconnects and continues processing

2. **Test API Failures:**
   - Temporarily disable Gemini API key
   - **Verify:** System degrades gracefully (shows 'unknown' intent)
   - **Verify:** No crashes or errors

3. **Test Redis Disconnection:**
   - Restart Redis during active call
   - **Verify:** Services reconnect automatically
   - **Verify:** No data loss

**Success Criteria:**
- Services recover from failures
- No crashes or data loss
- User notified of issues

### Step 7: Performance Validation

1. **Latency Checks:**
   - Audio → Transcript: < 3 seconds
   - Transcript → Intent: < 2 seconds
   - Intent → KB: < 3 seconds
   - Call End → Disposition: < 45 seconds

2. **Throughput Checks:**
   - System handles 5+ concurrent calls
   - No degradation in latency

**Success Criteria:**
- All latencies within acceptable ranges
- System handles concurrent calls

## Troubleshooting

### Auto-Discovery Not Working

1. Check `/api/calls/active` endpoint:
   ```bash
   curl http://localhost:3000/api/calls/active?limit=10
   ```

2. Check call registry:
   - Verify Exotel calls are being registered
   - Check Redis for `call:metadata:*` keys

3. Check logs:
   - Ingest service: Look for `[exotel] ✅ Call registered in call registry`
   - Frontend: Check browser console for auto-discovery logs

### Transcripts Not Appearing

1. Check ASR Worker:
   - Verify ElevenLabs API key is set
   - Check ASR Worker logs for transcript generation

2. Check Transcript Consumer:
   - Verify consumer is running: `curl http://localhost:3000/api/transcripts/status`
   - Check logs for transcript processing

3. Check SSE Connection:
   - Open browser DevTools → Network → EventStream
   - Verify SSE connection is active
   - Check for transcript_line events

### Intent Detection Not Working

1. Check Gemini API:
   - Verify `GEMINI_API_KEY` is set
   - Check API quota/rate limits

2. Check logs:
   - Look for `[intent]` logs in frontend console
   - Verify API calls are being made

### Disposition Generation Failing

1. Check transcript availability:
   - Verify full transcript exists in database
   - Check `/api/calls/[interactionId]/transcript` endpoint

2. Check Gemini API:
   - Verify API key and quota
   - Check timeout settings (30s base, 45s retry)

3. Check logs:
   - Look for `[summary]` logs
   - Verify fallback summary is used if API fails

## Success Checklist

- [ ] All services start without errors
- [ ] Auto-discovery works (no manual call ID needed)
- [ ] Exotel calls flow through to transcripts
- [ ] Transcripts appear in UI in real-time
- [ ] Intent detection works for common scenarios
- [ ] KB articles surface automatically
- [ ] Disposition generation completes on call end
- [ ] Error handling prevents crashes
- [ ] Performance within acceptable ranges
- [ ] System handles concurrent calls

## Next Steps After Validation

1. Deploy to production environment
2. Monitor logs for first few calls
3. Verify production metrics match test results
4. Set up alerts for critical failures
5. Document any production-specific configurations


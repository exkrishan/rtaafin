# ElevenLabs Implementation - Quick Debug Checklist

## 🎯 Main Problem
**Transcripts are being generated but NOT appearing in the UI**

## 🔍 Root Cause
**Call ID Mismatch:**
- UI is connected to: `3c441df482db99f5cf9180765a8919be`
- Transcripts are for: `8fa998d80c08e7c31a271e05cfae19bd`
- Result: SSE broadcast shows `recipients: 0` (no clients listening)

---

## ✅ Quick Checks (5 minutes)

### 1. Check ASR Worker is Processing
```bash
# Check health
curl https://rtaa-asr-worker.onrender.com/health

# Look for in logs:
[ElevenLabsProvider] ✅ WebSocket connected
[ASRWorker] Published partial transcript { interaction_id: '...', text: '...' }
```

### 2. Check Transcript Consumer is Running
```bash
# Check status
curl https://frontend-8jdd.onrender.com/api/transcripts/status

# Look for in logs:
[TranscriptConsumer] ✅ Forwarded transcript successfully
```

### 3. Check Call ID Matching
```bash
# Get active calls
curl https://frontend-8jdd.onrender.com/api/calls/active

# Compare:
# - UI callId (from auto-discovery dropdown)
# - Transcript interaction_id (from ASR Worker logs)
# - Broadcast callId (from realtime logs)
```

### 4. Check SSE Connection
```bash
# In browser console, check:
[AgentAssistPanel] ✅ SSE connection opened { interactionId: '...' }

# In server logs, check:
[realtime] 📡 Broadcast event { callId: '...', recipients: X }
```

**If `recipients: 0`, the callIds don't match!**

---

## 🐛 Common Issues

### Issue 1: Empty Transcripts
**Symptom:** `[TranscriptConsumer] ⚠️ Skipping transcript with EMPTY text`

**Cause:** Silence detection or audio quality issues

**Fix:** Already applied - lowered thresholds to 10/10 for 8kHz audio

### Issue 2: Call ID Mismatch
**Symptom:** `recipients: 0` in broadcast logs

**Cause:** UI connected to different callId than transcripts

**Fix:** Ensure UI uses same ID as ASR Worker publishes

### Issue 3: SSE Connection Churn
**Symptom:** Connections closing/reopening frequently

**Cause:** useEffect dependencies causing recreation

**Fix:** Already applied - reduced dependencies

---

## 📋 What Was Implemented

1. ✅ ElevenLabs WebSocket integration
2. ✅ Silence detection for 8kHz telephony audio
3. ✅ Audio amplification for quiet audio
4. ✅ Transcript Consumer auto-discovery
5. ✅ SSE broadcasting infrastructure
6. ✅ Auto-discovery UI with call filtering

---

## 🔧 Key Files

- `services/asr-worker/src/providers/elevenlabsProvider.ts` - ElevenLabs integration
- `lib/transcript-consumer.ts` - Transcript forwarding
- `app/api/calls/ingest-transcript/route.ts` - Ingest & broadcast
- `components/AgentAssistPanelV2.tsx` - UI component
- `app/api/calls/active/route.ts` - Auto-discovery

---

## 🎯 Next Steps

1. **Verify call ID mapping** - Check how Exotel `call_sid` maps to `interaction_id`
2. **Check transcript generation** - Verify ElevenLabs is returning text
3. **Verify end-to-end flow** - Trace one transcript from ASR Worker to UI
4. **Fix call ID mismatch** - Ensure UI uses correct ID

---

## 📞 Quick Links

- **Full Documentation:** `ELEVENLABS_IMPLEMENTATION_SUMMARY.md`
- **ASR Worker:** https://rtaa-asr-worker.onrender.com/health
- **Frontend:** https://frontend-8jdd.onrender.com/test-agent-assist
- **Status API:** https://frontend-8jdd.onrender.com/api/transcripts/status


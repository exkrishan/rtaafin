# Sample Rate Optimization - Implementation Summary

**Date:** 2025-11-13  
**Based on:** Analysis showing 16kHz provides better transcription quality than 8kHz

---

## Key Insight

**8kHz vs 16kHz for Transcription:**
- **8kHz**: Standard for telephony, captures up to 4kHz (Nyquist frequency)
- **16kHz**: Recommended by ElevenLabs, captures up to 8kHz (better speech clarity)
- **Impact**: 16kHz provides better transcription accuracy, especially for higher frequency speech components

---

## Changes Implemented

### 1. ✅ Telephony-Specific Validation Thresholds

**File:** `services/asr-worker/src/providers/elevenlabsProvider.ts`

**Changes:**
- Lower silence threshold for 8kHz: `50` (was `100`)
- Lower amplitude threshold for 8kHz: `500` (was `1000`)
- Standard thresholds for 16kHz: `100` energy, `1000` amplitude

**Why:**
- 8kHz telephony audio typically has lower energy than 16kHz
- Prevents false silence detection for valid 8kHz audio
- Better accuracy for telephony audio quality assessment

**Code:**
```typescript
const SILENCE_THRESHOLD_8KHZ = 50;  // Lower threshold for 8kHz telephony
const SILENCE_THRESHOLD_16KHZ = 100; // Standard threshold for 16kHz
const MIN_AMPLITUDE_8KHZ = 500;     // Lower amplitude for 8kHz
const MIN_AMPLITUDE_16KHZ = 1000;   // Standard amplitude for 16kHz
```

---

### 2. ✅ Flexible Sample Rate Support

**File:** `services/asr-worker/src/index.ts`

**Changes:**
- Accepts both 8kHz and 16kHz from Exotel
- Configurable preferred sample rate via `ELEVENLABS_PREFERRED_SAMPLE_RATE` env var
- Defaults to 8kHz for telephony compatibility
- Logs helpful messages about sample rate choices

**Configuration:**
```bash
# Default (8kHz for telephony compatibility)
# No env var needed

# For better transcription quality (16kHz)
ELEVENLABS_PREFERRED_SAMPLE_RATE=16000
```

**Behavior:**
- If Exotel sends 16kHz → Uses 16kHz (optimal)
- If Exotel sends 8kHz → Uses 8kHz (compatible)
- If missing/invalid → Uses preferred rate (default 8kHz)

---

### 3. ✅ Ingest Service Sample Rate Handling

**Files:** 
- `services/ingest/src/exotel-handler.ts`
- `services/ingest/src/server.ts`

**Changes:**
- Accepts 8kHz, 16kHz, and 24kHz from Exotel
- Converts 24kHz → 16kHz (ElevenLabs max)
- No longer forces 8kHz - accepts what Exotel sends
- Logs informative messages about sample rate choices

**Behavior:**
- **8kHz from Exotel**: Accepted, logged as "telephony standard"
- **16kHz from Exotel**: Accepted, logged as "optimal for transcription"
- **24kHz from Exotel**: Converted to 16kHz, logged with conversion note
- **Invalid rate**: Defaults to 8kHz with warning

---

## Configuration Guide

### Option 1: Use 8kHz (Current Default - Telephony Compatible)

**No configuration needed** - works with standard telephony

**Pros:**
- ✅ Compatible with all telephony systems
- ✅ Lower bandwidth usage
- ✅ Standard for PSTN

**Cons:**
- ⚠️ Lower transcription quality
- ⚠️ May miss higher frequency speech components

---

### Option 2: Use 16kHz (Recommended - Better Quality)

**Set environment variable:**
```bash
ELEVENLABS_PREFERRED_SAMPLE_RATE=16000
```

**Configure Exotel to send 16kHz:**
```
wss://your-domain.com/v1/ingest?sample-rate=16000
```

**Pros:**
- ✅ Better transcription quality
- ✅ Captures more speech frequencies
- ✅ Recommended by ElevenLabs

**Cons:**
- ⚠️ Requires Exotel configuration
- ⚠️ Higher bandwidth usage
- ⚠️ May not be supported by all telephony systems

---

## Testing Recommendations

### Test 1: Current Setup (8kHz)
1. **No changes needed** - current default
2. **Monitor logs** for:
   - `[exotel] ℹ️ Exotel sent 8kHz audio (telephony standard)`
   - `[ElevenLabsProvider] 📊 Audio quality metrics` - check energy/amplitude
   - Empty transcript warnings with troubleshooting info

### Test 2: Upgrade to 16kHz
1. **Configure Exotel** to send 16kHz:
   ```
   wss://your-domain.com/v1/ingest?sample-rate=16000
   ```
2. **Set environment variable** (optional, for fallback):
   ```bash
   ELEVENLABS_PREFERRED_SAMPLE_RATE=16000
   ```
3. **Monitor logs** for:
   - `[exotel] ✅ Exotel sent 16kHz audio (optimal for transcription quality)`
   - Better transcription accuracy
   - Higher audio energy/amplitude values

### Test 3: Compare Results
1. **Run same call** with 8kHz and 16kHz
2. **Compare:**
   - Transcription accuracy
   - Empty transcript rate
   - Audio quality metrics
   - Latency

---

## Expected Improvements

### With 8kHz (Current):
- ✅ Works with standard telephony
- ✅ Lower bandwidth
- ⚠️ May have lower transcription quality
- ⚠️ More empty transcripts possible

### With 16kHz (Recommended):
- ✅ Better transcription quality
- ✅ Fewer empty transcripts
- ✅ Better speech clarity
- ⚠️ Requires Exotel configuration

---

## Migration Path

### Phase 1: Current (8kHz)
- ✅ Already implemented
- ✅ Works with standard telephony
- ✅ Telephony-specific thresholds applied

### Phase 2: Test 16kHz
1. Configure Exotel to send 16kHz
2. Monitor transcription quality
3. Compare with 8kHz results

### Phase 3: Production Decision
- **If 16kHz is better**: Keep it, update Exotel config
- **If 8kHz is sufficient**: Keep current setup
- **If mixed**: Support both based on use case

---

## Monitoring

### Key Metrics to Track:

1. **Sample Rate Distribution:**
   - Logs show which rate Exotel sends
   - Track: 8kHz vs 16kHz usage

2. **Transcription Quality:**
   - Empty transcript rate by sample rate
   - Accuracy comparison (if possible)

3. **Audio Quality Metrics:**
   - Energy levels (should be higher for 16kHz)
   - Amplitude levels
   - Silence detection accuracy

4. **Performance:**
   - Latency differences
   - Bandwidth usage
   - Connection stability

---

## Troubleshooting

### Issue: Still getting empty transcripts with 8kHz

**Check:**
1. Audio quality metrics in logs
2. Silence detection warnings
3. Energy/amplitude values
4. Consider upgrading to 16kHz

### Issue: Exotel not sending 16kHz

**Solution:**
1. Verify Exotel WebSocket URL includes `?sample-rate=16000`
2. Check Exotel dashboard configuration
3. Verify Exotel account supports 16kHz

### Issue: Want to test 16kHz but can't configure Exotel

**Solution:**
1. Use `ELEVENLABS_PREFERRED_SAMPLE_RATE=16000` for fallback
2. Note: This only applies if Exotel sends invalid/missing rate
3. Best to configure Exotel to send 16kHz directly

---

## Summary

**What Changed:**
- ✅ Telephony-specific validation thresholds (8kHz vs 16kHz)
- ✅ Flexible sample rate support (accepts both 8kHz and 16kHz)
- ✅ Configuration option for preferred sample rate
- ✅ Better logging and diagnostics

**Recommendation:**
- **Short-term**: Keep 8kHz, monitor with new validation
- **Long-term**: Test and migrate to 16kHz for better quality
- **Best practice**: Support both, let Exotel send what it can

**Next Steps:**
1. Deploy current changes
2. Monitor logs for sample rate distribution
3. Test with 16kHz if possible
4. Compare transcription quality
5. Make production decision


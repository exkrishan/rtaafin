# 📚 ASR Chunking Learnings from Exotel Streaming

## The Problem

After running a 2+ minute call through Exotel streaming:
- **700+ audio chunks** stored in Google Cloud Storage
- Each chunk: **~1 second**, containing only **single sounds** ("Hi", "hello")
- **No complete sentences** in individual chunks
- Chunks are too small for meaningful transcription analysis

---

## Root Cause Analysis

### 1. Exotel Sends Small Chunks
- Exotel sends audio in **~20ms chunks** (very small)
- Each chunk contains minimal audio data
- These are the raw chunks from Exotel's streaming protocol

### 2. Ingest Service Dumps Raw Chunks
- **Current behavior:** Ingest service dumps each Exotel chunk individually
- Result: 700+ tiny files in GCS
- **Problem:** These are NOT the chunks sent to ASR providers

### 3. ASR Worker Buffers Chunks
- **ASR worker** receives these small chunks
- **Buffers them** into larger chunks (500ms for ElevenLabs)
- **Sends buffered chunks** to ElevenLabs for transcription
- **Key insight:** The buffered chunks are what actually get transcribed!

---

## Key Learnings

### Learning 1: Individual Small Chunks Are Not Useful for ASR

**Problem:**
- 1-second chunks with single sounds don't represent what ASR sees
- ASR providers (ElevenLabs) need **at least 500ms** of audio for reliable transcription
- Smaller chunks increase latency and reduce accuracy

**Solution:**
- Dump the **buffered chunks** that ASR worker sends to providers
- These are the chunks that actually produce transcripts

### Learning 2: Dumping Happens at Wrong Stage

**Current Flow:**
```
Exotel → Ingest Service → [DUMP HERE - WRONG!] → ASR Worker → [BUFFER] → ElevenLabs
```

**Problem:**
- Dumping raw Exotel chunks shows what Exotel sends, not what ASR receives
- The buffering happens AFTER dumping
- We're not seeing the actual audio that gets transcribed

**Solution:**
```
Exotel → Ingest Service → ASR Worker → [BUFFER] → [DUMP HERE - CORRECT!] → ElevenLabs
```

### Learning 3: Chunk Size Mismatch

| Stage | Chunk Size | Purpose |
|-------|-----------|---------|
| Exotel sends | ~20ms | Raw streaming chunks |
| Ingest dumps | ~20ms | Raw chunks (not useful) |
| ASR buffers | 500ms | Optimal for ElevenLabs |
| ASR sends | 500ms | What actually gets transcribed |

**Key Insight:** The 500ms buffered chunks are what matter for transcription quality.

---

## The Solution: Dump from ASR Worker

### What We Implemented:

1. **Added audio dumping to ASR worker**
   - Dumps buffered chunks BEFORE sending to ElevenLabs
   - These are the chunks that actually get transcribed

2. **File naming includes duration**
   - `buffered-chunk-000001-500ms.wav`
   - Shows exactly how much audio is in each chunk

3. **Separate GCS path**
   - `asr-buffered-chunks/` vs `audio-dumps/`
   - Easy to distinguish buffered vs raw chunks

### Benefits:

✅ **Fewer files:** ~120 files for 2-minute call (vs 700+)  
✅ **Complete audio:** 500ms chunks contain full words/phrases  
✅ **Accurate representation:** Shows what ElevenLabs actually receives  
✅ **Better debugging:** Can correlate chunks with transcripts  

---

## Configuration

### ASR Worker Environment Variables:

```bash
# Enable dumping buffered chunks
ASR_AUDIO_DUMP_ENABLED=true

# GCS configuration (same as ingest service)
GCS_ENABLED=true
GCS_BUCKET_NAME=audiodumps
GOOGLE_APPLICATION_CREDENTIALS_JSON={...your JSON...}
```

### Optional: Disable Ingest Service Dumping

If you only want to see buffered chunks:

```bash
# In ingest service
AUDIO_DUMP_ENABLED=false  # Disable raw chunk dumping
```

---

## File Comparison

### Before (Ingest Service):
```
gs://audiodumps/audio-dumps/{id}/chunk-000001.wav  (20ms - "Hi")
gs://audiodumps/audio-dumps/{id}/chunk-000002.wav  (20ms - "hello")
... 700+ files
```

### After (ASR Worker):
```
gs://audiodumps/asr-buffered-chunks/{id}/buffered-chunk-000001-500ms.wav  (500ms - "Hi hello how are")
gs://audiodumps/asr-buffered-chunks/{id}/buffered-chunk-000002-500ms.wav  (500ms - "you today I'm")
... ~120 files
```

---

## Best Practices

1. **Use ASR worker dumps** for understanding transcription
   - These show what ASR providers actually receive
   - Better for debugging transcription issues

2. **Keep ingest service dumps** only if needed
   - Useful for debugging Exotel streaming issues
   - Not useful for understanding ASR transcription

3. **Monitor chunk duration**
   - ElevenLabs optimal: 500ms
   - Too small (< 250ms): Poor transcription quality
   - Too large (> 1000ms): Higher latency

4. **Correlate with transcripts**
   - Match buffered chunk files with transcript segments
   - Helps understand what audio produced which transcript

---

## Next Steps

1. **Deploy ASR worker** with dumping enabled
2. **Make test calls** and check `asr-buffered-chunks/` in GCS
3. **Compare** buffered chunks with transcripts
4. **Analyze** if chunk size needs adjustment for better transcription

---

## Summary

**The Problem:** Dumping raw Exotel chunks (20ms) doesn't represent what ASR sees (500ms buffered chunks).

**The Solution:** Dump buffered chunks from ASR worker - these are what actually get transcribed.

**The Result:** Fewer files, complete audio segments, accurate representation of ASR input.


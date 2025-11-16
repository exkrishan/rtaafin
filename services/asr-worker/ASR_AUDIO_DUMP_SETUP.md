# 🎯 ASR Worker Audio Dump Setup

## Overview

The ASR worker now dumps **buffered audio chunks** that are actually sent to ASR providers (ElevenLabs, Deepgram, etc.). These are the chunks that produce transcripts, not the raw incoming chunks.

## Why This Matters

### The Problem:
- **Ingest service** dumps raw Exotel chunks (~20ms each) → 700+ tiny files
- **ASR worker** buffers these into 500ms chunks before sending to ElevenLabs
- **Result:** You see tiny files in GCS, but ASR gets properly buffered audio

### The Solution:
- **ASR worker** now dumps the **buffered chunks** (500ms for ElevenLabs)
- These are the actual chunks that get transcribed
- Much fewer files, complete audio segments with full words/phrases

---

## File Structure

### Ingest Service Dumps (Raw):
```
gs://audiodumps/audio-dumps/{interaction_id}/chunk-000001.wav  (20ms - raw Exotel chunk)
gs://audiodumps/audio-dumps/{interaction_id}/chunk-000002.wav  (20ms - raw Exotel chunk)
... 700+ files
```

### ASR Worker Dumps (Buffered):
```
gs://audiodumps/asr-buffered-chunks/{interaction_id}/buffered-chunk-000001-500ms.wav  (500ms - buffered chunk sent to ElevenLabs)
gs://audiodumps/asr-buffered-chunks/{interaction_id}/buffered-chunk-000002-500ms.wav  (500ms - buffered chunk sent to ElevenLabs)
... ~120 files for 2-minute call (much fewer!)
```

---

## Environment Variables

### For ASR Worker:

| Variable | Value | Description |
|----------|-------|-------------|
| `ASR_AUDIO_DUMP_ENABLED` | `true` | Enable dumping buffered chunks |
| `ASR_AUDIO_DUMP_DIR` | `./asr-audio-dumps` | Local directory (optional) |
| `ASR_AUDIO_DUMP_FORMAT` | `wav` | Format: `wav` or `raw` |
| `GCS_ENABLED` | `true` | Enable GCS uploads |
| `GCS_BUCKET_NAME` | `audiodumps` | Your GCS bucket name |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | `{...}` | Service account JSON |

---

## Setup Steps

1. **Add environment variables to ASR Worker** (in Render or local `.env.local`):
   ```
   ASR_AUDIO_DUMP_ENABLED=true
   GCS_ENABLED=true
   GCS_BUCKET_NAME=audiodumps
   GOOGLE_APPLICATION_CREDENTIALS_JSON={...your JSON...}
   ```

2. **Deploy ASR Worker**

3. **Make a test call**

4. **Check GCS bucket:**
   - Path: `gs://audiodumps/asr-buffered-chunks/{interaction_id}/`
   - Files: `buffered-chunk-XXXXXX-500ms.wav`
   - These are the chunks sent to ElevenLabs!

---

## What You'll See

### Before (Ingest Service Dumps):
- 700+ files for 2-minute call
- Each file: ~1 second, single sound ("Hi", "hello")
- Not useful for understanding transcription

### After (ASR Worker Dumps):
- ~120 files for 2-minute call (much fewer!)
- Each file: 500ms, complete words/phrases
- **These are the exact chunks that ElevenLabs transcribes**

---

## File Naming

Files are named: `buffered-chunk-{seq}-{duration}ms.wav`

Example:
- `buffered-chunk-000001-500ms.wav` - First buffered chunk, 500ms duration
- `buffered-chunk-000002-500ms.wav` - Second buffered chunk, 500ms duration

The duration in the filename shows how much audio is in each chunk.

---

## Comparison

| Aspect | Ingest Service Dumps | ASR Worker Dumps |
|--------|---------------------|------------------|
| **Source** | Raw Exotel chunks | Buffered chunks sent to ASR |
| **Chunk Size** | ~20ms (raw) | 500ms (buffered for ElevenLabs) |
| **Files per 2min call** | ~700+ | ~120 |
| **Content** | Single sounds | Complete words/phrases |
| **Useful for** | Debugging Exotel stream | Understanding ASR transcription |
| **Location** | `audio-dumps/` | `asr-buffered-chunks/` |

---

## Recommendation

**Use ASR Worker dumps** to understand what ElevenLabs actually receives and transcribes. The ingest service dumps are too granular and not representative of the transcription process.

---

## Troubleshooting

### No files appearing:
- Check `ASR_AUDIO_DUMP_ENABLED=true` is set
- Check `GCS_ENABLED=true` and `GCS_BUCKET_NAME` is set
- Check ASR worker logs for `[asr-audio-dumper]` messages

### Files still too small:
- Check ASR worker logs for actual chunk duration
- Verify `MIN_CHUNK_DURATION_MS` is 500ms for ElevenLabs
- Buffered chunks should be 500ms for optimal ElevenLabs performance


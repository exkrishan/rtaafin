# Audio Dump Configuration Guide

This guide explains how to configure the ingest service to dump audio chunks received from Exotel to files for debugging and analysis.

## Overview

The audio dumper utility saves audio chunks received from Exotel to files, organized by interaction/call ID. This is useful for:
- Debugging audio quality issues
- Analyzing transcription accuracy
- Testing audio processing pipelines
- Verifying audio format and sample rates

## Configuration

### Environment Variables

Add these environment variables to enable audio dumping:

```bash
# Enable audio dumping (required)
AUDIO_DUMP_ENABLED=true

# Directory to save audio files (optional, default: ./audio-dumps)
AUDIO_DUMP_DIR=./audio-dumps

# Format to save: 'wav' or 'raw' (optional, default: 'wav')
AUDIO_DUMP_FORMAT=wav
```

### Format Options

- **`wav`** (default): Saves as WAV files with proper headers. Files can be played directly in audio players.
- **`raw`**: Saves as raw PCM16 files. Requires audio tools to play (e.g., `ffplay`, `sox`).

## File Structure

Audio files are organized by interaction/call ID:

```
audio-dumps/
├── call_abc123/
│   ├── chunk-000001.wav
│   ├── chunk-000002.wav
│   ├── chunk-000003.wav
│   └── ...
├── call_xyz789/
│   ├── chunk-000001.wav
│   └── ...
└── ...
```

### Individual Chunks

Each audio chunk is saved as a separate file:
- **Format**: `chunk-{seq}.wav` or `chunk-{seq}.pcm`
- **Sequence**: Zero-padded 6-digit sequence number
- **Example**: `chunk-000001.wav`, `chunk-000042.wav`
- **Location**: `{AUDIO_DUMP_DIR}/{interaction_id}/chunk-{seq}.wav`

### Where to Find Dumps

**Default Location**: `./audio-dumps/` (relative to where the ingest service is running)

**Full Path Examples**:
- Local development: `/Users/kirti.krishnan/Desktop/Projects/rtaafin/services/ingest/audio-dumps/`
- Docker: `/app/audio-dumps/` (if mounted)
- Render: `/tmp/audio-dumps/` (ephemeral, lost on restart)

**To find your dumps**:
1. Check the `AUDIO_DUMP_DIR` environment variable value
2. Look for logs: `[audio-dumper] 💾 Dumped audio chunk` - shows `file_path`
3. Default is `./audio-dumps/` relative to the service working directory

## Usage Examples

### Local Development

```bash
cd services/ingest
AUDIO_DUMP_ENABLED=true \
AUDIO_DUMP_DIR=./audio-dumps \
AUDIO_DUMP_FORMAT=wav \
npm run dev
```

### Docker Compose

Add to `docker-compose.yml`:

```yaml
services:
  ingest:
    environment:
      - AUDIO_DUMP_ENABLED=true
      - AUDIO_DUMP_DIR=/app/audio-dumps
      - AUDIO_DUMP_FORMAT=wav
    volumes:
      - ./audio-dumps:/app/audio-dumps
```

### Render Deployment

Add environment variables in Render Dashboard:

1. Go to your Ingest Service
2. Navigate to **Environment** tab
3. Add:
   - `AUDIO_DUMP_ENABLED=true`
   - `AUDIO_DUMP_DIR=/tmp/audio-dumps` (or persistent volume path)
   - `AUDIO_DUMP_FORMAT=wav`

**Note**: Render's filesystem is ephemeral. Files will be lost on restart unless you use a persistent volume.

## Playing Audio Files

### WAV Files

WAV files can be played directly:

```bash
# macOS
afplay audio-dumps/call_abc123/chunk-000001.wav

# Linux
aplay audio-dumps/call_abc123/chunk-000001.wav

# Using ffplay
ffplay audio-dumps/call_abc123/chunk-000001.wav

# Using VLC
vlc audio-dumps/call_abc123/chunk-000001.wav
```

### Raw PCM16 Files

Raw PCM files require format specification:

```bash
# Using ffplay (specify format)
ffplay -f s16le -ar 8000 -ac 1 audio-dumps/call_abc123/chunk-000001.pcm

# Using sox
sox -r 8000 -c 1 -e signed-integer -b 16 audio-dumps/call_abc123/chunk-000001.pcm output.wav
```

### Playing Multiple Chunks

To play all chunks in sequence, you can use:

```bash
# List all chunks for a call
ls -1 audio-dumps/call_abc123/chunk-*.wav | sort

# Play chunks in sequence (macOS)
for file in audio-dumps/call_abc123/chunk-*.wav; do afplay "$file"; done

# Or combine manually with ffmpeg
ffmpeg -i "concat:$(ls -1 audio-dumps/call_abc123/chunk-*.wav | tr '\n' '|')" output.wav
```

## Logging

When audio dumping is enabled, you'll see logs like:

```
[audio-dumper] Audio dumping enabled { dump_dir: './audio-dumps', format: 'wav' }
[audio-dumper] 💾 Dumped audio chunk {
  interaction_id: 'call_abc123',
  seq: 1,
  file_path: './audio-dumps/call_abc123/chunk-000001.wav',
  size_bytes: 320,
  sample_rate: 8000,
  format: 'wav',
  duration_ms: 20
}
```

Logs are rate-limited:
- First 3 chunks: Always logged
- Every 100th chunk: Logged
- Other chunks: Silent (to reduce noise)

## Performance Considerations

- **Disk Space**: Audio dumps can consume significant disk space. Monitor `AUDIO_DUMP_DIR`.
- **I/O Impact**: File writes are asynchronous and non-blocking. Minimal impact on processing.
- **Error Handling**: Dump failures are non-critical and won't affect audio processing.

## Troubleshooting

### No Files Created

1. **Check environment variable**: `AUDIO_DUMP_ENABLED=true` must be set
2. **Check directory permissions**: Ensure write permissions for `AUDIO_DUMP_DIR`
3. **Check logs**: Look for `[audio-dumper]` messages

### Files Are Empty

- This is normal for silence chunks
- Check if audio is actually being received from Exotel
- Verify sample rate matches expected format

### Finding Dump Location

- Check logs for `[audio-dumper] 💾 Dumped audio chunk` - shows `file_path`
- Default location: `./audio-dumps/` relative to service working directory
- Verify `AUDIO_DUMP_DIR` environment variable is set correctly
- Check directory permissions: ensure write access

### Cannot Play WAV Files

- Verify WAV header is correct (should be 44 bytes)
- Check sample rate matches audio player expectations
- Try converting with `ffmpeg`:
  ```bash
  ffmpeg -i chunk-000001.wav -ar 8000 -ac 1 output.wav
  ```

## Best Practices

1. **Use WAV format** for easier playback and debugging
2. **Monitor disk space** - audio files can grow large
3. **Clean up old files** periodically
4. **Disable in production** unless needed for debugging
5. **Use persistent volumes** in cloud deployments

## Disabling Audio Dumping

To disable audio dumping, simply remove or set:

```bash
AUDIO_DUMP_ENABLED=false
# or
unset AUDIO_DUMP_ENABLED
```

When disabled, the audio dumper has zero overhead and won't create any files.


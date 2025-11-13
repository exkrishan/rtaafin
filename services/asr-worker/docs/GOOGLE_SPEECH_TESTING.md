# Google Cloud Speech-to-Text Testing Guide

## Overview

This guide covers testing Google Cloud Speech-to-Text integration locally without deploying the entire application.

## Prerequisites

1. **Google Cloud Setup**: Follow [GOOGLE_SPEECH_SETUP.md](./GOOGLE_SPEECH_SETUP.md) to set up authentication
2. **Service Account Key**: Download JSON key file from Google Cloud Console
3. **Node.js**: Ensure Node.js is installed (v18+)
4. **Dependencies**: Run `npm install` in `services/asr-worker`

## Testing Methods

### Method 1: Standalone Test Script

Tests the GoogleSpeechProvider directly without Redis/pubsub dependencies.

**Usage:**
```bash
cd services/asr-worker

# With generated test audio
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
ASR_PROVIDER=google \
npx ts-node scripts/test-google-speech-local.ts

# With audio file (PCM16 WAV format)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
ASR_PROVIDER=google \
npx ts-node scripts/test-google-speech-local.ts /path/to/audio.wav
```

**What it does:**
- Creates GoogleSpeechProvider instance
- Sends audio chunks (simulated real-time streaming)
- Displays transcripts in real-time
- Shows test summary with metrics

**Expected output:**
```
🎤 Testing Google Cloud Speech-to-Text with generated test audio
📊 Generating test audio: { duration: '3000ms', sampleRate: '8000 Hz', frequency: '440 Hz' }
🚀 Starting transcription...

📤 Sending chunk 1 (250ms, 4000 bytes)...
📝 [PARTIAL] hello world
   Confidence: 0.95
📤 Sending chunk 2 (250ms, 4000 bytes)...
📝 [FINAL] hello world
   Confidence: 0.98

📊 Test Summary
Total chunks sent: 12
Total transcripts received: 12
Final transcripts: 1
Partial transcripts: 11
```

### Method 2: Integration Test Script

Tests GoogleSpeechProvider within ASR worker context, simulating Redis stream messages.

**Usage:**
```bash
cd services/asr-worker

# With generated test audio
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
ASR_PROVIDER=google \
npx ts-node scripts/test-google-speech-integration.ts

# With audio file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
ASR_PROVIDER=google \
npx ts-node scripts/test-google-speech-integration.ts /path/to/audio.wav
```

**What it does:**
- Simulates audio frame messages (like from Redis)
- Processes audio through provider
- Simulates transcript publishing
- Verifies end-to-end flow

### Method 3: Full ASR Worker Test

Test with actual ASR worker (requires Redis).

**Setup:**
1. Start Redis: `docker-compose up -d redis` (if using docker-compose)
2. Set environment variables:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
   export ASR_PROVIDER=google
   export REDIS_URL=redis://localhost:6379
   export PUBSUB_ADAPTER=redis
   ```
3. Start ASR worker: `npm run dev`
4. Publish audio frames to Redis stream (using your test client)

## Audio Format Requirements

### Supported Formats
- **Encoding**: LINEAR16 (PCM16)
- **Sample Rates**: 8000 Hz, 16000 Hz, 44100 Hz, 48000 Hz
- **Channels**: Mono (1 channel)
- **Byte Order**: Little-endian

### Creating Test Audio Files

**Using ffmpeg:**
```bash
# Convert any audio to PCM16 WAV (8kHz mono)
ffmpeg -i input.mp3 -ar 8000 -ac 1 -f s16le -acodec pcm_s16le output.wav

# Record from microphone (8kHz mono)
ffmpeg -f alsa -i default -ar 8000 -ac 1 -f s16le -acodec pcm_s16le recording.wav
```

**Using sox:**
```bash
# Convert to PCM16 WAV (8kHz mono)
sox input.mp3 -r 8000 -c 1 -b 16 -e signed-integer output.wav
```

## Troubleshooting

### Authentication Errors

**Error:** `Could not load the default credentials`

**Solutions:**
1. Verify `GOOGLE_APPLICATION_CREDENTIALS` path is correct
2. Check file permissions: `chmod 600 /path/to/key.json`
3. Verify JSON key file is valid: `cat /path/to/key.json | jq .`
4. Try absolute path instead of relative path

### API Not Enabled

**Error:** `API not enabled`

**Solution:**
1. Go to Google Cloud Console
2. APIs & Services > Library
3. Enable "Cloud Speech-to-Text API"

### No Transcripts Received

**Possible causes:**
1. **Silent audio**: Test audio may be too quiet or silent
2. **Wrong sample rate**: Audio sample rate doesn't match configuration
3. **Format mismatch**: Audio is not PCM16 format
4. **Network issues**: Check internet connection
5. **Quota exceeded**: Check Google Cloud Console for quota limits

**Debug steps:**
1. Check audio file format: `file audio.wav`
2. Verify audio has content: `ffmpeg -i audio.wav -af "volumedetect" -f null -`
3. Check provider logs for errors
4. Test with a known good audio file

### High Latency

**Possible causes:**
1. **Network latency**: Google API servers may be far away
2. **Large chunks**: Sending too large chunks can delay processing
3. **Stream restart**: Stream restarts every 4.5 minutes (normal)

**Solutions:**
1. Use appropriate chunk size (250ms recommended)
2. Check network latency to Google Cloud
3. Monitor metrics in test output

## Performance Testing

### Latency Comparison

Compare Google Speech-to-Text with other providers:

```bash
# Test with Deepgram
ASR_PROVIDER=deepgram DEEPGRAM_API_KEY=xxx npx ts-node scripts/test-google-speech-local.ts

# Test with Google
ASR_PROVIDER=google GOOGLE_APPLICATION_CREDENTIALS=xxx npx ts-node scripts/test-google-speech-local.ts
```

### Metrics to Monitor

- **First partial latency**: Time to first transcript
- **Final transcript latency**: Time to final transcript
- **Empty transcript rate**: Percentage of empty transcripts
- **Error rate**: Percentage of failed requests
- **Stream restarts**: Number of stream restarts (should be 0 for short tests)

## Best Practices

1. **Use appropriate chunk size**: 250ms chunks work well for most cases
2. **Handle empty transcripts**: Some chunks may not produce transcripts (normal)
3. **Monitor stream duration**: Streams auto-restart at 4.5 minutes
4. **Test with real audio**: Use actual speech audio, not just test tones
5. **Check quotas**: Monitor Google Cloud Console for usage and limits

## Next Steps

After successful local testing:

1. **Deploy to staging**: Test in staging environment
2. **Monitor production**: Set up monitoring and alerts
3. **Compare providers**: Test Deepgram vs Google for your use case
4. **Optimize settings**: Adjust model, language, and chunk size based on results

## References

- [Setup Guide](./GOOGLE_SPEECH_SETUP.md)
- [API Reference](./GOOGLE_SPEECH_API_REFERENCE.md)
- [Google Cloud Speech-to-Text Docs](https://cloud.google.com/speech-to-text/docs)




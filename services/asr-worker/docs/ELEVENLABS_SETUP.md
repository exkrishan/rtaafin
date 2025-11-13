# ElevenLabs Speech-to-Text Setup Guide

## Overview

This guide covers setting up ElevenLabs Speech-to-Text API (Scribe v2 Realtime) for use with the ASR Worker service.

## Prerequisites

1. **ElevenLabs Account**: You need an ElevenLabs account
2. **API Key**: An ElevenLabs API key with Speech-to-Text access
3. **Node.js**: Node.js 18+ (SDK may require Node 20+)

## Step 1: Get ElevenLabs API Key

1. Go to [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
2. Sign in or create an account
3. Navigate to **API Keys** section
4. Click **Create API Key** or use an existing key
5. **Copy the API key** - you'll need it for configuration

**Note**: API keys start with `sk_` prefix

## Step 2: Install Dependencies

The ElevenLabs SDK is already included in `package.json`. If you need to install it manually:

```bash
cd services/asr-worker
npm install @elevenlabs/client@^0.10.0
```

## Step 3: Configure Environment Variables

### Required Variables

```bash
# Set ASR provider to ElevenLabs
export ASR_PROVIDER=elevenlabs

# Set your ElevenLabs API key
export ELEVENLABS_API_KEY=sk_your_api_key_here
```

### Optional Configuration

```bash
# Model ID (default: scribe_v2_realtime)
export ELEVENLABS_MODEL=scribe_v2_realtime

# Language code (default: en)
export ELEVENLABS_LANGUAGE=en

# VAD (Voice Activity Detection) settings
export ELEVENLABS_VAD_SILENCE_THRESHOLD=1.5  # seconds
export ELEVENLABS_VAD_THRESHOLD=0.4          # 0.0-1.0
export ELEVENLABS_MIN_SPEECH_DURATION_MS=100 # milliseconds
export ELEVENLABS_MIN_SILENCE_DURATION_MS=100 # milliseconds
```

## Step 4: Audio Format Requirements

ElevenLabs Scribe v2 Realtime supports:

- **Format**: PCM16 (16-bit signed integer)
- **Sample Rates**: 8000 Hz or 16000 Hz
- **Channels**: Mono (1 channel)
- **Encoding**: LINEAR16

The provider automatically selects the correct audio format based on the sample rate:
- 8000 Hz → `PCM_8000`
- 16000 Hz → `PCM_16000`

## Step 5: Test the Integration

### Local Testing

Use the test script to verify the integration:

```bash
cd services/asr-worker

# Test with generated audio
ELEVENLABS_API_KEY=sk_your_api_key \
ASR_PROVIDER=elevenlabs \
npx ts-node scripts/test-elevenlabs-local.ts

# Test with audio file
ELEVENLABS_API_KEY=sk_your_api_key \
ASR_PROVIDER=elevenlabs \
npx ts-node scripts/test-elevenlabs-local.ts path/to/audio.wav
```

### Production Testing

1. Set environment variables in your deployment
2. Start the ASR worker:
   ```bash
   npm start
   ```
3. Monitor logs for connection and transcript events

## Configuration Details

### Model Selection

- **scribe_v2_realtime**: Real-time streaming transcription (recommended)
- Other models may be available - check ElevenLabs documentation

### Language Support

ElevenLabs supports multiple languages. Set `ELEVENLABS_LANGUAGE` to the appropriate language code:
- `en` - English
- `es` - Spanish
- `fr` - French
- And many more - see ElevenLabs documentation

### VAD (Voice Activity Detection) Settings

The provider uses VAD to determine when to commit transcripts:

- **vadSilenceThresholdSecs**: How long to wait for silence before committing (default: 1.5s)
- **vadThreshold**: Sensitivity of VAD (0.0-1.0, default: 0.4)
- **minSpeechDurationMs**: Minimum speech duration to trigger VAD (default: 100ms)
- **minSilenceDurationMs**: Minimum silence duration to trigger VAD (default: 100ms)

Adjust these based on your use case:
- Lower `vadSilenceThresholdSecs` = faster final transcripts
- Higher `vadThreshold` = more sensitive to speech
- Lower `minSpeechDurationMs` = detects shorter speech segments

## Troubleshooting

### Connection Errors

**Error**: "Connection error" or "WebSocket connection failed"
- **Solution**: Check your API key is correct and has Speech-to-Text access
- **Solution**: Verify network connectivity to ElevenLabs API

### No Transcripts Received

**Symptom**: Audio is sent but no transcripts are received
- **Check**: Audio format matches requirements (PCM16, 8kHz or 16kHz, mono)
- **Check**: Sample rate is 8000 or 16000 Hz
- **Check**: Audio contains actual speech (not just silence)
- **Check**: VAD settings aren't too strict

### Empty Transcripts

**Symptom**: Transcripts are received but text is empty
- **Cause**: Audio is silence or noise
- **Cause**: Audio format mismatch
- **Solution**: Verify audio format and sample rate
- **Solution**: Test with known good audio file

### Timeout Errors

**Symptom**: "Transcript timeout" warnings
- **Cause**: API is slow to respond
- **Cause**: Network latency
- **Solution**: Increase timeout in provider code (default: 5 seconds)
- **Solution**: Check network connectivity

### Authentication Errors

**Error**: "Invalid API key" or "Unauthorized"
- **Solution**: Verify `ELEVENLABS_API_KEY` is set correctly
- **Solution**: Check API key hasn't expired or been revoked
- **Solution**: Ensure API key has Speech-to-Text permissions

## API Limits and Pricing

- Check [ElevenLabs Pricing](https://elevenlabs.io/pricing) for current rates
- Monitor usage in [ElevenLabs Dashboard](https://elevenlabs.io/app)
- Set up usage alerts if needed

## Comparison with Other Providers

### vs Deepgram
- **ElevenLabs**: Lower latency, better for real-time
- **Deepgram**: More mature, better accuracy for some languages

### vs Google Cloud Speech-to-Text
- **ElevenLabs**: Simpler setup, no billing account required
- **Google**: More features, better for batch processing

## Additional Resources

- [ElevenLabs Documentation](https://elevenlabs.io/docs)
- [Speech-to-Text API Reference](https://elevenlabs.io/docs/api-reference/speech-to-text)
- [Scribe v2 Realtime Guide](https://elevenlabs.io/docs/cookbooks/speech-to-text/streaming)
- [ElevenLabs Support](https://help.elevenlabs.io)

## Support

For issues specific to this integration:
1. Check logs for error messages
2. Review this troubleshooting guide
3. Test with the local test script
4. Check ElevenLabs API status

For ElevenLabs API issues:
- Check [ElevenLabs Status Page](https://status.elevenlabs.io)
- Contact [ElevenLabs Support](https://help.elevenlabs.io)




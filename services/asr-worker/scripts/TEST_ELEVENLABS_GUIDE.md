# ElevenLabs Local Testing Guide

This guide explains how to test the ElevenLabs API locally with simulated audio chunks.

## Prerequisites

1. **ElevenLabs API Key**: You need a valid `ELEVENLABS_API_KEY` environment variable
2. **Node.js**: Ensure you have Node.js and npm installed
3. **Dependencies**: Install dependencies in the `services/asr-worker` directory:
   ```bash
   cd services/asr-worker
   npm install
   ```

## Test Scripts

### 1. Enhanced Simulation Script (`test-elevenlabs-simulate.ts`)

A comprehensive test script that supports multiple modes and options.

#### Auto Mode (Default)

Automatically sends audio chunks in sequence:

```bash
cd services/asr-worker
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts
```

**Options:**
- `--mode=auto` - Auto mode (default)
- `--sample-rate=8000` - Sample rate in Hz (default: 8000)
- `--chunk-size=250` - Chunk size in milliseconds (default: 250)
- `--duration=5000` - Total duration in milliseconds (default: 5000)
- `--file=path.wav` - Use audio file instead of generated audio
- `--silence` - Send silence chunks (for testing empty transcript handling)
- `--interaction-id=custom-id` - Custom interaction ID

**Examples:**

```bash
# Test with 16kHz sample rate
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --sample-rate=16000

# Test with custom chunk size
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --chunk-size=500

# Test with audio file
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --file=./test-audio.wav

# Test silence handling
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --silence

# Test with longer duration
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --duration=10000
```

#### Interactive Mode

Manually send audio chunks one at a time:

```bash
cd services/asr-worker
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --mode=interactive
```

**Interactive Commands:**
- `send [duration_ms] [frequency]` - Send a sine wave chunk
  - Example: `send 250 440` - Send 250ms of 440Hz tone
- `speech [duration_ms]` - Send speech-like audio chunk
  - Example: `speech 500` - Send 500ms of speech-like audio
- `silence [duration_ms]` - Send silence chunk
  - Example: `silence 250` - Send 250ms of silence
- `file <path>` - Load and send chunks from audio file
  - Example: `file ./test-audio.wav`
- `status` - Show connection status and statistics
- `quit` - Exit the test

**Example Interactive Session:**

```
> send 250 440
📤 [1] Sending chunk: 250.0ms, 4000 bytes
   ✅ [PARTIAL] hello
      Latency: 234ms

> speech 500
📤 [2] Sending chunk: 500.0ms, 8000 bytes
   ✅ [FINAL] hello world
      Confidence: 95.2%
      Latency: 456ms

> status
📊 Status:
   Sequence: 2
   Transcripts received: 2
   Non-empty transcripts: 2

> quit
```

### 2. Basic Test Script (`test-elevenlabs-local.ts`)

A simpler test script for basic testing:

```bash
cd services/asr-worker
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-local.ts [audio-file.wav]
```

If no audio file is provided, it generates a test sine wave.

## Audio Format Requirements

- **Format**: PCM16 (16-bit signed integer)
- **Sample Rates**: 8000 Hz or 16000 Hz (ElevenLabs supports both)
- **Encoding**: Little-endian
- **Channels**: Mono (single channel)

## Understanding the Output

### Successful Transcript
```
📤 [1] Sending chunk: 250.0ms, 4000 bytes
   ✅ [PARTIAL] hello
      Confidence: 95.2%
      Latency: 234ms
```

- **PARTIAL**: Intermediate transcript (may change)
- **FINAL**: Committed transcript (won't change)
- **Confidence**: Transcription confidence (0-1, displayed as percentage)
- **Latency**: Time from sending to receiving transcript

### Empty Transcript
```
📤 [1] Sending chunk: 250.0ms, 4000 bytes
   ⚠️  Empty transcript (latency: 234ms)
```

Common causes:
- Audio is silence
- Audio format mismatch
- Sample rate mismatch
- Chunk size too small
- Authentication issues

### Error
```
📤 [1] Sending chunk: 250.0ms, 4000 bytes
   ❌ Error: Connection not ready
```

Check:
- API key is valid
- Network connectivity
- ElevenLabs service status

## Testing Scenarios

### 1. Test Basic Functionality
```bash
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts
```

### 2. Test Different Sample Rates
```bash
# 8kHz (telephony)
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --sample-rate=8000

# 16kHz (higher quality)
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --sample-rate=16000
```

### 3. Test Different Chunk Sizes
```bash
# Small chunks (200ms)
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --chunk-size=200

# Large chunks (500ms)
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --chunk-size=500
```

### 4. Test Silence Handling
```bash
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --silence
```

### 5. Test with Real Audio File
```bash
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --file=./my-audio.wav
```

### 6. Interactive Testing
```bash
ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts --mode=interactive
```

## Troubleshooting

### "ELEVENLABS_API_KEY is required"
- Set the environment variable: `export ELEVENLABS_API_KEY=your_key`
- Or inline: `ELEVENLABS_API_KEY=your_key ts-node ...`

### "Authentication error"
- Verify your API key is correct
- Check that your account has Speech-to-Text access
- Ensure the API key has the correct permissions

### "Empty transcripts"
- Check audio format (must be PCM16)
- Verify sample rate matches (8000 or 16000 Hz)
- Ensure audio contains actual speech (not silence)
- Try larger chunk sizes (250-500ms)

### "Connection timeout"
- Check network connectivity
- Verify ElevenLabs service status
- Try again (may be temporary)

### "Sample rate mismatch"
- Ensure all chunks use the same sample rate
- Check audio file sample rate matches the `--sample-rate` parameter

## Tips

1. **Start with auto mode** to verify basic functionality
2. **Use interactive mode** for debugging specific issues
3. **Test with silence** to verify empty transcript handling
4. **Try different chunk sizes** to find optimal performance
5. **Use real audio files** for more realistic testing
6. **Monitor latency** - should be < 500ms for good performance

## Next Steps

After successful local testing:
1. Test with actual telephony audio from Exotel
2. Monitor production metrics
3. Tune chunk sizes and sample rates for your use case
4. Set up monitoring and alerting


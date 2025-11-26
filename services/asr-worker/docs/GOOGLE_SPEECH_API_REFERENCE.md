# Google Cloud Speech-to-Text API Reference

## API Overview

Google Cloud Speech-to-Text provides two main recognition methods:
1. **Streaming Recognition** - Real-time transcription of audio streams
2. **Batch Recognition** - Process complete audio files

We use **Streaming Recognition** for real-time transcription.

## Streaming Recognition API

### Method: `streamingRecognize()`

**Node.js SDK:**
```typescript
import { SpeechClient } from '@google-cloud/speech';

const client = new SpeechClient();
const recognizeStream = client.streamingRecognize({
  config: {
    encoding: 'LINEAR16',
    sampleRateHertz: 8000,
    languageCode: 'en-US',
    model: 'latest_long',
    enableAutomaticPunctuation: true,
    enableWordTimeOffsets: false,
    interimResults: true
  }
});
```

### Request Format

**Initial Request:**
```typescript
{
  streamingConfig: {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 8000,
      languageCode: 'en-US',
      model: 'latest_long',
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: false
    },
    interimResults: true,
    singleUtterance: false
  }
}
```

**Subsequent Requests:**
```typescript
{
  audioContent: Buffer // Raw audio bytes
}
```

### Response Format

```typescript
{
  results: [
    {
      alternatives: [
        {
          transcript: string,
          confidence: number,
          words: [
            {
              word: string,
              startTime: { seconds: number, nanos: number },
              endTime: { seconds: number, nanos: number }
            }
          ]
        }
      ],
      isFinalResult: boolean,
      resultEndTime: { seconds: number, nanos: number },
      languageCode: string
    }
  ],
  speechEventType: 'SPEECH_EVENT_UNSPECIFIED' | 'END_OF_SINGLE_UTTERANCE'
}
```

## Audio Format Specifications

### LINEAR16 (PCM16)

**Format:**
- 16-bit signed integers
- Little-endian byte order
- Linear PCM encoding

**Sample Rates Supported:**
- 8000 Hz (telephony)
- 16000 Hz (standard)
- 44100 Hz (CD quality)
- 48000 Hz (professional)

**Channels:**
- Mono (1 channel) - recommended
- Stereo (2 channels) - supported

**Byte Order:**
- Little-endian (standard)

## Configuration Options

### RecognitionConfig

```typescript
{
  encoding: 'LINEAR16' | 'MULAW' | 'ALAW' | 'FLAC' | 'OGG_OPUS',
  sampleRateHertz: number,
  audioChannelCount: number, // 1 or 2
  languageCode: string, // 'en-US', 'en-GB', etc.
  alternativeLanguageCodes: string[], // Optional
  model: 'latest_long' | 'latest_short' | 'chirp_3' | 'chirp_2',
  useEnhanced: boolean, // Use enhanced model (higher cost)
  enableAutomaticPunctuation: boolean,
  enableWordTimeOffsets: boolean,
  enableWordConfidence: boolean,
  enableSpeakerDiarization: boolean,
  diarizationSpeakerCount: number,
  profanityFilter: boolean,
  adaptation: {
    phraseSets: [],
    customClasses: []
  }
}
```

### StreamingRecognitionConfig

```typescript
{
  config: RecognitionConfig,
  singleUtterance: boolean, // Stop after first utterance
  interimResults: boolean, // Return partial results
  enableVoiceActivityEvents: boolean,
  voiceActivityTimeout: {
    speechStartTimeout: { seconds: number },
    speechEndTimeout: { seconds: number }
  }
}
```

## Models

### Standard Models

- **latest_long**: Best for long-form audio (>1 minute)
- **latest_short**: Best for short utterances (<1 minute)
- **command_and_search**: Optimized for voice commands
- **phone_call**: Optimized for phone calls
- **video**: Optimized for video audio

### Chirp Models (Latest)

- **chirp_3**: Latest model with improved accuracy
- **chirp_2**: Previous generation

**Recommendation:** Use `latest_long` for general transcription, `chirp_3` for best accuracy.

## Language Codes

Common language codes:
- `en-US` - English (United States)
- `en-GB` - English (United Kingdom)
- `es-ES` - Spanish (Spain)
- `fr-FR` - French (France)
- `de-DE` - German (Germany)
- `hi-IN` - Hindi (India)

Full list: https://cloud.google.com/speech-to-text/docs/languages

## Streaming Limits

- **Maximum stream duration:** 5 minutes
- **After 5 minutes:** Stream automatically ends, need to restart
- **Best practice:** Restart stream before 5-minute limit

## Error Handling

### Common Errors

**INVALID_ARGUMENT:**
- Invalid audio format
- Unsupported sample rate
- Missing required fields

**DEADLINE_EXCEEDED:**
- Request timeout
- Stream timeout

**RESOURCE_EXHAUSTED:**
- Quota exceeded
- Rate limit exceeded

**UNAUTHENTICATED:**
- Invalid credentials
- Missing authentication

## Best Practices

1. **Chunk Size:** Send 100-250ms audio chunks for optimal latency
2. **Stream Restart:** Restart stream every 4-5 minutes to avoid timeout
3. **Error Handling:** Implement retry logic for transient errors
4. **Connection Reuse:** Reuse client instances, create new streams per interaction
5. **Interim Results:** Enable for real-time feedback, disable for final-only

## Comparison with Deepgram

| Feature | Google Speech-to-Text | Deepgram |
|---------|----------------------|----------|
| Streaming | ✅ Yes | ✅ Yes |
| Partial Results | ✅ Yes | ✅ Yes |
| Free Tier | 60 min/month | Limited |
| Pricing | $0.016/min | Varies |
| Stream Duration | 5 min limit | No limit |
| Models | Multiple | Multiple |
| Language Support | 100+ languages | 30+ languages |





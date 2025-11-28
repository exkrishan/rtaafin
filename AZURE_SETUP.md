# Azure Speech SDK Setup

This document outlines the environment variables required to use Azure Speech-to-Text as the ASR provider.

## Required Environment Variables

### ASR Worker Service

Add these variables to your `.env.local` file or deployment configuration:

```bash
# ASR Provider Selection
ASR_PROVIDER=azure  # Change from 'elevenlabs' or 'deepgram' to 'azure'

# Azure Speech Configuration (REQUIRED when ASR_PROVIDER=azure)
AZURE_SPEECH_KEY=your_azure_subscription_key
AZURE_SPEECH_REGION=eastus  # or your Azure region (e.g., westus, centralus, etc.)

# Azure Speech Optional Configuration
AZURE_SPEECH_LANGUAGE=en-US  # Default: en-US (supports other languages)
AZURE_SPEECH_ENABLE_DICTATION=true  # Default: true (enables punctuation and formatting)
```

### How to Get Azure Speech Credentials

1. **Create Azure Account**
   - Sign up at [https://azure.microsoft.com/](https://azure.microsoft.com/)
   - Get free credits for new accounts

2. **Create Speech Service Resource**
   - Navigate to [Azure Portal](https://portal.azure.com/)
   - Click "Create a resource"
   - Search for "Speech"
   - Click "Create" under "Speech Services"
   - Fill in:
     - Subscription: Your subscription
     - Resource group: Create new or select existing
     - Region: Choose closest to your users (e.g., `eastus`, `westus`, `centralus`)
     - Name: Choose a unique name
     - Pricing tier: Choose based on your needs (F0 for free tier, S0 for production)

3. **Get Keys and Endpoint**
   - Once created, go to the resource
   - Click "Keys and Endpoint" in the left sidebar
   - Copy one of the keys (KEY 1 or KEY 2) → This is your `AZURE_SPEECH_KEY`
   - Note the "Location/Region" → This is your `AZURE_SPEECH_REGION`

## Fallback Options

The ElevenLabs and Deepgram providers are kept as commented fallbacks. To switch back:

### Switch Back to ElevenLabs

1. Uncomment ElevenLabs provider in `services/asr-worker/src/providers/elevenlabsProvider.ts`
   - Remove the `/*` at the start of the implementation
   - Remove the `*/` at the end of the implementation

2. Update environment variable:
   ```bash
   ASR_PROVIDER=elevenlabs
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ```

3. Redeploy ASR worker service

### Switch Back to Deepgram

1. Uncomment Deepgram provider in `services/asr-worker/src/providers/deepgramProvider.ts`
   - Remove the `/*` at the start of the implementation
   - Remove the `*/` at the end of the implementation

2. Update environment variable:
   ```bash
   ASR_PROVIDER=deepgram
   DEEPGRAM_API_KEY=your_deepgram_api_key
   ```

3. Redeploy ASR worker service

## Deployment

### Local Development

1. Create `.env.local` file in project root:
   ```bash
   cp .env.example .env.local  # if .env.example exists
   # OR
   touch .env.local
   ```

2. Add Azure configuration to `.env.local`:
   ```bash
   ASR_PROVIDER=azure
   AZURE_SPEECH_KEY=your_key_here
   AZURE_SPEECH_REGION=eastus
   AZURE_SPEECH_LANGUAGE=en-US
   AZURE_SPEECH_ENABLE_DICTATION=true
   ```

3. Install dependencies:
   ```bash
   cd services/asr-worker
   npm install
   ```

4. Run locally:
   ```bash
   npm run dev
   ```

### Staging/Production (Render.com)

1. Navigate to your ASR Worker service in Render dashboard

2. Go to "Environment" tab

3. Add environment variables:
   - `ASR_PROVIDER` = `azure`
   - `AZURE_SPEECH_KEY` = `your_azure_subscription_key`
   - `AZURE_SPEECH_REGION` = `eastus` (or your region)
   - `AZURE_SPEECH_LANGUAGE` = `en-US`
   - `AZURE_SPEECH_ENABLE_DICTATION` = `true`

4. Save and redeploy

## Verification

After deployment, verify Azure is working:

1. **Check Health Endpoint**
   ```bash
   curl https://your-asr-worker-url/health
   ```
   
   Should return JSON with `azureMetrics` section:
   ```json
   {
     "status": "ok",
     "provider": "azure",
     "azureMetrics": {
       "connectionsCreated": 1,
       "connectionsClosed": 0,
       "audioChunksSent": 150,
       "transcriptsReceived": 45,
       ...
     }
   }
   ```

2. **Check Logs**
   Look for Azure-specific log messages:
   - `[AzureSpeechProvider] Initialized`
   - `[AzureSpeechProvider] 🔌 Creating recognizer`
   - `[AzureSpeechProvider] ✅ Continuous recognition started`
   - `[AzureSpeechProvider] 🎤 Recognizing (partial)`
   - `[AzureSpeechProvider] ✅ Recognized (final)`

3. **Test Transcription**
   Make a test call and verify transcripts appear in real-time

## Supported Languages

Azure Speech supports 100+ languages. Common examples:

- `en-US` - English (United States)
- `en-GB` - English (United Kingdom)
- `es-ES` - Spanish (Spain)
- `es-MX` - Spanish (Mexico)
- `fr-FR` - French (France)
- `de-DE` - German (Germany)
- `it-IT` - Italian (Italy)
- `pt-BR` - Portuguese (Brazil)
- `ja-JP` - Japanese (Japan)
- `zh-CN` - Chinese (Simplified, China)
- `ko-KR` - Korean (Korea)
- `hi-IN` - Hindi (India)

Full list: [https://docs.microsoft.com/azure/cognitive-services/speech-service/language-support](https://docs.microsoft.com/azure/cognitive-services/speech-service/language-support)

## Pricing

Azure Speech pricing (as of 2025):

- **Standard:** $1 per audio hour
- **Free tier (F0):** 5 audio hours per month free

Current ElevenLabs and Deepgram pricing may differ. Monitor usage and costs via Azure Cost Management.

## Architecture Notes

### Key Differences from ElevenLabs/Deepgram

1. **Continuous Recognition**
   - Azure: Uses continuous recognition mode (no manual commits)
   - ElevenLabs: Requires manual commits or VAD-based commits
   - Deepgram: Streaming with endpointing

2. **Audio Buffering**
   - Azure: Sends audio immediately (no 4-second timer)
   - ElevenLabs/Deepgram: Buffer audio and send in batches

3. **Event-Driven**
   - Azure: Native event handlers (`recognizing`, `recognized`)
   - ElevenLabs: Custom event handling with callbacks
   - Deepgram: Streaming events

4. **Latency**
   - Azure: 1-3 seconds average (no buffering delay)
   - Previous: 7-14 seconds average (4s buffer + 5s commit + 5s poll)
   - **Expected improvement:** 70-85% reduction in ASR latency

## Troubleshooting

### Error: "AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required"

**Solution:** Set both environment variables in your deployment configuration.

### Error: "Authentication failed" or 401 errors

**Solution:**
- Verify `AZURE_SPEECH_KEY` is correct (copy from Azure Portal)
- Verify `AZURE_SPEECH_REGION` matches your resource's region
- Check if the key has expired or been regenerated

### Error: "Quota exceeded" or 429 errors

**Solution:**
- Upgrade from F0 (free tier) to S0 (standard tier)
- Check Azure Cost Management for current usage
- Contact Azure support to increase quota

### No transcripts received

**Solution:**
1. Check logs for Azure connection messages
2. Verify audio is being sent to ASR worker (check ingest service logs)
3. Verify `AZURE_SPEECH_LANGUAGE` matches the audio language
4. Check `/health` endpoint for active connections

### High latency

**Solution:**
1. Choose Azure region closest to your users
2. Verify network connectivity to Azure
3. Check if `AZURE_SPEECH_ENABLE_DICTATION` is needed (adds slight latency for formatting)

## Support

- **Azure Documentation:** [https://docs.microsoft.com/azure/cognitive-services/speech-service/](https://docs.microsoft.com/azure/cognitive-services/speech-service/)
- **Azure Support:** [https://azure.microsoft.com/support/](https://azure.microsoft.com/support/)
- **Speech SDK Issues:** [https://github.com/Azure-Samples/cognitive-services-speech-sdk](https://github.com/Azure-Samples/cognitive-services-speech-sdk)


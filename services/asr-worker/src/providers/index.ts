/**
 * ASR provider factory
 */

import { AsrProvider } from '../types';
import { MockProvider } from './mockProvider';
import { DeepgramProvider } from './deepgramProvider';
import { WhisperLocalProvider } from './whisperLocalProvider';
import { GoogleSpeechProvider } from './googleSpeechProvider';
import { ElevenLabsProvider } from './elevenlabsProvider';
import { AzureSpeechProvider } from './azureSpeechProvider';

export type ProviderType = 'mock' | 'deepgram' | 'whisper' | 'google' | 'elevenlabs' | 'azure';

export function createAsrProvider(type?: ProviderType, config?: any): AsrProvider {
  const providerType = type || (process.env.ASR_PROVIDER as ProviderType) || 'mock';

  switch (providerType) {
    case 'mock':
      return new MockProvider();

    case 'deepgram':
      // Explicitly check for API key before creating provider
      const apiKey = config?.apiKey || process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        throw new Error(
          'DEEPGRAM_API_KEY is required when ASR_PROVIDER=deepgram. ' +
          'Please set DEEPGRAM_API_KEY environment variable. ' +
          'The system will NOT fall back to mock provider - this is intentional for testing.'
        );
      }
      return new DeepgramProvider(apiKey);

    case 'whisper':
      return new WhisperLocalProvider(config);

    case 'google':
      // Check for credentials
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT_ID) {
        throw new Error(
          'GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_PROJECT_ID is required when ASR_PROVIDER=google. ' +
          'Please set GOOGLE_APPLICATION_CREDENTIALS environment variable to path of service account key file, ' +
          'or set up Application Default Credentials (ADC) and provide GOOGLE_CLOUD_PROJECT_ID.'
        );
      }
      return new GoogleSpeechProvider();

    case 'elevenlabs':
      // Check for API key
      const elevenLabsApiKey = config?.apiKey || process.env.ELEVENLABS_API_KEY;
      if (!elevenLabsApiKey) {
        throw new Error(
          'ELEVENLABS_API_KEY is required when ASR_PROVIDER=elevenlabs. ' +
          'Please set ELEVENLABS_API_KEY environment variable. ' +
          'The system will NOT fall back to mock provider - this is intentional for testing.'
        );
      }
      return new ElevenLabsProvider(elevenLabsApiKey, {
        circuitBreaker: config?.circuitBreaker,
        connectionHealthMonitor: config?.connectionHealthMonitor,
      });

    case 'azure':
      // Check for subscription key and region
      const azureKey = config?.apiKey || process.env.AZURE_SPEECH_KEY;
      const azureRegion = config?.region || process.env.AZURE_SPEECH_REGION;
      if (!azureKey || !azureRegion) {
        throw new Error(
          'AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required when ASR_PROVIDER=azure. ' +
          'Please set these environment variables. ' +
          'Example: AZURE_SPEECH_KEY=your_key AZURE_SPEECH_REGION=eastus'
        );
      }
      return new AzureSpeechProvider(azureKey, azureRegion, {
        circuitBreaker: config?.circuitBreaker,
        connectionHealthMonitor: config?.connectionHealthMonitor,
      });

    default:
      throw new Error(`Unknown ASR provider: ${providerType}`);
  }
}


/**
 * ASR provider factory
 */

import { AsrProvider } from '../types';
import { MockProvider } from './mockProvider';
// NOTE: DeepgramProvider and ElevenLabsProvider are commented out as fallbacks
// To re-enable, uncomment their files and re-add imports here
// import { DeepgramProvider } from './deepgramProvider';
// import { ElevenLabsProvider } from './elevenlabsProvider';
import { WhisperLocalProvider } from './whisperLocalProvider';
import { GoogleSpeechProvider } from './googleSpeechProvider';
import { AzureSpeechProvider } from './azureSpeechProvider';

export type ProviderType = 'mock' | 'deepgram' | 'whisper' | 'google' | 'elevenlabs' | 'azure';

export function createAsrProvider(type?: ProviderType, config?: any): AsrProvider {
  const providerType = type || (process.env.ASR_PROVIDER as ProviderType) || 'mock';

  switch (providerType) {
    case 'mock':
      return new MockProvider();

    case 'deepgram':
      // Deepgram provider is currently disabled (commented out as fallback)
      // To re-enable: uncomment services/asr-worker/src/providers/deepgramProvider.ts
      // and re-add the import in this file
      throw new Error(
        'Deepgram provider is currently disabled. ' +
        'It has been commented out in favor of Azure Speech SDK. ' +
        'To re-enable: uncomment the provider file and import. ' +
        'See AZURE_SETUP.md for instructions.'
      );

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
      // ElevenLabs provider is currently disabled (commented out as fallback)
      // To re-enable: uncomment services/asr-worker/src/providers/elevenlabsProvider.ts
      // and re-add the import in this file
      throw new Error(
        'ElevenLabs provider is currently disabled. ' +
        'It has been commented out in favor of Azure Speech SDK. ' +
        'To re-enable: uncomment the provider file and import. ' +
        'See AZURE_SETUP.md for instructions.'
      );

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


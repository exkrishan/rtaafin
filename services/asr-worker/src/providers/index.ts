/**
 * ASR provider factory
 */

import { AsrProvider } from '../types';
import { MockProvider } from './mockProvider';
import { DeepgramProvider } from './deepgramProvider';
import { WhisperLocalProvider } from './whisperLocalProvider';

export type ProviderType = 'mock' | 'deepgram' | 'whisper';

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

    default:
      throw new Error(`Unknown ASR provider: ${providerType}`);
  }
}


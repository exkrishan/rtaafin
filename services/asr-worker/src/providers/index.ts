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
      return new DeepgramProvider(config?.apiKey);

    case 'whisper':
      return new WhisperLocalProvider(config);

    default:
      throw new Error(`Unknown ASR provider: ${providerType}`);
  }
}


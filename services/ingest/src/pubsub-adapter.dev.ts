/**
 * Pub/sub adapter for ingestion service
 * Uses the pluggable pub/sub abstraction from lib/pubsub
 */

// Use local lib (copied by prebuild script) - path works for both dev and build
import { createPubSubAdapterFromEnv, PubSubAdapter as CorePubSubAdapter } from '../lib/pubsub';
import { audioTopic } from '../lib/pubsub/topics';
import { AudioFrame } from './types';

// Wrapper to match ingestion service interface
export interface PubSubAdapter {
  publish(event: AudioFrame): Promise<void>;
  disconnect(): Promise<void>;
}

class IngestionPubSubAdapter implements PubSubAdapter {
  private adapter: CorePubSubAdapter;
  private topic: string;

  constructor() {
    // Use the pluggable pub/sub adapter
    this.adapter = createPubSubAdapterFromEnv();
    
    // Determine topic based on configuration
    // Default to audio_stream for POC (matches ASR worker)
    const useStreams = process.env.USE_AUDIO_STREAM !== 'false'; // Default true
    this.topic = audioTopic({ useStreams });
    console.info('[pubsub] Topic configuration:', { useStreams, topic: this.topic });
    
    console.info('[pubsub] Using pub/sub adapter:', process.env.PUBSUB_ADAPTER || 'redis_streams');
    console.info('[pubsub] Audio topic:', this.topic);
  }

  async publish(event: AudioFrame): Promise<void> {
    try {
      // Use the pluggable adapter to publish
      await this.adapter.publish(this.topic, {
        tenant_id: event.tenant_id,
        interaction_id: event.interaction_id,
        seq: event.seq,
        timestamp_ms: event.timestamp_ms,
        sample_rate: event.sample_rate,
        encoding: event.encoding,
        // Convert Buffer to base64 for JSON serialization
        audio: event.audio.toString('base64'),
      });
    } catch (error) {
      console.error('[pubsub] Failed to publish audio frame:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.adapter.close();
  }
}

export function createPubSubAdapter(): PubSubAdapter {
  return new IngestionPubSubAdapter();
}


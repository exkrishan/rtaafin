/**
 * Pub/sub adapter for ingestion service
 * Uses the pluggable pub/sub abstraction from lib/pubsub
 */

// Use relative import to compiled lib/pubsub - paths will be fixed in postbuild
// TypeScript will resolve @rtaa/pubsub to ../../lib/pubsub/dist/index.js
import { createPubSubAdapterFromEnv, PubSubAdapter as CorePubSubAdapter } from '@rtaa/pubsub';
import { audioTopic } from '@rtaa/pubsub/topics';
import { AudioFrame } from './types';

// Wrapper to match ingestion service interface
export interface PubSubAdapter {
  publish(event: AudioFrame): Promise<void>;
  publishToTopic(topic: string, message: any): Promise<void>;
  disconnect(): Promise<void>;
}

class IngestionPubSubAdapter implements PubSubAdapter {
  private adapter: CorePubSubAdapter;
  private topic: string;

  constructor() {
    try {
      // Use the pluggable pub/sub adapter
      this.adapter = createPubSubAdapterFromEnv();
      
      // Determine topic based on configuration
      // Default to audio_stream for POC (matches ASR worker)
      const useStreams = process.env.USE_AUDIO_STREAM !== 'false'; // Default true
      this.topic = audioTopic({ useStreams });
      
      console.info('[pubsub] ✅ Pub/Sub adapter initialized:', {
        adapter: process.env.PUBSUB_ADAPTER || 'redis_streams',
        topic: this.topic,
        useStreams,
      });
    } catch (error: any) {
      console.error('[pubsub] ❌ Failed to initialize pub/sub adapter:', error.message);
      throw new Error(`Pub/Sub initialization failed: ${error.message}. Check PUBSUB_ADAPTER and REDIS_URL.`);
    }
  }

  async publish(event: AudioFrame): Promise<void> {
    try {
      // Validate event before publishing
      if (!event.interaction_id || !event.tenant_id) {
        throw new Error('Invalid audio frame: missing interaction_id or tenant_id');
      }

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
    } catch (error: any) {
      // Log error with context
      console.error('[pubsub] Failed to publish audio frame:', {
        interaction_id: event.interaction_id,
        tenant_id: event.tenant_id,
        seq: event.seq,
        topic: this.topic,
        error: error.message,
      });
      throw error;
    }
  }

  async publishToTopic(topic: string, message: any): Promise<void> {
    try {
      await this.adapter.publish(topic, message);
    } catch (error: any) {
      console.error('[pubsub] Failed to publish message to topic:', {
        topic,
        error: error.message,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.adapter.close();
      console.info('[pubsub] ✅ Pub/Sub adapter disconnected');
    } catch (error: any) {
      console.error('[pubsub] ❌ Error disconnecting pub/sub adapter:', error.message);
      throw error;
    }
  }
}

export function createPubSubAdapter(): PubSubAdapter {
  return new IngestionPubSubAdapter();
}


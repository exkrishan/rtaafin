/**
 * Deepgram streaming ASR provider
 * Uses Deepgram SDK for real-time speech recognition
 */

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { AsrProvider, Transcript } from '../types';

export class DeepgramProvider implements AsrProvider {
  private client: ReturnType<typeof createClient>;
  private connections: Map<string, any> = new Map(); // interactionId -> connection
  private transcriptCallbacks: Map<string, (transcript: Transcript) => void> = new Map();

  constructor(apiKey?: string) {
    const key = apiKey || process.env.DEEPGRAM_API_KEY;
    if (!key) {
      throw new Error('DEEPGRAM_API_KEY is required for Deepgram provider');
    }

    this.client = createClient(key);
  }

  async sendAudioChunk(
    audio: Buffer,
    opts: { interactionId: string; seq: number; sampleRate: number }
  ): Promise<Transcript> {
    const { interactionId, sampleRate } = opts;

    // Get or create connection for this interaction
    let connection = this.connections.get(interactionId);

    if (!connection) {
      // Create new live connection
      connection = this.client.listen.live({
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        interim_results: true,
        sample_rate: sampleRate,
        encoding: 'linear16',
        channels: 1,
      });

      // Set up event handlers
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.info(`[DeepgramProvider] Connection opened for ${interactionId}`);
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final || false;
        const confidence = data.channel?.alternatives?.[0]?.confidence || 0.9;

        if (transcript) {
          const callback = this.transcriptCallbacks.get(interactionId);
          if (callback) {
            callback({
              type: isFinal ? 'final' : 'partial',
              text: transcript,
              confidence,
              isFinal: isFinal as any,
            } as Transcript);
          }
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        console.error(`[DeepgramProvider] Error for ${interactionId}:`, error);
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.info(`[DeepgramProvider] Connection closed for ${interactionId}`);
        this.connections.delete(interactionId);
        this.transcriptCallbacks.delete(interactionId);
      });

      this.connections.set(interactionId, connection);

      // Start the connection
      connection.start();
    }

    // Send audio chunk
    connection.send(audio);

    // Return a promise that resolves when we get a transcript
    // For now, return partial (real implementation would wait for callback)
    return new Promise((resolve) => {
      // Store callback for this chunk
      const callback = (transcript: Transcript) => {
        resolve(transcript);
      };
      this.transcriptCallbacks.set(interactionId, callback);

      // Timeout after 2 seconds if no response
      setTimeout(() => {
        if (this.transcriptCallbacks.has(interactionId)) {
          this.transcriptCallbacks.delete(interactionId);
          resolve({
            type: 'partial',
            text: '',
            isFinal: false,
          });
        }
      }, 2000);
    });
  }

  async close(): Promise<void> {
    // Close all connections
    const closePromises = Array.from(this.connections.values()).map((conn) => {
      return new Promise<void>((resolve) => {
        if (conn && typeof conn.finish === 'function') {
          conn.finish();
        }
        resolve();
      });
    });

    await Promise.all(closePromises);
    this.connections.clear();
    this.transcriptCallbacks.clear();
  }
}


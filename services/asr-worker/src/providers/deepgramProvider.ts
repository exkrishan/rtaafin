/**
 * Deepgram streaming ASR provider
 * Uses Deepgram SDK for real-time speech recognition
 */

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { AsrProvider, Transcript } from '../types';

interface ConnectionState {
  connection: any;
  isReady: boolean;
  transcriptQueue: Transcript[];
  pendingResolvers: Array<(transcript: Transcript) => void>;
  lastTranscript: Transcript | null;
}

export class DeepgramProvider implements AsrProvider {
  private client: ReturnType<typeof createClient>;
  private connections: Map<string, ConnectionState> = new Map();

  constructor(apiKey?: string) {
    const key = apiKey || process.env.DEEPGRAM_API_KEY;
    if (!key) {
      throw new Error('DEEPGRAM_API_KEY is required for Deepgram provider');
    }

    this.client = createClient(key);
    console.info('[DeepgramProvider] Initialized with API key');
  }

  private async getOrCreateConnection(
    interactionId: string,
    sampleRate: number
  ): Promise<ConnectionState> {
    let state = this.connections.get(interactionId);

    if (!state) {
      console.info(`[DeepgramProvider] Creating new connection for ${interactionId}`);
      
      // Create new live connection
      const connectionConfig = {
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        interim_results: true,
        sample_rate: sampleRate,
        encoding: 'linear16',
        channels: 1,
      };
      
      console.info(`[DeepgramProvider] Connection config:`, {
        interactionId,
        ...connectionConfig,
      });
      
      const connection = this.client.listen.live(connectionConfig);

      state = {
        connection,
        isReady: false,
        transcriptQueue: [],
        pendingResolvers: [],
        lastTranscript: null,
      };

      // Set up event handlers
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.info(`[DeepgramProvider] ✅ Connection opened for ${interactionId}`);
        state.isReady = true;
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        try {
          // Log ALL transcript events to debug
          console.info(`[DeepgramProvider] 📨 Transcript event received for ${interactionId}`, {
            hasChannel: !!data.channel,
            hasAlternatives: !!data.channel?.alternatives,
            alternativesCount: data.channel?.alternatives?.length || 0,
            isFinal: data.is_final || false,
            speechFinal: data.speech_final,
            rawDataKeys: Object.keys(data),
          });
          
          const transcriptText = data.channel?.alternatives?.[0]?.transcript;
          const isFinal = data.is_final || false;
          const confidence = data.channel?.alternatives?.[0]?.confidence || 0.9;

          if (transcriptText && transcriptText.trim().length > 0) {
            const transcript: Transcript = {
              type: isFinal ? 'final' : 'partial',
              text: transcriptText.trim(),
              confidence,
              isFinal: isFinal as any,
            };

            console.info(`[DeepgramProvider] 📝 Received transcript for ${interactionId}`, {
              type: transcript.type,
              textLength: transcript.text.length,
              textPreview: transcript.text.substring(0, 50),
              isFinal,
            });

            state.lastTranscript = transcript;
            state.transcriptQueue.push(transcript);

            // Resolve any pending promises
            if (state.pendingResolvers.length > 0) {
              const resolver = state.pendingResolvers.shift()!;
              resolver(transcript);
            }
          } else {
            // Log empty transcripts to debug why Deepgram isn't returning text
            console.warn(`[DeepgramProvider] ⚠️ Empty transcript received from Deepgram for ${interactionId}`, {
              isFinal,
              hasChannel: !!data.channel,
              hasAlternatives: !!data.channel?.alternatives,
              alternativesCount: data.channel?.alternatives?.length || 0,
              rawData: JSON.stringify(data).substring(0, 200), // First 200 chars for debugging
            });
          }
        } catch (error: any) {
          console.error(`[DeepgramProvider] Error processing transcript for ${interactionId}:`, error);
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        console.error(`[DeepgramProvider] ❌ API Error for ${interactionId}:`, {
          error: error.message || String(error),
          code: error.code,
          type: error.type,
          fullError: error,
          interactionId,
        });
        // Reject pending resolvers on error
        state.pendingResolvers.forEach((resolve) => {
          resolve({
            type: 'partial',
            text: '',
            isFinal: false,
          });
        });
        state.pendingResolvers = [];
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.info(`[DeepgramProvider] 🔒 Connection closed for ${interactionId}`);
        this.connections.delete(interactionId);
      });

      this.connections.set(interactionId, state);

      // Note: Deepgram SDK connection is already active when created via listen.live()
      // No need to call start() - the connection is ready when Open event fires
      console.info(`[DeepgramProvider] 🚀 Connection created for ${interactionId}, waiting for Open event...`);
    }

    return state;
  }

  async sendAudioChunk(
    audio: Buffer,
    opts: { interactionId: string; seq: number; sampleRate: number }
  ): Promise<Transcript> {
    const { interactionId, sampleRate, seq } = opts;

    try {
      // Get or create connection
      const state = await this.getOrCreateConnection(interactionId, sampleRate);

      // Wait for connection to be ready (with timeout)
      if (!state.isReady) {
        console.debug(`[DeepgramProvider] Waiting for connection to be ready for ${interactionId}...`);
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Connection not ready after 5 seconds for ${interactionId}`));
          }, 5000);

          const checkReady = setInterval(() => {
            if (state.isReady) {
              clearInterval(checkReady);
              clearTimeout(timeout);
              resolve();
            }
          }, 100);
        });
      }

      // Send audio chunk
      try {
        // Calculate expected audio duration for debugging
        const bytesPerSample = 2; // 16-bit = 2 bytes
        const samples = audio.length / bytesPerSample;
        const durationMs = (samples / sampleRate) * 1000;
        
        console.info(`[DeepgramProvider] 📤 Sending audio chunk:`, {
          interactionId,
          seq,
          size: audio.length,
          sampleRate,
          samples,
          durationMs: durationMs.toFixed(0) + 'ms',
          isReady: state.isReady,
        });
        
        state.connection.send(audio);
      } catch (error: any) {
        console.error(`[DeepgramProvider] Failed to send audio for ${interactionId}:`, {
          error: error.message || String(error),
          code: error.code,
          interactionId,
          seq,
          audioSize: audio.length,
        });
        throw error;
      }

      // Return a promise that resolves when we get a transcript
      return new Promise<Transcript>((resolve) => {
        // Check if we have a queued transcript
        if (state.transcriptQueue.length > 0) {
          const transcript = state.transcriptQueue.shift()!;
          resolve(transcript);
          return;
        }

        // Check if we have a last transcript (for partial updates)
        if (state.lastTranscript && state.lastTranscript.type === 'partial') {
          resolve(state.lastTranscript);
          return;
        }

        // Add to pending resolvers
        state.pendingResolvers.push(resolve);

        // Timeout after 5 seconds if no response (longer for Deepgram processing)
        setTimeout(() => {
          const index = state.pendingResolvers.indexOf(resolve);
          if (index >= 0) {
            state.pendingResolvers.splice(index, 1);
            // Return last known transcript or empty
            if (state.lastTranscript) {
              resolve(state.lastTranscript);
            } else {
              console.warn(`[DeepgramProvider] ⚠️ Timeout waiting for transcript for ${interactionId}, seq=${seq}`);
              resolve({
                type: 'partial',
                text: '',
                isFinal: false,
              });
            }
          }
        }, 5000);
      });
    } catch (error: any) {
      console.error(`[DeepgramProvider] Error in sendAudioChunk for ${interactionId}:`, error);
      return {
        type: 'partial',
        text: '',
        isFinal: false,
      };
    }
  }

  async close(): Promise<void> {
    // Close all connections
    const closePromises = Array.from(this.connections.values()).map((state) => {
      return new Promise<void>((resolve) => {
        if (state.connection && typeof state.connection.finish === 'function') {
          state.connection.finish();
        }
        resolve();
      });
    });

    await Promise.all(closePromises);
    this.connections.clear();
  }
}


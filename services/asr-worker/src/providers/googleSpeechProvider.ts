/**
 * Google Cloud Speech-to-Text streaming ASR provider
 * Uses Google Cloud Speech-to-Text API for real-time speech recognition
 */

import { SpeechClient, protos } from '@google-cloud/speech';
import { AsrProvider, Transcript } from '../types';

interface PendingSend {
  seq: number;
  sendTime: number;
  audioSize: number;
  chunkSizeMs: number;
}

interface ConnectionState {
  recognizeStream: ReturnType<SpeechClient['streamingRecognize']>;
  isReady: boolean;
  configSent: boolean; // Track if config has been sent
  transcriptQueue: Transcript[];
  pendingResolvers: Array<(transcript: Transcript) => void>;
  lastTranscript: Transcript | null;
  lastSendTime?: number;
  pendingSends: PendingSend[];
  sampleRate: number;
  interactionId: string;
  streamStartTime: number;
  streamTimeout?: NodeJS.Timeout; // Auto-restart stream after 4.5 minutes
}

interface GoogleMetrics {
  connectionsCreated: number;
  connectionsReused: number;
  connectionsClosed: number;
  audioChunksSent: number;
  transcriptsReceived: number;
  emptyTranscriptsReceived: number;
  errors: number;
  streamRestarts: number; // Streams restarted due to 5-minute limit
  averageLatencyMs: number;
  transcriptTimeoutCount: number;
}

export class GoogleSpeechProvider implements AsrProvider {
  private client: SpeechClient;
  private connections: Map<string, ConnectionState> = new Map();
  private connectionCreationLocks: Map<string, Promise<ConnectionState>> = new Map();
  private metrics: GoogleMetrics = {
    connectionsCreated: 0,
    connectionsReused: 0,
    connectionsClosed: 0,
    audioChunksSent: 0,
    transcriptsReceived: 0,
    emptyTranscriptsReceived: 0,
    errors: 0,
    streamRestarts: 0,
    averageLatencyMs: 0,
    transcriptTimeoutCount: 0,
  };

  private readonly projectId?: string;
  private readonly location?: string;
  private readonly model?: string;
  private readonly languageCode: string;

  constructor() {
    // Initialize Google Cloud Speech client
    // Uses GOOGLE_APPLICATION_CREDENTIALS environment variable for auth
    // Read project ID from credentials file if not set in env
    let projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    
    // If project ID not set, try to read from credentials file
    if (!projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const fs = require('fs');
        const creds = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
        projectId = creds.project_id;
      } catch (e) {
        // Ignore errors reading credentials
      }
    }

    this.client = new SpeechClient({
      projectId: projectId,
      // Don't specify apiEndpoint - use default
      // Don't specify fallback - use gRPC
    });

    this.projectId = projectId;
    this.location = process.env.GOOGLE_SPEECH_LOCATION || 'us';
    this.model = process.env.GOOGLE_SPEECH_MODEL || 'latest_long';
    this.languageCode = process.env.GOOGLE_SPEECH_LANGUAGE_CODE || 'en-US';

    console.info('[GoogleSpeechProvider] Initialized', {
      projectId: this.projectId || 'default',
      location: this.location,
      model: this.model,
      languageCode: this.languageCode,
    });
  }

  private async getOrCreateConnection(
    interactionId: string,
    sampleRate: number
  ): Promise<ConnectionState> {
    // Check if connection already exists and is ready
    let state = this.connections.get(interactionId);

    if (state && state.isReady && state.recognizeStream) {
      this.metrics.connectionsReused++;
      console.debug(`[GoogleSpeechProvider] Reusing existing connection for ${interactionId}`);
      return state;
    }

    // If connection exists but not ready, wait for existing creation
    if (this.connectionCreationLocks.has(interactionId)) {
      console.debug(`[GoogleSpeechProvider] Waiting for connection creation for ${interactionId}`);
      return this.connectionCreationLocks.get(interactionId)!;
    }

    // Create new connection
    const connectionPromise = (async (): Promise<ConnectionState> => {
      try {
        // Remove old connection if exists
        if (state) {
          this.closeConnection(interactionId);
        }

        console.info(`[GoogleSpeechProvider] Creating new connection for ${interactionId}`, {
          sampleRate,
          model: this.model,
          languageCode: this.languageCode,
        });

        // Create streaming recognition request
        // CRITICAL FIX: Pass config when creating stream - SDK sends it automatically on first write
        // The SDK's helpers.js waits for 'writing' event, then sends config, then pipes audio
        const recognizeStream = this.client.streamingRecognize({
          config: {
            encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
            sampleRateHertz: sampleRate,
            languageCode: this.languageCode,
            model: this.model,
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets: false,
            audioChannelCount: 1, // Mono
          },
          interimResults: true, // Get partial results
          singleUtterance: false, // Continue streaming
        });

        // Create connection state
        const newState: ConnectionState = {
          recognizeStream,
          isReady: false,
          configSent: false,
          transcriptQueue: [],
          pendingResolvers: [],
          lastTranscript: null,
          pendingSends: [],
          sampleRate,
          interactionId,
          streamStartTime: Date.now(),
        };

        // Set up stream event handlers
        recognizeStream.on('data', (data: protos.google.cloud.speech.v1.StreamingRecognizeResponse) => {
          this.handleStreamData(interactionId, data);
        });

        recognizeStream.on('error', (error: Error) => {
          console.error(`[GoogleSpeechProvider] Stream error for ${interactionId}:`, error);
          this.metrics.errors++;
          this.handleStreamError(interactionId, error);
        });

        recognizeStream.on('end', () => {
          console.info(`[GoogleSpeechProvider] Stream ended for ${interactionId}`);
          // Stream ended - could be normal (5-minute limit) or error
          // If connection still exists, it will be recreated on next send
        });

        // Config is passed when creating stream - SDK handles sending it
        // Mark as sent and wait for stream to be ready
        newState.configSent = true;
        await new Promise<void>((resolve) => setTimeout(resolve, 200));

        newState.isReady = true;

        // Set up stream timeout (restart before 5-minute limit)
        // Google has a 5-minute limit per stream, restart at 4.5 minutes
        const STREAM_MAX_DURATION_MS = 4.5 * 60 * 1000; // 4.5 minutes
        newState.streamTimeout = setTimeout(() => {
          console.info(`[GoogleSpeechProvider] Stream timeout approaching, restarting for ${interactionId}`);
          this.metrics.streamRestarts++;
          this.closeConnection(interactionId);
        }, STREAM_MAX_DURATION_MS);

        this.connections.set(interactionId, newState);
        this.metrics.connectionsCreated++;

        console.info(`[GoogleSpeechProvider] Connection ready for ${interactionId}`);
        return newState;
      } catch (error: any) {
        this.connections.delete(interactionId);
        console.error(`[GoogleSpeechProvider] Failed to create connection for ${interactionId}:`, error);
        throw error;
      } finally {
        this.connectionCreationLocks.delete(interactionId);
      }
    })();

    this.connectionCreationLocks.set(interactionId, connectionPromise);
    return connectionPromise;
  }

  private handleStreamData(
    interactionId: string,
    data: protos.google.cloud.speech.v1.StreamingRecognizeResponse
  ): void {
    const state = this.connections.get(interactionId);
    if (!state) {
      console.warn(`[GoogleSpeechProvider] Received data for unknown interaction: ${interactionId}`);
      return;
    }

    // Process results
    if (data.results && data.results.length > 0) {
      for (const result of data.results) {
        if (result.alternatives && result.alternatives.length > 0) {
          const alternative = result.alternatives[0];
          const transcriptText = alternative.transcript || '';
          const confidence = alternative.confidence || 0;
          const isFinal = result.isFinal || false;

          // Track pending sends for latency calculation
          let processingTime = 0;
          if (state.pendingSends && state.pendingSends.length > 0) {
            const completedSend = state.pendingSends.shift(); // Always remove oldest
            if (completedSend) {
              processingTime = Date.now() - completedSend.sendTime;
              this.metrics.averageLatencyMs =
                (this.metrics.averageLatencyMs * (this.metrics.transcriptsReceived - 1) + processingTime) /
                this.metrics.transcriptsReceived;
            }
          }

          const transcript: Transcript = isFinal
            ? {
                type: 'final',
                text: transcriptText,
                confidence,
                isFinal: true,
              }
            : {
                type: 'partial',
                text: transcriptText,
                confidence,
                isFinal: false,
              };

          this.metrics.transcriptsReceived++;
          if (!transcriptText.trim()) {
            this.metrics.emptyTranscriptsReceived++;
          }

          // Log transcript
          if (transcriptText.trim()) {
            console.info(`[GoogleSpeechProvider] 📝 Transcript (${isFinal ? 'FINAL' : 'PARTIAL'}):`, {
              interactionId,
              text: transcriptText,
              confidence: confidence.toFixed(2),
              isFinal,
              processingTime: processingTime > 0 ? `${processingTime}ms` : 'unknown',
            });
          } else {
            console.debug(`[GoogleSpeechProvider] Empty transcript received`, {
              interactionId,
              isFinal,
              processingTime: processingTime > 0 ? `${processingTime}ms` : 'unknown',
            });
          }

          // Update last transcript
          state.lastTranscript = transcript;

          // Resolve pending resolvers
          if (state.pendingResolvers.length > 0) {
            const resolver = state.pendingResolvers.shift();
            if (resolver) {
              resolver(transcript);
            }
          } else {
            // No pending resolver, queue transcript
            state.transcriptQueue.push(transcript);
          }
        }
      }
    }
  }

  private handleStreamError(interactionId: string, error: Error): void {
    const state = this.connections.get(interactionId);
    if (!state) return;

    // Reject all pending resolvers
    while (state.pendingResolvers.length > 0) {
      const resolver = state.pendingResolvers.shift();
      if (resolver) {
        resolver({
          type: 'partial',
          text: '',
          isFinal: false,
          confidence: 0,
        });
      }
    }

    // Close connection to force recreation on next send
    this.closeConnection(interactionId);
  }

  private closeConnection(interactionId: string): void {
    const state = this.connections.get(interactionId);
    if (!state) return;

    try {
      if (state.streamTimeout) {
        clearTimeout(state.streamTimeout);
      }

      if (state.recognizeStream) {
        state.recognizeStream.destroy();
      }

      // Reject all pending resolvers
      while (state.pendingResolvers.length > 0) {
        const resolver = state.pendingResolvers.shift();
        if (resolver) {
          resolver({
            type: 'partial',
            text: '',
            isFinal: false,
            confidence: 0,
          });
        }
      }

      this.connections.delete(interactionId);
      this.metrics.connectionsClosed++;

      console.info(`[GoogleSpeechProvider] Connection closed for ${interactionId}`);
    } catch (error) {
      console.error(`[GoogleSpeechProvider] Error closing connection for ${interactionId}:`, error);
    }
  }

  async sendAudioChunk(
    audio: Buffer,
    opts: { interactionId: string; seq: number; sampleRate: number }
  ): Promise<Transcript> {
    const { interactionId, sampleRate, seq } = opts;

    try {
      // Get or create connection
      const state = await this.getOrCreateConnection(interactionId, sampleRate);

      // Wait for connection to be ready
      if (!state.isReady) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            clearInterval(checkReady);
            reject(new Error(`Connection not ready after 5 seconds for ${interactionId}`));
          }, 5000);

          const checkReady = setInterval(() => {
            const currentState = this.connections.get(interactionId);
            if (currentState && currentState.isReady) {
              clearInterval(checkReady);
              clearTimeout(timeout);
              resolve();
            } else if (!currentState) {
              clearInterval(checkReady);
              clearTimeout(timeout);
              reject(new Error(`Connection was deleted before ready for ${interactionId}`));
            }
          }, 100);
        });
      }

      const stateToUse = this.connections.get(interactionId);
      if (!stateToUse || !stateToUse.isReady) {
        throw new Error(`Connection not ready after wait for ${interactionId}`);
      }

      // Calculate audio duration
      const bytesPerSample = 2; // 16-bit = 2 bytes
      const samples = audio.length / bytesPerSample;
      const durationMs = (samples / sampleRate) * 1000;

      // Track pending send
      const pendingSend: PendingSend = {
        seq,
        sendTime: Date.now(),
        audioSize: audio.length,
        chunkSizeMs: durationMs,
      };
      stateToUse.pendingSends.push(pendingSend);
      stateToUse.lastSendTime = Date.now();

      // Send audio to Google
      try {
        // CRITICAL FIX: SDK expects raw Buffer, not wrapped in audioContent object
        // The SDK's transform function automatically wraps it: transform(audioBuffer) -> { audioContent: audioBuffer }
        // So we write the raw Buffer directly
        stateToUse.recognizeStream.write(audio);

        this.metrics.audioChunksSent++;

        console.debug(`[GoogleSpeechProvider] 📤 Sent audio chunk:`, {
          interactionId,
          seq,
          size: audio.length,
          durationMs: durationMs.toFixed(2),
          sampleRate,
        });
      } catch (error: any) {
        console.error(`[GoogleSpeechProvider] Error sending audio for ${interactionId}:`, error);
        this.metrics.errors++;
        throw error;
      }

      // Wait for transcript with timeout
      return new Promise<Transcript>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const currentState = this.connections.get(interactionId);
          if (currentState) {
            const index = currentState.pendingResolvers.indexOf(resolve);
            if (index >= 0) {
              currentState.pendingResolvers.splice(index, 1);
            }
          }

          this.metrics.transcriptTimeoutCount++;

          console.warn(`[GoogleSpeechProvider] ⚠️ Transcript timeout for ${interactionId}`, {
            seq,
            timeout: '5s',
          });

          // Return last known transcript or empty
          const lastTranscript = currentState?.lastTranscript || {
            type: 'partial' as const,
            text: '',
            isFinal: false,
            confidence: 0,
          };
          resolve(lastTranscript);
        }, 5000); // 5 second timeout

        // Check if transcript is already queued
        if (stateToUse.transcriptQueue.length > 0) {
          clearTimeout(timeout);
          const transcript = stateToUse.transcriptQueue.shift()!;
          resolve(transcript);
        } else {
          // Add to pending resolvers
          stateToUse.pendingResolvers.push((transcript) => {
            clearTimeout(timeout);
            resolve(transcript);
          });
        }
      });
    } catch (error: any) {
      console.error(`[GoogleSpeechProvider] Error in sendAudioChunk for ${interactionId}:`, error);
      this.metrics.errors++;
      return {
        type: 'partial',
        text: '',
        isFinal: false,
        confidence: 0,
      };
    }
  }

  async close(): Promise<void> {
    console.info('[GoogleSpeechProvider] Closing all connections...');
    
    // Close all connections
    for (const interactionId of this.connections.keys()) {
      this.closeConnection(interactionId);
    }

    // Close client
    await this.client.close();

    // Log metrics
    console.info('[GoogleSpeechProvider] Final metrics:', this.metrics);
  }
}


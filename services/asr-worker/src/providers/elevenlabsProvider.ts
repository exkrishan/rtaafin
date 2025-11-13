/**
 * ElevenLabs streaming ASR provider
 * Uses ElevenLabs Scribe v2 Realtime API for real-time speech recognition
 */

// Polyfill WebSocket for Node.js environment
if (typeof WebSocket === 'undefined') {
  const WebSocket = require('ws');
  (global as any).WebSocket = WebSocket;
}

import { Scribe, AudioFormat, CommitStrategy } from '@elevenlabs/client';
import { AsrProvider, Transcript } from '../types';

interface PendingSend {
  seq: number;
  sendTime: number;
  audioSize: number;
  chunkSizeMs: number;
}

interface ConnectionState {
  connection: any; // Scribe connection
  isReady: boolean;
  transcriptQueue: Transcript[];
  pendingResolvers: Array<(transcript: Transcript) => void>;
  lastTranscript: Transcript | null;
  pendingSends: PendingSend[];
  sampleRate: number;
  interactionId: string;
  streamStartTime: number;
}

interface ElevenLabsMetrics {
  connectionsCreated: number;
  connectionsReused: number;
  connectionsClosed: number;
  audioChunksSent: number;
  transcriptsReceived: number;
  emptyTranscriptsReceived: number;
  errors: number;
  averageLatencyMs: number;
  transcriptTimeoutCount: number;
}

export class ElevenLabsProvider implements AsrProvider {
  private connections: Map<string, ConnectionState> = new Map();
  private connectionCreationLocks: Map<string, Promise<ConnectionState>> = new Map();
  private apiKey: string;
  private model: string;
  private languageCode: string;
  private metrics: ElevenLabsMetrics = {
    connectionsCreated: 0,
    connectionsReused: 0,
    connectionsClosed: 0,
    audioChunksSent: 0,
    transcriptsReceived: 0,
    emptyTranscriptsReceived: 0,
    errors: 0,
    averageLatencyMs: 0,
    transcriptTimeoutCount: 0,
  };

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ELEVENLABS_API_KEY;
    if (!key) {
      throw new Error('ELEVENLABS_API_KEY is required for ElevenLabs provider');
    }

    this.apiKey = key;
    this.model = process.env.ELEVENLABS_MODEL || 'scribe_v2_realtime';
    this.languageCode = process.env.ELEVENLABS_LANGUAGE || 'en';

    console.info('[ElevenLabsProvider] Initialized', {
      model: this.model,
      languageCode: this.languageCode,
    });
  }

  /**
   * Create a single-use token for Scribe realtime API
   * According to ElevenLabs docs, server-side implementations must use single-use tokens
   * Tokens expire after 15 minutes
   */
  private async createSingleUseToken(): Promise<string> {
    try {
      const response = await fetch(
        'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create single-use token: ${response.status} ${errorText}`);
      }

      const data = await response.json() as { token?: string };
      if (!data.token) {
        throw new Error('No token in response from single-use-token endpoint');
      }

      console.info('[ElevenLabsProvider] ✅ Created single-use token (expires in 15 minutes)');
      return data.token;
    } catch (error: any) {
      console.error('[ElevenLabsProvider] ❌ Failed to create single-use token:', error);
      throw new Error(`Failed to create ElevenLabs single-use token: ${error.message}`);
    }
  }

  private async getOrCreateConnection(
    interactionId: string,
    sampleRate: number
  ): Promise<ConnectionState> {
    // Check if connection already exists and is ready
    let state = this.connections.get(interactionId);

    if (state && state.isReady && state.connection) {
      this.metrics.connectionsReused++;
      console.debug(`[ElevenLabsProvider] Reusing existing connection for ${interactionId}`);
      return state;
    }

    // Check if another call is creating a connection
    const existingLock = this.connectionCreationLocks.get(interactionId);
    if (existingLock) {
      console.debug(`[ElevenLabsProvider] Waiting for connection creation in progress for ${interactionId}`);
      try {
        return await existingLock;
      } catch (error: any) {
        // If the other call failed, try to create our own
        state = this.connections.get(interactionId);
        if (state && state.isReady) {
          return state;
        }
        console.warn(`[ElevenLabsProvider] Previous connection creation failed for ${interactionId}, creating new one:`, error.message);
        this.connectionCreationLocks.delete(interactionId);
      }
    }

    // Create a promise that will resolve when connection is ready
    const connectionPromise = (async (): Promise<ConnectionState> => {
      try {
        // Remove old connection if exists
        if (state) {
          this.closeConnection(interactionId);
        }

        console.info(`[ElevenLabsProvider] Creating new connection for ${interactionId}`, {
          sampleRate,
          model: this.model,
          languageCode: this.languageCode,
        });

        // Determine audio format based on sample rate
        // ElevenLabs supports PCM_16000 (16kHz) and PCM_8000 (8kHz)
        let audioFormat: AudioFormat;
        if (sampleRate === 8000) {
          audioFormat = AudioFormat.PCM_8000;
        } else if (sampleRate === 16000) {
          audioFormat = AudioFormat.PCM_16000;
        } else {
          console.warn(`[ElevenLabsProvider] Unsupported sample rate ${sampleRate}, using PCM_16000`);
          audioFormat = AudioFormat.PCM_16000;
          // Adjust sample rate to match format
          sampleRate = 16000;
        }

        // Create single-use token first (required for server-side implementation)
        // According to ElevenLabs docs, never expose API key directly to Scribe.connect()
        console.info(`[ElevenLabsProvider] 🔑 Creating single-use token for ${interactionId}...`);
        const singleUseToken = await this.createSingleUseToken();

        // Create Scribe connection using the single-use token
        console.info(`[ElevenLabsProvider] 🔌 Attempting to connect to ElevenLabs for ${interactionId}`, {
          model: this.model,
          languageCode: this.languageCode,
          audioFormat: audioFormat,
          sampleRate: sampleRate,
        });
        
        let connection;
        try {
          // Use single-use token (not API key) as per ElevenLabs documentation
          connection = Scribe.connect({
            token: singleUseToken,  // Use single-use token, not API key
            modelId: this.model,
            languageCode: this.languageCode,
            audioFormat: audioFormat,
            sampleRate: sampleRate,
            commitStrategy: CommitStrategy.VAD,
            vadSilenceThresholdSecs: parseFloat(process.env.ELEVENLABS_VAD_SILENCE_THRESHOLD || '1.5'),
            vadThreshold: parseFloat(process.env.ELEVENLABS_VAD_THRESHOLD || '0.4'),
            minSpeechDurationMs: parseInt(process.env.ELEVENLABS_MIN_SPEECH_DURATION_MS || '100', 10),
            minSilenceDurationMs: parseInt(process.env.ELEVENLABS_MIN_SILENCE_DURATION_MS || '100', 10),
          });
          console.info(`[ElevenLabsProvider] ✅ Scribe.connect() succeeded for ${interactionId}`);
        } catch (connectError: any) {
          console.error(`[ElevenLabsProvider] ❌ Scribe.connect() failed for ${interactionId}:`, connectError);
          throw new Error(`Failed to create ElevenLabs connection: ${connectError.message}`);
        }

        // Create connection state
        const newState: ConnectionState = {
          connection,
          isReady: false,
          transcriptQueue: [],
          pendingResolvers: [],
          lastTranscript: null,
          pendingSends: [],
          sampleRate,
          interactionId,
          streamStartTime: Date.now(),
        };

        // Set up event handlers
        // ElevenLabs SDK uses RealtimeEvents constants
        const { RealtimeEvents } = require('@elevenlabs/client');
        
        // Wait for WebSocket to open first, then wait for session to start
        const connectionOpenedPromise = new Promise<void>((resolve) => {
          connection.on(RealtimeEvents.OPEN, () => {
            console.info(`[ElevenLabsProvider] ✅ Connection opened for ${interactionId}`);
            resolve();
          });
        });
        
        // Wait for session to start after connection opens
        const sessionStartedPromise = new Promise<void>((resolve) => {
          connection.on(RealtimeEvents.SESSION_STARTED, (data: any) => {
            console.info(`[ElevenLabsProvider] ✅ Session started for ${interactionId}`, data);
            newState.isReady = true;
            resolve();
          });
        });
        
        connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data: any) => {
          this.handleTranscript(interactionId, { ...data, isFinal: false });
        });

        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data: any) => {
          this.handleTranscript(interactionId, { ...data, isFinal: true });
        });

        connection.on(RealtimeEvents.AUTH_ERROR, (error: any) => {
          console.error(`[ElevenLabsProvider] ❌ Authentication error for ${interactionId}:`, error);
          console.error(`[ElevenLabsProvider] API Key (first 10 chars): ${this.apiKey.substring(0, 10)}...`);
          console.error(`[ElevenLabsProvider] Please verify:`);
          console.error(`[ElevenLabsProvider]   1. API key is correct and has Speech-to-Text permissions`);
          console.error(`[ElevenLabsProvider]   2. Single-use token was created successfully`);
          console.error(`[ElevenLabsProvider]   3. Account subscription includes Speech-to-Text access`);
          this.metrics.errors++;
          this.handleConnectionError(interactionId, new Error(`Authentication failed: ${JSON.stringify(error)}`));
        });

        connection.on(RealtimeEvents.ERROR, (error: any) => {
          console.error(`[ElevenLabsProvider] Connection error for ${interactionId}:`, error);
          this.metrics.errors++;
          this.handleConnectionError(interactionId, error instanceof Error ? error : new Error(String(error)));
        });

        connection.on(RealtimeEvents.CLOSE, (event: any) => {
          console.info(`[ElevenLabsProvider] Connection closed for ${interactionId}`, {
            code: event?.code,
            reason: event?.reason,
            wasClean: event?.wasClean,
          });
          this.connections.delete(interactionId);
        });

        // Wait for connection to open first (with timeout)
        try {
          await Promise.race([
            connectionOpenedPromise,
            new Promise<void>((_, reject) => 
              setTimeout(() => reject(new Error('Connection open timeout')), 5000)
            ),
          ]);
          console.info(`[ElevenLabsProvider] ✅ WebSocket connection opened for ${interactionId}`);
        } catch (error: any) {
          console.warn(`[ElevenLabsProvider] ⚠️ Connection open timeout for ${interactionId}:`, error.message);
          throw new Error(`Failed to open ElevenLabs WebSocket connection: ${error.message}`);
        }
        
        // Wait for session to start after connection opens (with timeout)
        try {
          await Promise.race([
            sessionStartedPromise,
            new Promise<void>((_, reject) => 
              setTimeout(() => reject(new Error('Session start timeout')), 10000)
            ),
          ]);
          console.info(`[ElevenLabsProvider] ✅ Session started successfully for ${interactionId}`);
        } catch (error: any) {
          console.warn(`[ElevenLabsProvider] ⚠️ Session start timeout for ${interactionId}:`, error.message);
          // Don't mark as ready if session didn't start - connection won't work
          throw new Error(`Failed to establish ElevenLabs session: ${error.message}`);
        }

        this.metrics.connectionsCreated++;
        this.connections.set(interactionId, newState);

        console.info(`[ElevenLabsProvider] Connection ready for ${interactionId}`);
        return newState;
      } catch (error: any) {
        console.error(`[ElevenLabsProvider] Error creating connection for ${interactionId}:`, error);
        this.metrics.errors++;
        throw error;
      } finally {
        this.connectionCreationLocks.delete(interactionId);
      }
    })();

    this.connectionCreationLocks.set(interactionId, connectionPromise);
    return connectionPromise;
  }

  private handleTranscript(interactionId: string, data: any): void {
    const state = this.connections.get(interactionId);
    if (!state) {
      console.warn(`[ElevenLabsProvider] Received transcript for unknown interaction: ${interactionId}`);
      return;
    }

    this.metrics.transcriptsReceived++;

    try {
      // Extract transcript text and metadata from ElevenLabs response
      // ElevenLabs returns: { text: string, ... } for partial/committed transcripts
      const transcriptText = data.text || '';
      const isFinal = data.isFinal !== undefined ? data.isFinal : false;
      const confidence = data.confidence || 0.9;

      // Track pending sends for latency calculation
      let processingTime = 0;
      if (state.pendingSends && state.pendingSends.length > 0) {
        const completedSend = state.pendingSends.shift(); // Always remove oldest
        if (completedSend) {
          processingTime = Date.now() - completedSend.sendTime;
          if (this.metrics.transcriptsReceived > 0) {
            this.metrics.averageLatencyMs =
              (this.metrics.averageLatencyMs * (this.metrics.transcriptsReceived - 1) + processingTime) /
              this.metrics.transcriptsReceived;
          }
        }
      }

      if (transcriptText && transcriptText.trim().length > 0) {
        const transcript: Transcript = isFinal
          ? {
              type: 'final',
              text: transcriptText.trim(),
              confidence,
              isFinal: true,
            }
          : {
              type: 'partial',
              text: transcriptText.trim(),
              confidence,
              isFinal: false,
            };

        console.info(`[ElevenLabsProvider] 📝 Transcript (${isFinal ? 'FINAL' : 'PARTIAL'}):`, {
          interactionId,
          text: transcriptText.trim(),
          confidence: confidence.toFixed(2),
          isFinal,
          processingTime: processingTime > 0 ? `${processingTime}ms` : 'unknown',
        });

        state.lastTranscript = transcript;

        // Resolve pending promises or queue transcript
        if (state.pendingResolvers.length > 0) {
          const resolver = state.pendingResolvers.shift();
          if (resolver) {
            resolver(transcript);
          }
        } else {
          state.transcriptQueue.push(transcript);
        }
      } else {
        // Empty transcript
        this.metrics.emptyTranscriptsReceived++;

        // Remove corresponding pending send
        if (state.pendingSends && state.pendingSends.length > 0) {
          const completedSend = state.pendingSends.shift();
          if (completedSend) {
            processingTime = Date.now() - completedSend.sendTime;
            console.debug(`[ElevenLabsProvider] Empty transcript received`, {
              interactionId,
              isFinal,
              processingTime: processingTime > 0 ? `${processingTime}ms` : 'unknown',
            });
          }
        }

        // Still resolve pending promises with empty transcript to prevent timeouts
        const emptyTranscript: Transcript = {
          type: isFinal ? 'final' : 'partial',
          text: '',
          isFinal: isFinal as any,
        };

        state.lastTranscript = emptyTranscript;

        if (state.pendingResolvers.length > 0) {
          const resolver = state.pendingResolvers.shift();
          if (resolver) {
            resolver(emptyTranscript);
          }
        }
      }
    } catch (error: any) {
      console.error(`[ElevenLabsProvider] Error processing transcript for ${interactionId}:`, error);
      this.metrics.errors++;
    }
  }

  private handleConnectionError(interactionId: string, error: Error): void {
    console.error(`[ElevenLabsProvider] Connection error for ${interactionId}:`, error.message);
    // Close connection on error - it will be recreated on next send
    this.closeConnection(interactionId).catch((e) => {
      console.error(`[ElevenLabsProvider] Error closing connection after error:`, e);
    });
  }

  async sendAudioChunk(
    audio: Buffer,
    opts: { interactionId: string; seq: number; sampleRate: number }
  ): Promise<Transcript> {
    const { interactionId, seq, sampleRate } = opts;

    // Get or create connection
    const state = await this.getOrCreateConnection(interactionId, sampleRate);

    // Wait for connection to be ready
    if (!state.isReady) {
      // Wait up to 5 seconds for connection to be ready
      const maxWait = 5000;
      const startTime = Date.now();
      while (!state.isReady && (Date.now() - startTime) < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const currentState = this.connections.get(interactionId);
        if (!currentState) {
          throw new Error(`Connection was deleted before ready for ${interactionId}`);
        }
        if (currentState.isReady) {
          break;
        }
      }
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

    // Send audio to ElevenLabs
    // Convert Buffer to base64 and send via connection.send()
    try {
      // Verify connection is actually ready before sending
      if (!stateToUse.connection) {
        throw new Error(`Connection object is null for ${interactionId}`);
      }
      
      // Check if connection has a valid state (ElevenLabs SDK internal check)
      // The SDK will throw "WebSocket is not connected" if not ready
      const audioBase64 = audio.toString('base64');
      
      // Try to send - if it fails, we'll catch and retry connection
      stateToUse.connection.send({
        audioBase64: audioBase64,
        commit: false,
        sampleRate: sampleRate,
      });
      this.metrics.audioChunksSent++;

      console.debug(`[ElevenLabsProvider] 📤 Sent audio chunk:`, {
        interactionId,
        seq,
        size: audio.length,
        durationMs: durationMs.toFixed(2),
        sampleRate,
      });
    } catch (error: any) {
      console.error(`[ElevenLabsProvider] Error sending audio for ${interactionId}:`, error);
      this.metrics.errors++;
      
      // If WebSocket is not connected, close the connection and it will be recreated on next attempt
      if (error.message && error.message.includes('WebSocket is not connected')) {
        console.warn(`[ElevenLabsProvider] ⚠️ WebSocket not connected for ${interactionId}, closing connection for retry`);
        this.closeConnection(interactionId).catch((e) => {
          console.error(`[ElevenLabsProvider] Error closing connection after send failure:`, e);
        });
      }
      
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
        console.warn(`[ElevenLabsProvider] ⚠️ Transcript timeout for ${interactionId}`, {
          seq,
          timeout: '5s',
        });

        // Return empty transcript on timeout
        const emptyTranscript: Transcript = {
          type: 'partial',
          text: '',
          isFinal: false,
        };
        resolve(emptyTranscript);
      }, 5000); // 5 second timeout

      // Check if there's already a queued transcript
      if (stateToUse.transcriptQueue.length > 0) {
        clearTimeout(timeout);
        const transcript = stateToUse.transcriptQueue.shift()!;
        resolve(transcript);
        return;
      }

      // Add resolver to pending list
      stateToUse.pendingResolvers.push((transcript: Transcript) => {
        clearTimeout(timeout);
        resolve(transcript);
      });
    });
  }

  private async closeConnection(interactionId: string): Promise<void> {
    const state = this.connections.get(interactionId);
    if (!state) {
      return;
    }

    try {
      if (state.connection) {
        // Close the connection
        if (typeof state.connection.close === 'function') {
          state.connection.close();
        } else if (typeof state.connection.disconnect === 'function') {
          state.connection.disconnect();
        }
      }
    } catch (error: any) {
      console.error(`[ElevenLabsProvider] Error closing connection for ${interactionId}:`, error);
    } finally {
      this.connections.delete(interactionId);
      this.metrics.connectionsClosed++;
      console.info(`[ElevenLabsProvider] Connection closed for ${interactionId}`);
    }
  }

  async close(): Promise<void> {
    console.info('[ElevenLabsProvider] Closing all connections...');
    const interactionIds = Array.from(this.connections.keys());
    await Promise.all(interactionIds.map((id) => this.closeConnection(id)));

    console.info('[ElevenLabsProvider] Final metrics:', this.metrics);
  }
}


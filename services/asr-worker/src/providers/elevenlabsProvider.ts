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
import { ElevenLabsCircuitBreaker } from '../circuit-breaker';
import { ConnectionHealthMonitor } from '../connection-health-monitor';

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
  private circuitBreaker?: ElevenLabsCircuitBreaker;
  private connectionHealthMonitor?: ConnectionHealthMonitor;
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

  constructor(
    apiKey?: string,
    options?: {
      circuitBreaker?: ElevenLabsCircuitBreaker;
      connectionHealthMonitor?: ConnectionHealthMonitor;
    }
  ) {
    const key = apiKey || process.env.ELEVENLABS_API_KEY;
    if (!key) {
      throw new Error('ELEVENLABS_API_KEY is required for ElevenLabs provider');
    }

    this.apiKey = key;
    this.model = process.env.ELEVENLABS_MODEL || 'scribe_v2_realtime';
    this.languageCode = process.env.ELEVENLABS_LANGUAGE || 'en';
    this.circuitBreaker = options?.circuitBreaker;
    this.connectionHealthMonitor = options?.connectionHealthMonitor;

    console.info('[ElevenLabsProvider] Initialized', {
      model: this.model,
      languageCode: this.languageCode,
      hasCircuitBreaker: !!this.circuitBreaker,
      hasConnectionHealthMonitor: !!this.connectionHealthMonitor,
    });
  }

  /**
   * Create a single-use token for Scribe realtime API
   * According to ElevenLabs docs, server-side implementations must use single-use tokens
   * Tokens expire after 15 minutes
   */
  private async createSingleUseToken(): Promise<string> {
    // Wrap API call with circuit breaker if available
    if (this.circuitBreaker) {
      return await this.circuitBreaker.call(async () => {
        return await this._createSingleUseTokenInternal();
      });
    } else {
      return await this._createSingleUseTokenInternal();
    }
  }

  private async _createSingleUseTokenInternal(): Promise<string> {
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
      // CRITICAL: Check if sample rate matches - if not, recreate connection
      if (state.sampleRate !== sampleRate) {
        console.warn(`[ElevenLabsProvider] ⚠️ Sample rate mismatch for ${interactionId}:`, {
          existingSampleRate: state.sampleRate,
          requestedSampleRate: sampleRate,
          action: 'Closing and recreating connection',
        });
        await this.closeConnection(interactionId);
        state = undefined; // Force recreation
      } else {
        this.metrics.connectionsReused++;
        console.debug(`[ElevenLabsProvider] Reusing existing connection for ${interactionId}`, {
          sampleRate: state.sampleRate,
        });
        return state;
      }
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
            vadSilenceThresholdSecs: parseFloat(process.env.ELEVENLABS_VAD_SILENCE_THRESHOLD || '1.0'), // Tuned for telephony
            vadThreshold: parseFloat(process.env.ELEVENLABS_VAD_THRESHOLD || '0.4'),
            minSpeechDurationMs: parseInt(process.env.ELEVENLABS_MIN_SPEECH_DURATION_MS || '100', 10), // Ensure enough audio
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
        
        // Debug: Log all events to understand what ElevenLabs is sending
        const allEventNames = Object.keys(RealtimeEvents).filter(key => 
          typeof RealtimeEvents[key] === 'string'
        );
        console.debug(`[ElevenLabsProvider] Available RealtimeEvents:`, allEventNames);
        
        // Listen to all events for debugging
        allEventNames.forEach(eventName => {
          const eventValue = RealtimeEvents[eventName];
          if (eventValue && eventValue !== RealtimeEvents.PARTIAL_TRANSCRIPT && 
              eventValue !== RealtimeEvents.COMMITTED_TRANSCRIPT &&
              eventValue !== RealtimeEvents.OPEN &&
              eventValue !== RealtimeEvents.SESSION_STARTED &&
              eventValue !== RealtimeEvents.AUTH_ERROR &&
              eventValue !== RealtimeEvents.ERROR &&
              eventValue !== RealtimeEvents.CLOSE) {
            connection.on(eventValue, (data: any) => {
              console.debug(`[ElevenLabsProvider] 🔔 Received ${eventName} event for ${interactionId}:`, {
                event: eventName,
                hasData: !!data,
                dataType: typeof data,
                dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
              });
            });
          }
        });
        
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
            
            // Update connection state in health monitor if available
            if (this.connectionHealthMonitor) {
              this.connectionHealthMonitor.updateConnectionHealth(interactionId, true);
            }
            
            resolve();
          });
        });
        
        connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data: any) => {
          console.info(`[ElevenLabsProvider] 📨 Received PARTIAL_TRANSCRIPT event for ${interactionId}:`, {
            hasTranscript: !!data.transcript,
            hasText: !!data.text, // Legacy support
            transcriptLength: data.transcript?.length || 0,
            textLength: data.text?.length || 0,
            transcriptPreview: data.transcript ? data.transcript.substring(0, 50) : (data.text ? data.text.substring(0, 50) : '(empty)'),
            dataKeys: Object.keys(data),
          });
          this.handleTranscript(interactionId, { ...data, isFinal: false });
        });

        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data: any) => {
          console.info(`[ElevenLabsProvider] 📨 Received COMMITTED_TRANSCRIPT event for ${interactionId}:`, {
            hasTranscript: !!data.transcript,
            hasText: !!data.text, // Legacy support
            transcriptLength: data.transcript?.length || 0,
            textLength: data.text?.length || 0,
            transcriptPreview: data.transcript ? data.transcript.substring(0, 50) : (data.text ? data.text.substring(0, 50) : '(empty)'),
            dataKeys: Object.keys(data),
          });
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
          
          // Update connection health as unhealthy
          if (this.connectionHealthMonitor) {
            this.connectionHealthMonitor.updateConnectionHealth(interactionId, false);
          }
          
          this.handleConnectionError(interactionId, new Error(`Authentication failed: ${JSON.stringify(error)}`));
        });

        connection.on(RealtimeEvents.ERROR, (error: any) => {
          console.error(`[ElevenLabsProvider] Connection error for ${interactionId}:`, error);
          this.metrics.errors++;
          
          // Update connection health as unhealthy
          if (this.connectionHealthMonitor) {
            this.connectionHealthMonitor.updateConnectionHealth(interactionId, false);
            this.connectionHealthMonitor.incrementReconnectAttempts(interactionId);
          }
          
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

        // CRITICAL DEBUG: Listen to ALL events via raw WebSocket messages to see what's actually being sent
        // This helps debug if events aren't being received
        if (connection._websocket || (connection as any).websocket) {
          const ws = connection._websocket || (connection as any).websocket;
          if (ws && typeof ws.addEventListener === 'function') {
            ws.addEventListener('message', (event: MessageEvent) => {
              try {
                const data = JSON.parse(event.data);
                console.info(`[ElevenLabsProvider] 🔍 RAW WebSocket message received for ${interactionId}:`, {
                  messageType: data.message_type || data.type || 'unknown',
                  hasTranscript: !!data.transcript,
                  hasText: !!data.text,
                  allKeys: Object.keys(data),
                  dataPreview: JSON.stringify(data).substring(0, 200),
                });
              } catch (e) {
                console.debug(`[ElevenLabsProvider] Raw WebSocket message (non-JSON) for ${interactionId}:`, event.data?.substring?.(0, 100));
              }
            });
          }
        }

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

        // Track connection in health monitor if available
        if (this.connectionHealthMonitor) {
          // Get the underlying WebSocket from the SDK connection
          const ws = connection._websocket || (connection as any).websocket;
          if (ws) {
            this.connectionHealthMonitor.trackConnection(interactionId, ws);
            console.debug(`[ElevenLabsProvider] 📡 Connection tracked in health monitor for ${interactionId}`);
          }
        }

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
      // ElevenLabs SDK returns: { transcript: string, ... } for partial/committed transcripts
      // According to SDK docs: data.transcript (not data.text)
      const transcriptText = data.transcript || data.text || '';
      const isFinal = data.isFinal !== undefined ? data.isFinal : false;
      const confidence = data.confidence || 0.9;
      
      // Debug: Log the actual data structure to verify
      console.debug(`[ElevenLabsProvider] 📋 Transcript event data structure:`, {
        interactionId,
        hasTranscript: !!data.transcript,
        hasText: !!data.text,
        transcriptLength: data.transcript?.length || 0,
        textLength: data.text?.length || 0,
        allKeys: Object.keys(data),
        transcriptPreview: data.transcript ? data.transcript.substring(0, 50) : '(none)',
        textPreview: data.text ? data.text.substring(0, 50) : '(none)',
      });

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
        // Empty transcript - common causes and troubleshooting
        this.metrics.emptyTranscriptsReceived++;

        // Remove corresponding pending send
        let completedSend: PendingSend | undefined;
        if (state.pendingSends && state.pendingSends.length > 0) {
          completedSend = state.pendingSends.shift();
          if (completedSend) {
            processingTime = Date.now() - completedSend.sendTime;
          }
        }

        // Enhanced debugging for empty transcripts (based on troubleshooting guide)
        // Use pending send seq if available, otherwise use connection metrics
        const pendingSendSeq = completedSend?.seq || (state.pendingSends.length > 0 ? state.pendingSends[0].seq : 'unknown');
        const logLevel = (typeof pendingSendSeq === 'number' && pendingSendSeq <= 10) ? 'warn' : 'debug';
        const logFn = logLevel === 'warn' ? console.warn : console.debug;
        logFn(`[ElevenLabsProvider] ⚠️ Empty transcript received - troubleshooting info:`, {
          interactionId,
          seq: pendingSendSeq,
          isFinal,
          processingTime: processingTime > 0 ? `${processingTime}ms` : 'unknown',
          hasData: !!data,
          dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
          hasTranscript: !!data.transcript,
          hasText: !!data.text,
          transcriptLength: data.transcript?.length || 0,
          textLength: data.text?.length || 0,
          audioChunkSize: completedSend?.audioSize || 'unknown',
          audioChunkDurationMs: completedSend?.chunkSizeMs?.toFixed(2) || 'unknown',
          connectionSampleRate: state.sampleRate,
          connectionReady: state.isReady,
          troubleshooting: {
            commonCauses: [
              'Audio format mismatch (not PCM16)',
              'Sample rate mismatch',
              'Audio is silence',
              'Chunk size too small',
              'Base64 encoding issue',
              'Authentication error',
              'Commit strategy issue',
            ],
            checkLogs: [
              'Look for "Audio format validation failed" errors',
              'Check for "Sample rate mismatch" warnings',
              'Verify "Audio appears to be silence" warnings',
              'Check for "Audio chunk smaller than recommended" warnings',
              'Verify connection sample rate matches audio sample rate',
              'Check if audio contains actual speech (not silence)',
            ],
          },
        });

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

  /**
   * Amplify low-energy telephony audio to improve transcription quality
   * Telephony audio (8kHz) often has lower energy levels that can be improved with amplification
   */
  private amplifyTelephonyAudio(audio: Buffer, sampleRate: number): Buffer {
    // Only amplify 8kHz telephony audio
    if (sampleRate !== 8000) {
      return audio;
    }

    // Check if amplification is enabled (default: true for telephony)
    const amplifyEnabled = process.env.ELEVENLABS_AMPLIFY_TELEPHONY !== 'false';
    if (!amplifyEnabled) {
      return audio;
    }

    // Amplification factor (default: 2x for telephony)
    const amplificationFactor = parseFloat(process.env.ELEVENLABS_AMPLIFICATION_FACTOR || '2.0');

    // Convert Buffer to Int16Array for processing
    const samples = new Int16Array(audio.length / 2);
    const dataView = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);

    // Read samples as little-endian signed 16-bit integers
    for (let i = 0; i < samples.length; i++) {
      const sample = dataView.getInt16(i * 2, true); // little-endian
      
      // Amplify the sample
      const amplified = Math.round(sample * amplificationFactor);
      
      // Clamp to PCM16 range [-32768, 32767]
      samples[i] = Math.max(-32768, Math.min(32767, amplified));
    }

    // Convert back to Buffer
    return Buffer.from(samples.buffer);
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
    // CRITICAL: Correct calculation for PCM16 audio
    // Formula: durationMs = (bytes / bytesPerSample / sampleRate) * 1000
    // For 16-bit PCM: bytesPerSample = 2
    // Example: 640 bytes at 16kHz = (640 / 2 / 16000) * 1000 = 20ms
    const BYTES_PER_SAMPLE = 2; // 16-bit PCM = 2 bytes per sample
    const samples = audio.length / BYTES_PER_SAMPLE;
    const durationMs = (samples / sampleRate) * 1000;
    
    // Log duration calculation for debugging
    if (seq <= 5) {
      console.info(`[ElevenLabsProvider] ⏱️ Audio duration calculation:`, {
        interactionId,
        seq,
        bufferSize: audio.length,
        sampleRate,
        samples: samples.toFixed(0),
        durationMs: durationMs.toFixed(2),
        expectedFor16kHz: sampleRate === 16000 ? `${(audio.length / 2 / 16000 * 1000).toFixed(2)}ms` : 'N/A',
        expectedFor8kHz: sampleRate === 8000 ? `${(audio.length / 2 / 8000 * 1000).toFixed(2)}ms` : 'N/A',
      });
    }

    // CRITICAL FIX: Amplify low-energy telephony audio before validation
    // This improves transcription quality for 8kHz telephony audio
    let processedAudio = audio;
    if (sampleRate === 8000) {
      processedAudio = this.amplifyTelephonyAudio(audio, sampleRate);
      
      // Log amplification if audio was actually amplified
      if (processedAudio !== audio && seq <= 5) {
        console.info(`[ElevenLabsProvider] 🔊 Amplified 8kHz telephony audio`, {
          interactionId,
          seq,
          originalLength: audio.length,
          amplifiedLength: processedAudio.length,
          amplificationFactor: process.env.ELEVENLABS_AMPLIFICATION_FACTOR || '2.0',
        });
      }
    }

    // Use processed audio for all subsequent operations
    audio = processedAudio;

    // COMPREHENSIVE PRE-SEND VALIDATION (Based on ElevenLabs troubleshooting guide)
    // Validate audio format and quality before sending to prevent empty transcripts
    
    // 1. Validate audio buffer is not empty
    if (audio.length === 0) {
      console.error(`[ElevenLabsProvider] ❌ Empty audio buffer - cannot send to ElevenLabs`, {
        interactionId,
        seq,
        note: 'Empty audio will result in empty transcripts. Check audio source.',
      });
      throw new Error(`Empty audio buffer for ${interactionId}, seq ${seq}`);
    }

    // 2. Validate minimum chunk size (recommended: 4096-8192 bytes for optimal performance)
    const MIN_RECOMMENDED_CHUNK_SIZE = 4096;
    const OPTIMAL_CHUNK_SIZE = 8192;
    if (audio.length < MIN_RECOMMENDED_CHUNK_SIZE && seq > 1) {
      console.warn(`[ElevenLabsProvider] ⚠️ Audio chunk smaller than recommended size`, {
        interactionId,
        seq,
        chunkSize: audio.length,
        recommendedMin: MIN_RECOMMENDED_CHUNK_SIZE,
        optimal: OPTIMAL_CHUNK_SIZE,
        durationMs: durationMs.toFixed(2),
        note: 'ElevenLabs recommends 4096-8192 bytes chunks for optimal performance. Smaller chunks may cause latency.',
      });
    }

    // 3. Validate PCM16 format and calculate audio quality metrics
    let audioEnergy = 0;
    let maxAmplitude = 0;
    let minAmplitude = 0;
    let validSamples = 0;
    let invalidSamples = 0;
    let allZeros = true;
    const sampleCount = Math.min(100, Math.floor(audio.length / 2)); // Check first 100 samples
    
    if (audio.length >= 2) {
      const sampleValues: number[] = [];
      
      for (let i = 0; i < sampleCount; i++) {
        const offset = i * 2;
        if (offset + 1 >= audio.length) break;
        
        // Read as little-endian signed 16-bit integer
        const sample = (audio[offset] | (audio[offset + 1] << 8)) << 16 >> 16;
        sampleValues.push(sample);
        
        // Validate range: PCM16 should be in range [-32768, 32767]
        if (sample >= -32768 && sample <= 32767) {
          validSamples++;
          if (sample !== 0) allZeros = false;
        } else {
          invalidSamples++;
        }
      }
      
      // Calculate RMS (Root Mean Square) energy for audio quality check
      if (sampleValues.length > 0) {
        const sumSquares = sampleValues.reduce((sum, val) => sum + (val * val), 0);
        audioEnergy = Math.sqrt(sumSquares / sampleValues.length);
        maxAmplitude = Math.max(...sampleValues.map(Math.abs));
        minAmplitude = Math.min(...sampleValues.map(Math.abs));
      }
      
      // 4. Check for invalid PCM16 format
      if (invalidSamples > 0 && seq <= 5) {
        console.error(`[ElevenLabsProvider] ❌ CRITICAL: Audio format validation failed - not valid PCM16!`, {
          interactionId,
          seq,
          validSamples,
          invalidSamples,
          totalChecked: sampleCount,
          note: 'Audio may not be PCM16 format. Expected 16-bit signed integers in range [-32768, 32767]. This will cause empty transcripts.',
        });
        // Don't throw - allow it to proceed but log the issue
      }
    }

    // 5. Check for silence (common cause of empty transcripts)
    // CRITICAL FIX: Telephony-specific thresholds - 8kHz audio has much lower energy
    // Lower thresholds to prevent false silence detection for telephony audio
    // FIXED: Lowered thresholds further (10/10) to allow low-energy telephony audio to pass through
    const SILENCE_THRESHOLD_8KHZ = 10;   // Very low for 8kHz telephony (was 25, original was 50)
    const SILENCE_THRESHOLD_16KHZ = 100; // Standard threshold for 16kHz audio
    const SILENCE_THRESHOLD = sampleRate === 8000 ? SILENCE_THRESHOLD_8KHZ : SILENCE_THRESHOLD_16KHZ;
    
    // For 8kHz telephony, use much lower amplitude thresholds
    // FIXED: Lowered to 10 to allow low-amplitude telephony audio (16-32 range) to pass through
    const MIN_AMPLITUDE_8KHZ = 10;   // Very low for 8kHz telephony (was 50, original was 500)
    const MIN_AMPLITUDE_16KHZ = 1000; // Standard threshold for 16kHz
    const MIN_AMPLITUDE = sampleRate === 8000 ? MIN_AMPLITUDE_8KHZ : MIN_AMPLITUDE_16KHZ;
    
    const isSilence = allZeros || audioEnergy < SILENCE_THRESHOLD || maxAmplitude < MIN_AMPLITUDE;
    
    // CRITICAL FIX: Skip sending silence to ElevenLabs - it will return empty transcripts
    if (isSilence) {
      const logLevel = seq <= 5 ? 'warn' : 'debug';
      const logFn = logLevel === 'warn' ? console.warn : console.debug;
      logFn(`[ElevenLabsProvider] ⏸️ Skipping silence - not sending to ElevenLabs`, {
        interactionId,
        seq,
        sampleRate,
        audioEnergy: audioEnergy.toFixed(2),
        maxAmplitude,
        allZeros,
        silenceThreshold: SILENCE_THRESHOLD,
        minAmplitude: MIN_AMPLITUDE,
        durationMs: durationMs.toFixed(2),
        note: sampleRate === 8000 
          ? '8kHz telephony audio detected as silence. Lower thresholds applied. Skipping send to prevent empty transcripts.'
          : 'Audio detected as silence. Skipping send to prevent empty transcripts.',
      });
      
      // Return empty transcript immediately - don't send silence to ElevenLabs
      // This prevents wasting API calls and getting empty transcripts
      return {
        type: 'partial',
        text: '',
        isFinal: false,
      };
    }

    // 6. Log audio quality metrics for debugging (first few chunks)
    if (seq <= 5) {
      console.debug(`[ElevenLabsProvider] 📊 Audio quality metrics before sending:`, {
        interactionId,
        seq,
        audioLength: audio.length,
        durationMs: durationMs.toFixed(2),
        sampleRate,
        samples: samples.toFixed(0),
        audioEnergy: audioEnergy.toFixed(2),
        maxAmplitude,
        minAmplitude,
        validSamples,
        invalidSamples,
        isSilence,
        chunkSizeRecommendation: audio.length < MIN_RECOMMENDED_CHUNK_SIZE ? 'TOO_SMALL' : 
                                 audio.length > OPTIMAL_CHUNK_SIZE ? 'TOO_LARGE' : 'OPTIMAL',
      });
    }

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
      
      // 7. Validate base64 encoding (required for WebSocket transmission)
      const audioBase64 = audio.toString('base64');
      
      if (!audioBase64 || audioBase64.length === 0) {
        console.error(`[ElevenLabsProvider] ❌ CRITICAL: Base64 encoding failed - empty result`, {
          interactionId,
          seq,
          audioLength: audio.length,
          note: 'Base64 encoding is required for WebSocket transmission. This will cause empty transcripts.',
        });
        throw new Error(`Base64 encoding failed for ${interactionId}, seq ${seq}`);
      }
      
      // Validate base64 format (should only contain valid base64 characters)
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(audioBase64)) {
        console.error(`[ElevenLabsProvider] ❌ CRITICAL: Invalid base64 format`, {
          interactionId,
          seq,
          base64Length: audioBase64.length,
          base64Preview: audioBase64.substring(0, 50),
          note: 'Base64 encoding must only contain valid base64 characters. This will cause empty transcripts.',
        });
        throw new Error(`Invalid base64 format for ${interactionId}, seq ${seq}`);
      }
      
      // CRITICAL: Verify sample rate matches connection sample rate
      if (stateToUse.sampleRate !== sampleRate) {
        console.error(`[ElevenLabsProvider] ❌ CRITICAL: Sample rate mismatch when sending audio!`, {
          interactionId,
          connectionSampleRate: stateToUse.sampleRate,
          audioSampleRate: sampleRate,
          seq,
          note: 'This will cause ElevenLabs to not process audio correctly. Closing connection to recreate.',
        });
        await this.closeConnection(interactionId);
        throw new Error(`Sample rate mismatch: connection=${stateToUse.sampleRate}Hz, audio=${sampleRate}Hz`);
      }
      
      // 8. Create send payload (required fields per ElevenLabs troubleshooting guide)
      // CRITICAL: sample_rate field is REQUIRED - missing it causes empty transcripts
      const sendPayload = {
        audioBase64: audioBase64,
        commit: false,
        sampleRate: sampleRate, // REQUIRED: Must match connection sampleRate
      };
      
      // Validate payload has all required fields
      if (!sendPayload.sampleRate) {
        console.error(`[ElevenLabsProvider] ❌ CRITICAL: Missing sample_rate in send payload!`, {
          interactionId,
          seq,
          payload: sendPayload,
          note: 'sample_rate field is REQUIRED. Missing it will cause empty transcripts.',
        });
        throw new Error(`Missing sample_rate in send payload for ${interactionId}, seq ${seq}`);
      }
      
      stateToUse.connection.send(sendPayload);
      this.metrics.audioChunksSent++;

      console.info(`[ElevenLabsProvider] 📤 Sent audio chunk to ElevenLabs:`, {
        interactionId,
        seq,
        size: audio.length,
        durationMs: durationMs.toFixed(2),
        sampleRate,
        connectionSampleRate: stateToUse.sampleRate,
        sampleRateMatch: stateToUse.sampleRate === sampleRate,
        base64Length: audioBase64.length,
        hasConnection: !!stateToUse.connection,
        connectionReady: stateToUse.isReady,
        pendingResolvers: stateToUse.pendingResolvers.length,
        queuedTranscripts: stateToUse.transcriptQueue.length,
        payloadFields: {
          hasAudioBase64: !!sendPayload.audioBase64,
          hasSampleRate: !!sendPayload.sampleRate,
          commit: sendPayload.commit,
        },
        audioQuality: {
          energy: audioEnergy.toFixed(2),
          maxAmplitude,
          isSilence,
        },
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
      
      // Untrack connection in health monitor if available
      if (this.connectionHealthMonitor) {
        this.connectionHealthMonitor.untrackConnection(interactionId);
      }
      
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


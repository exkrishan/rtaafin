/**
 * Azure Speech SDK provider for real-time speech recognition
 * Uses Azure Cognitive Services Speech-to-Text with continuous recognition
 * 
 * Key Features:
 * - Continuous recognition (no manual commits)
 * - Event-driven architecture (recognizing, recognized events)
 * - Push audio stream (write chunks immediately)
 * - Multi-language support with configurable settings
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { AsrProvider, Transcript } from '../types';
import { ElevenLabsCircuitBreaker } from '../circuit-breaker';
import { ConnectionHealthMonitor } from '../connection-health-monitor';

interface RecognizerState {
  recognizer: sdk.SpeechRecognizer;
  audioStream: sdk.PushAudioInputStream;
  isReady: boolean;
  interactionId: string;
  sampleRate: number;
  sessionStartTime: number;
  lastTranscriptTime: number;
  audioChunksSent: number;
  transcriptsReceived: number;
  bytesSent: number;
}

interface AzureMetrics {
  connectionsCreated: number;
  connectionsClosed: number;
  audioChunksSent: number;
  transcriptsReceived: number;
  emptyTranscriptsReceived: number;
  partialTranscriptsReceived: number;
  finalTranscriptsReceived: number;
  errors: number;
  sessionsCanceled: number;
  averageLatencyMs: number;
  totalBytesSent: number;
  averageSessionDurationMs: number;
  latencySamples: number[];
}

export class AzureSpeechProvider implements AsrProvider {
  private recognizers: Map<string, RecognizerState> = new Map();
  private connectionCreationLocks: Map<string, Promise<RecognizerState>> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  
  private subscriptionKey: string;
  private region: string;
  private language: string;
  private enableDictation: boolean;
  
  private circuitBreaker?: ElevenLabsCircuitBreaker;
  private connectionHealthMonitor?: ConnectionHealthMonitor;
  private transcriptCallback?: (transcript: Transcript, interactionId: string, seq: number) => void;
  
  private metrics: AzureMetrics = {
    connectionsCreated: 0,
    connectionsClosed: 0,
    audioChunksSent: 0,
    transcriptsReceived: 0,
    emptyTranscriptsReceived: 0,
    partialTranscriptsReceived: 0,
    finalTranscriptsReceived: 0,
    errors: 0,
    sessionsCanceled: 0,
    averageLatencyMs: 0,
    totalBytesSent: 0,
    averageSessionDurationMs: 0,
    latencySamples: [],
  };

  constructor(
    subscriptionKey: string,
    region: string,
    options?: {
      circuitBreaker?: ElevenLabsCircuitBreaker;
      connectionHealthMonitor?: ConnectionHealthMonitor;
    }
  ) {
    if (!subscriptionKey || !region) {
      throw new Error('AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required for Azure Speech provider');
    }

    this.subscriptionKey = subscriptionKey;
    this.region = region;
    this.language = process.env.AZURE_SPEECH_LANGUAGE || 'en-US';
    this.enableDictation = process.env.AZURE_SPEECH_ENABLE_DICTATION !== 'false';
    this.circuitBreaker = options?.circuitBreaker;
    this.connectionHealthMonitor = options?.connectionHealthMonitor;

    console.info('[AzureSpeechProvider] Initialized', {
      region: this.region,
      language: this.language,
      enableDictation: this.enableDictation,
      hasCircuitBreaker: !!this.circuitBreaker,
      hasConnectionHealthMonitor: !!this.connectionHealthMonitor,
    });
  }

  /**
   * Set callback for async transcript delivery (event-driven pattern)
   */
  setTranscriptCallback(callback: (transcript: Transcript, interactionId: string, seq: number) => void): void {
    this.transcriptCallback = callback;
    console.info('[AzureSpeechProvider] ✅ Transcript callback registered', {
      hasCallback: !!callback,
      note: 'Transcripts will be delivered via callback when recognition events fire',
    });
  }

  /**
   * Get or create recognizer for an interaction
   */
  private async getOrCreateRecognizer(
    interactionId: string,
    sampleRate: number
  ): Promise<RecognizerState> {
    // Check if recognizer already exists
    let state = this.recognizers.get(interactionId);
    
    if (state && state.isReady) {
      // Verify sample rate matches
      if (state.sampleRate !== sampleRate) {
        console.warn('[AzureSpeechProvider] Sample rate mismatch, recreating recognizer', {
          interactionId,
          existingSampleRate: state.sampleRate,
          requestedSampleRate: sampleRate,
        });
        await this.closeRecognizer(interactionId);
        state = undefined;
      } else {
        console.debug('[AzureSpeechProvider] Reusing existing recognizer', {
          interactionId,
          sampleRate,
        });
        return state;
      }
    }

    // Check if creation is already in progress (prevent duplicate connections)
    const existingLock = this.connectionCreationLocks.get(interactionId);
    if (existingLock) {
      console.debug('[AzureSpeechProvider] Waiting for existing recognizer creation', {
        interactionId,
      });
      return await existingLock;
    }

    // Create new recognizer with promise lock
    const creationPromise = this._createRecognizerInternal(interactionId, sampleRate);
    this.connectionCreationLocks.set(interactionId, creationPromise);

    try {
      const newState = await creationPromise;
      this.connectionCreationLocks.delete(interactionId);
      return newState;
    } catch (error) {
      this.connectionCreationLocks.delete(interactionId);
      throw error;
    }
  }

  /**
   * Internal method to create recognizer (wrapped by lock)
   */
  private async _createRecognizerInternal(
    interactionId: string,
    sampleRate: number
  ): Promise<RecognizerState> {
    console.info('[AzureSpeechProvider] 🔌 Creating recognizer', {
      interactionId,
      sampleRate,
      language: this.language,
    });

    try {
      // Create speech config
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        this.subscriptionKey,
        this.region
      );
      
      speechConfig.speechRecognitionLanguage = this.language;
      
      // Enable dictation mode for better punctuation and formatting
      if (this.enableDictation) {
        speechConfig.enableDictation();
      }

      // Create push audio stream
      // Azure expects audio format to be specified
      const audioFormat = sdk.AudioStreamFormat.getWaveFormatPCM(
        sampleRate,
        16, // 16-bit
        1   // mono
      );
      
      const audioStream = sdk.AudioInputStream.createPushStream(audioFormat);
      const audioConfig = sdk.AudioConfig.fromStreamInput(audioStream);

      // Create recognizer
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      // Create state object
      const state: RecognizerState = {
        recognizer,
        audioStream,
        isReady: false,
        interactionId,
        sampleRate,
        sessionStartTime: Date.now(),
        lastTranscriptTime: 0,
        audioChunksSent: 0,
        transcriptsReceived: 0,
        bytesSent: 0,
      };

      // Set up event handlers
      this.setupEventHandlers(recognizer, state);

      // Start continuous recognition
      await new Promise<void>((resolve, reject) => {
        recognizer.startContinuousRecognitionAsync(
          () => {
            state.isReady = true;
            this.metrics.connectionsCreated++;
            console.info('[AzureSpeechProvider] ✅ Continuous recognition started', {
              interactionId,
              sampleRate,
              language: this.language,
            });
            resolve();
          },
          (error) => {
            this.metrics.errors++;
            console.error('[AzureSpeechProvider] ❌ Failed to start recognition', {
              interactionId,
              error: error,
            });
            reject(new Error(`Failed to start Azure recognition: ${error}`));
          }
        );
      });

      // Store state
      this.recognizers.set(interactionId, state);

      // Track with connection health monitor
      if (this.connectionHealthMonitor) {
        this.connectionHealthMonitor.trackConnection(interactionId, {
          createdAt: Date.now(),
          lastPongTime: Date.now(),
          isHealthy: true,
        });
      }

      return state;
    } catch (error: any) {
      this.metrics.errors++;
      console.error('[AzureSpeechProvider] ❌ Error creating recognizer', {
        interactionId,
        error: error.message || String(error),
      });
      throw error;
    }
  }

  /**
   * Set up Azure Speech SDK event handlers
   */
  private setupEventHandlers(
    recognizer: sdk.SpeechRecognizer,
    state: RecognizerState
  ): void {
    const { interactionId } = state;

    // Recognizing event: Partial/interim transcripts
    recognizer.recognizing = (s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
        const text = e.result.text;
        const offset = e.result.offset;
        const duration = e.result.duration;

        state.lastTranscriptTime = Date.now();
        state.transcriptsReceived++;
        this.metrics.partialTranscriptsReceived++;
        this.metrics.transcriptsReceived++;

        if (!text || text.trim().length === 0) {
          this.metrics.emptyTranscriptsReceived++;
          return; // Skip empty partials
        }

        console.debug('[AzureSpeechProvider] 🎤 Recognizing (partial)', {
          interactionId,
          text: text.substring(0, 100),
          textLength: text.length,
          offset,
          duration,
        });

        // Call transcript callback if set
        if (this.transcriptCallback) {
          const transcript: Transcript = {
            type: 'partial',
            text: text,
            isFinal: false,
            confidence: undefined, // Azure doesn't provide confidence for partial
          };
          
          const seq = Math.floor(Date.now() / 1000);
          this.transcriptCallback(transcript, interactionId, seq);
        }
      }
    };

    // Recognized event: Final transcripts
    recognizer.recognized = (s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const text = e.result.text;
        const offset = e.result.offset;
        const duration = e.result.duration;

        state.lastTranscriptTime = Date.now();
        state.transcriptsReceived++;
        this.metrics.finalTranscriptsReceived++;
        this.metrics.transcriptsReceived++;

        // Calculate latency
        const latencyMs = Date.now() - state.sessionStartTime;
        this.metrics.latencySamples.push(latencyMs);
        if (this.metrics.latencySamples.length > 100) {
          this.metrics.latencySamples.shift(); // Keep last 100 samples
        }
        this.metrics.averageLatencyMs = 
          this.metrics.latencySamples.reduce((sum, l) => sum + l, 0) / this.metrics.latencySamples.length;

        if (!text || text.trim().length === 0) {
          this.metrics.emptyTranscriptsReceived++;
          console.debug('[AzureSpeechProvider] ⚠️ Empty final transcript', {
            interactionId,
            offset,
            duration,
          });
          return; // Skip empty finals
        }

        console.info('[AzureSpeechProvider] ✅ Recognized (final)', {
          interactionId,
          text: text.substring(0, 100),
          textLength: text.length,
          offset,
          duration,
          latencyMs,
        });

        // Call transcript callback if set
        if (this.transcriptCallback) {
          const transcript: Transcript = {
            type: 'final',
            text: text,
            isFinal: true,
            confidence: undefined, // Azure provides confidence in result.properties if needed
          };
          
          const seq = Math.floor(Date.now() / 1000);
          this.transcriptCallback(transcript, interactionId, seq);
        }
      } else if (e.result.reason === sdk.ResultReason.NoMatch) {
        console.debug('[AzureSpeechProvider] ℹ️ No speech detected', {
          interactionId,
          reason: 'NoMatch',
        });
      }
    };

    // Canceled event: Errors and session issues
    recognizer.canceled = (s, e) => {
      this.metrics.sessionsCanceled++;
      
      const errorDetails = e.errorDetails;
      const reason = sdk.CancellationReason[e.reason];

      console.error('[AzureSpeechProvider] ❌ Recognition canceled', {
        interactionId,
        reason,
        errorDetails,
        errorCode: e.errorCode,
      });

      // Handle specific error cases
      if (e.reason === sdk.CancellationReason.Error) {
        this.metrics.errors++;
        
        // Check for authentication errors
        if (errorDetails?.includes('401') || errorDetails?.includes('Unauthorized')) {
          console.error('[AzureSpeechProvider] ❌ Authentication error - check AZURE_SPEECH_KEY', {
            interactionId,
            errorDetails,
          });
        }
        
        // Check for quota exceeded
        if (errorDetails?.includes('quota') || errorDetails?.includes('429')) {
          console.error('[AzureSpeechProvider] ❌ Quota exceeded', {
            interactionId,
            errorDetails,
          });
        }

        // Attempt reconnection if not a permanent error
        const reconnectAttempts = this.reconnectAttempts.get(interactionId) || 0;
        if (reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts.set(interactionId, reconnectAttempts + 1);
          console.warn('[AzureSpeechProvider] 🔄 Will attempt reconnection', {
            interactionId,
            attempt: reconnectAttempts + 1,
            maxAttempts: this.MAX_RECONNECT_ATTEMPTS,
          });
          
          // Clean up current recognizer
          this.closeRecognizer(interactionId).catch((err) => {
            console.warn('[AzureSpeechProvider] Error during cleanup before reconnect', err);
          });
        } else {
          console.error('[AzureSpeechProvider] ❌ Max reconnection attempts reached', {
            interactionId,
            attempts: reconnectAttempts,
          });
        }
      }

      // Mark as not ready
      state.isReady = false;
    };

    // Session started event
    recognizer.sessionStarted = (s, e) => {
      console.info('[AzureSpeechProvider] ✅ Session started', {
        interactionId,
        sessionId: e.sessionId,
      });
      
      state.isReady = true;
      state.sessionStartTime = Date.now();
    };

    // Session stopped event
    recognizer.sessionStopped = (s, e) => {
      const sessionDuration = Date.now() - state.sessionStartTime;
      
      console.info('[AzureSpeechProvider] 🛑 Session stopped', {
        interactionId,
        sessionId: e.sessionId,
        sessionDurationMs: sessionDuration,
        audioChunksSent: state.audioChunksSent,
        transcriptsReceived: state.transcriptsReceived,
      });

      // Update metrics
      if (sessionDuration > 0) {
        const currentTotal = this.metrics.averageSessionDurationMs * (this.metrics.connectionsClosed || 1);
        this.metrics.averageSessionDurationMs = 
          (currentTotal + sessionDuration) / (this.metrics.connectionsClosed + 1);
      }

      state.isReady = false;
    };

    // Speech start/end detected events (optional logging)
    recognizer.speechStartDetected = (s, e) => {
      console.debug('[AzureSpeechProvider] 🎙️ Speech start detected', {
        interactionId,
        offset: e.offset,
      });
    };

    recognizer.speechEndDetected = (s, e) => {
      console.debug('[AzureSpeechProvider] 🔇 Speech end detected', {
        interactionId,
        offset: e.offset,
      });
    };
  }

  /**
   * Send audio chunk to Azure Speech SDK
   * For Azure, we write to the push stream immediately (continuous recognition)
   */
  async sendAudioChunk(
    audio: Buffer,
    opts: {
      interactionId: string;
      seq: number;
      sampleRate: number;
      commitImmediately?: boolean; // Ignored for Azure (continuous recognition)
    }
  ): Promise<Transcript> {
    const { interactionId, seq, sampleRate } = opts;

    try {
      // Get or create recognizer
      const state = await this.getOrCreateRecognizer(interactionId, sampleRate);

      // Write audio to push stream
      state.audioStream.write(audio);
      
      // Update metrics
      state.audioChunksSent++;
      state.bytesSent += audio.length;
      this.metrics.audioChunksSent++;
      this.metrics.totalBytesSent += audio.length;

      // Log every 100th chunk to avoid spam
      if (seq % 100 === 0) {
        const durationMs = (audio.length / 2 / sampleRate) * 1000;
        console.info('[AzureSpeechProvider] 📤 Audio chunk sent', {
          interactionId,
          seq,
          sizeBytes: audio.length,
          durationMs: durationMs.toFixed(2),
          totalChunksSent: state.audioChunksSent,
          totalBytesSent: state.bytesSent,
        });
      }

      // Update connection health
      if (this.connectionHealthMonitor) {
        this.connectionHealthMonitor.recordPong(interactionId);
      }

      // Azure uses continuous recognition - transcripts arrive via events
      // Return empty transcript immediately (actual transcripts via callback)
      return {
        type: 'partial',
        text: '',
        isFinal: false,
      };
    } catch (error: any) {
      this.metrics.errors++;
      console.error('[AzureSpeechProvider] ❌ Error sending audio chunk', {
        interactionId,
        seq,
        error: error.message || String(error),
      });
      throw error;
    }
  }

  /**
   * Close recognizer for specific interaction
   */
  async closeRecognizer(interactionId: string): Promise<void> {
    const state = this.recognizers.get(interactionId);
    if (!state) {
      return;
    }

    console.info('[AzureSpeechProvider] 🔌 Closing recognizer', {
      interactionId,
      audioChunksSent: state.audioChunksSent,
      transcriptsReceived: state.transcriptsReceived,
      sessionDurationMs: Date.now() - state.sessionStartTime,
    });

    try {
      // Stop continuous recognition
      await new Promise<void>((resolve) => {
        state.recognizer.stopContinuousRecognitionAsync(
          () => {
            console.debug('[AzureSpeechProvider] ✅ Recognition stopped', { interactionId });
            resolve();
          },
          (error) => {
            console.warn('[AzureSpeechProvider] ⚠️ Error stopping recognition', {
              interactionId,
              error,
            });
            resolve(); // Resolve anyway
          }
        );
      });

      // Close audio stream
      state.audioStream.close();

      // Close recognizer
      state.recognizer.close();

      // Remove from tracking
      this.recognizers.delete(interactionId);
      this.reconnectAttempts.delete(interactionId);
      this.metrics.connectionsClosed++;

      // Update connection health monitor
      if (this.connectionHealthMonitor) {
        this.connectionHealthMonitor.untrackConnection(interactionId);
      }

      console.info('[AzureSpeechProvider] ✅ Recognizer closed', {
        interactionId,
        totalConnections: this.recognizers.size,
      });
    } catch (error: any) {
      console.error('[AzureSpeechProvider] ❌ Error closing recognizer', {
        interactionId,
        error: error.message || String(error),
      });
      
      // Force cleanup
      this.recognizers.delete(interactionId);
      this.reconnectAttempts.delete(interactionId);
    }
  }

  /**
   * Close all recognizers and cleanup
   */
  async close(): Promise<void> {
    console.info('[AzureSpeechProvider] 🔌 Closing all recognizers', {
      activeRecognizers: this.recognizers.size,
    });

    const closePromises = Array.from(this.recognizers.keys()).map((interactionId) =>
      this.closeRecognizer(interactionId)
    );

    await Promise.allSettled(closePromises);

    console.info('[AzureSpeechProvider] ✅ All recognizers closed', {
      finalMetrics: this.getMetrics(),
    });
  }

  /**
   * Get provider metrics for health monitoring
   */
  getMetrics(): AzureMetrics {
    return {
      ...this.metrics,
      averageLatencyMs: this.metrics.averageLatencyMs,
      averageSessionDurationMs: this.metrics.averageSessionDurationMs,
    };
  }
}


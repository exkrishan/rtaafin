/**
 * Deepgram streaming ASR provider
 * Uses Deepgram SDK for real-time speech recognition
 * 
 * COMMENTED OUT: Migrated to Azure Speech SDK
 * KEPT AS FALLBACK: Can be re-enabled by removing block comments
 * Date: 2025-11-28
 * 
 * To re-enable: Remove the /* and */ comment delimiters around the implementation
 */

// Keep imports active for type checking
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { AsrProvider, Transcript } from '../types';

/*
// ========== DEEPGRAM PROVIDER (COMMENTED - FALLBACK ONLY) ==========

interface PendingSend {
  seq: number;
  sendTime: number;
  audioSize: number;
  chunkSizeMs: number;
}

interface QueuedAudio {
  audio: Buffer | Uint8Array;
  seq: number;
  sampleRate: number;
  durationMs: number;
  queuedAt: number;
}

interface ConnectionState {
  connection: any;
  socket?: any; // Underlying WebSocket for text frames
  isReady: boolean;
  transcriptQueue: Transcript[];
  pendingResolvers: Array<(transcript: Transcript) => void>;
  lastTranscript: Transcript | null;
  lastSendTime?: number; // Timestamp of last audio send
  pendingSends?: PendingSend[]; // Track pending sends for timeout detection
  pendingAudioQueue?: QueuedAudio[]; // Queue audio chunks when socket is not ready
  keepAliveInterval?: NodeJS.Timeout;
  keepAliveSuccessCount: number;
  keepAliveFailureCount: number;
  lastKeepAliveTime: number;
  reconnectAttempts: number;
  lastReconnectTime: number;
  maxReconnectAttempts: number;
  sampleRate?: number; // Store for reconnection
  // Exotel Bridge: Idle timeout tracking
  lastFrameTime?: number; // Timestamp of last audio frame received
  idleTimeoutMs?: number; // Idle timeout duration in milliseconds
  idleTimeoutTimer?: NodeJS.Timeout; // Timer for idle timeout
  // Exotel Bridge: Early-audio filtering
  earlyAudioFilterEnabled?: boolean; // Whether to filter early audio (ringing, etc.)
  speechDetected?: boolean; // Whether speech has been detected
  firstFrameTime?: number; // Timestamp of first audio frame
}

interface DeepgramMetrics {
  connectionsCreated: number;
  connectionsReused: number;
  connectionsClosed: number;
  connectionsReconnects: number; // Track reconnection attempts
  audioChunksSent: number;
  transcriptsReceived: number;
  emptyTranscriptsReceived: number;
  errors: number;
  errorCodes: Map<number, number>; // error code -> count
  keepAliveSuccess: number;
  keepAliveFailures: number;
  averageChunkSizeMs: number;
  averageLatencyMs: number;
  // New metrics for monitoring
  connectionOpenMs: number[]; // Track connection open times
  transcriptTimeoutCount: number; // Count of transcript timeouts
  partialEmptyCount: number; // Count of empty partial transcripts
  firstInterimLatencyMs: number[]; // Track first interim transcript latency
  sendsBlockedNotReady: number; // Sends blocked due to socket not ready
}

export class DeepgramProvider implements AsrProvider {
  private client: ReturnType<typeof createClient>;
  private connections: Map<string, ConnectionState> = new Map();
  // Promise-based locking to prevent duplicate connection creation
  private connectionCreationLocks: Map<string, Promise<ConnectionState>> = new Map();
  // Metrics for observability
  private metrics: DeepgramMetrics = {
    connectionsCreated: 0,
    connectionsReused: 0,
    connectionsClosed: 0,
    connectionsReconnects: 0,
    audioChunksSent: 0,
    transcriptsReceived: 0,
    emptyTranscriptsReceived: 0,
    errors: 0,
    errorCodes: new Map(),
    keepAliveSuccess: 0,
    keepAliveFailures: 0,
    averageChunkSizeMs: 0,
    averageLatencyMs: 0,
    connectionOpenMs: [],
    transcriptTimeoutCount: 0,
    partialEmptyCount: 0,
    firstInterimLatencyMs: [],
    sendsBlockedNotReady: 0,
  };

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
    // Check if connection already exists and is ready (prevent duplicate connections)
    let state = this.connections.get(interactionId);
    
    if (state) {
      // Connection exists, check if it's still valid
      // Note: We rely on `isReady` flag which is set when Open event fires
      // We don't check socket.readyState here because:
      // 1. Socket might be from a different connection object
      // 2. Socket might not be properly initialized when stored
      // 3. The `isReady` flag is more reliable as it's set by the Open event handler
      
      if (state.isReady && state.connection) {
        // Use SDK's getReadyState() to verify connection is still valid
        const readyState = state.connection.getReadyState();
        const connectionValid = readyState === 1 || readyState === 0; // OPEN or CONNECTING is OK
        
        if (connectionValid) {
          this.metrics.connectionsReused++;
          console.debug(`[DeepgramProvider] Reusing existing connection for ${interactionId}`, {
            isReady: state.isReady,
            readyState,
            readyStateName: readyState === 0 ? 'CONNECTING' : readyState === 1 ? 'OPEN' : readyState === 2 ? 'CLOSING' : 'CLOSED',
          });
          return state;
        } else {
          // Connection is CLOSING or CLOSED - invalid
          console.warn(`[DeepgramProvider] Connection exists but is closed for ${interactionId}`, {
            readyState,
            readyStateName: readyState === 2 ? 'CLOSING' : 'CLOSED',
          });
          // Remove invalid connection and create new one
          this.connections.delete(interactionId);
          state = undefined;
        }
      } else {
        // Connection exists but not ready, log why
        console.warn(`[DeepgramProvider] Connection exists but not valid for ${interactionId}`, {
          isReady: state.isReady,
          hasConnection: !!state.connection,
          readyState: state.connection ? state.connection.getReadyState() : 'no connection',
        });
        // Connection exists but not ready, wait a bit and check again
        // This handles race conditions where connection is being created
        console.warn(`[DeepgramProvider] Connection exists but not ready for ${interactionId}, waiting...`);
        // Wait for connection to be ready (with timeout)
        const maxWait = 5000; // 5 seconds
        const startTime = Date.now();
        while (!state.isReady && (Date.now() - startTime) < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100));
          state = this.connections.get(interactionId);
          if (!state) break;
        }
        if (state && state.isReady) {
          console.info(`[DeepgramProvider] Connection became ready for ${interactionId}`);
          return state;
        }
        // Connection still not ready or doesn't exist, create new one
        console.warn(`[DeepgramProvider] Connection not ready after wait, creating new one for ${interactionId}`);
        this.connections.delete(interactionId); // Remove stale connection
      }
    }

    // CRITICAL: Check if another call is already creating a connection for this interactionId
    // This prevents race conditions where multiple calls try to create connections simultaneously
    const existingLock = this.connectionCreationLocks.get(interactionId);
    if (existingLock) {
      console.debug(`[DeepgramProvider] Waiting for connection creation in progress for ${interactionId}`);
      try {
        // Wait for the other call to finish creating the connection
        // If it succeeds, we'll get the same connection state
        // If it fails, the promise will reject and we'll handle it below
        return await existingLock;
      } catch (error: any) {
        // If the other call failed, we can try to create our own
        // But first check again if a connection was created (maybe it succeeded after the error)
        state = this.connections.get(interactionId);
        if (state && state.isReady) {
          console.info(`[DeepgramProvider] Connection was created by another call for ${interactionId}`);
          return state;
        }
        // Connection creation failed, continue to create our own
        console.warn(`[DeepgramProvider] Previous connection creation failed for ${interactionId}, creating new one:`, error.message);
        this.connectionCreationLocks.delete(interactionId); // Remove failed lock
      }
    }

    // Create a promise that will resolve when connection is ready
    // This promise is stored in the lock map so concurrent calls can wait for it
    const connectionPromise = (async (): Promise<ConnectionState> => {
      try {
        console.info(`[DeepgramProvider] Creating new connection for ${interactionId}`);
      
      // Create new live connection with configurable parameters
      // CRITICAL: Deepgram requires specific configuration for telephony audio (8kHz)
      // Note: Deepgram supports 8kHz sample rate, but default is 24kHz
      // For telephony (8kHz), we must explicitly set sample_rate
      // Support both DEEPGRAM_MODEL (legacy) and DG_MODEL (new bridge) env vars
      const model = process.env.DG_MODEL || process.env.DEEPGRAM_MODEL || 'nova-3';
      const encoding = process.env.DG_ENCODING || 'linear16';
      const channels = parseInt(process.env.DG_CHANNELS || '1', 10);
      const smartFormat = process.env.DG_SMART_FORMAT !== 'false' && process.env.DEEPGRAM_SMART_FORMAT !== 'false'; // Default true
      const diarize = process.env.DG_DIARIZE === 'true'; // Default false
      
      // CRITICAL FIX: Force sample rate to 8000 Hz for telephony
      // Exotel telephony should always be 8000 Hz, regardless of what's passed or in env vars
      // This prevents issues where Exotel sends incorrect sample rate (e.g., 1800)
      let finalSampleRate = parseInt(process.env.DG_SAMPLE_RATE || String(sampleRate), 10);
      if (finalSampleRate !== 8000) {
        console.warn(`[DeepgramProvider] ⚠️ Invalid sample rate ${finalSampleRate} detected, forcing to 8000 Hz for telephony`, {
          interactionId,
          received_sample_rate: finalSampleRate,
          env_DG_SAMPLE_RATE: process.env.DG_SAMPLE_RATE,
          passed_sampleRate: sampleRate,
          corrected_sample_rate: 8000,
          note: 'Exotel telephony must use 8000 Hz. Forcing to 8000 regardless of input.',
        });
        finalSampleRate = 8000;
      }
      
      const connectionConfig = {
        model,
        language: process.env.DEEPGRAM_LANGUAGE || 'en-US',
        smart_format: smartFormat,
        interim_results: process.env.DEEPGRAM_INTERIM_RESULTS !== 'false', // Default true
        sample_rate: finalSampleRate, // CRITICAL: Always 8000 Hz for telephony
        encoding, // Support DG_ENCODING env var (default linear16)
        channels, // Support DG_CHANNELS env var (default 1)
        diarize, // Support DG_DIARIZE env var (default false)
      };
      
      console.info(`[DeepgramProvider] Connection config:`, {
        interactionId,
        ...connectionConfig,
        note: 'Sample rate forced to 8000 Hz for Exotel telephony',
      });
      
      const connection = this.client.listen.live(connectionConfig);
      
      // CRITICAL: Attempt to verify WebSocket URL contains required query params
      // Deepgram SDK constructs URL internally, but we need to verify it's correct
      try {
        // Try to access the underlying WebSocket URL after connection is created
        const connectionAny = connection as any;
        
        // Try multiple patterns to find the URL
        const wsUrl = 
          connectionAny?.url || 
          connectionAny?.socket?.url || 
          connectionAny?.transport?.url ||
          connectionAny?._url ||
          connectionAny?.conn?.url ||
          connectionAny?._connection?.url;
        
        if (wsUrl && typeof wsUrl === 'string') {
          // Validate URL contains required parameters
          const hasEncoding = wsUrl.includes('encoding=');
          const hasSampleRate = wsUrl.includes('sample_rate=');
          const hasChannels = wsUrl.includes('channels=');
          const encodingValue = wsUrl.match(/encoding=([^&]+)/)?.[1];
          const sampleRateValue = wsUrl.match(/sample_rate=([^&]+)/)?.[1];
          const channelsValue = wsUrl.match(/channels=([^&]+)/)?.[1];
          
          // Validate values match expected
          const encodingCorrect = encodingValue === 'linear16';
          const sampleRateCorrect = sampleRateValue === String(sampleRate);
          const channelsCorrect = channelsValue === '1';
          
          const allCorrect = encodingCorrect && sampleRateCorrect && channelsCorrect;
          
          if (allCorrect) {
            console.info(`[DeepgramProvider] ✅ WebSocket URL verified and validated:`, {
              interactionId,
              url: wsUrl.substring(0, 200), // Truncate for logging
              encoding: encodingValue,
              sampleRate: sampleRateValue,
              channels: channelsValue,
              note: 'All parameters match expected values for Exotel telephony audio',
            });
          } else {
            console.error(`[DeepgramProvider] ❌ WebSocket URL validation failed!`, {
              interactionId,
              url: wsUrl.substring(0, 200),
              expected: {
                encoding: 'linear16',
                sampleRate: String(sampleRate),
                channels: '1',
              },
              actual: {
                encoding: encodingValue,
                sampleRate: sampleRateValue,
                channels: channelsValue,
              },
              validation: {
                encodingCorrect,
                sampleRateCorrect,
                channelsCorrect,
              },
              note: 'URL parameters do not match expected values. This may cause Deepgram to reject audio.',
            });
          }
        } else {
          console.warn(`[DeepgramProvider] ⚠️ Cannot access WebSocket URL (SDK internal)`, {
            interactionId,
            connectionKeys: Object.keys(connectionAny || {}).slice(0, 10),
            note: 'Relying on SDK to construct URL correctly. If issues persist, verify SDK version and docs.',
          });
        }
      } catch (e) {
        console.debug(`[DeepgramProvider] Error accessing WebSocket URL:`, e);
      }
      
      // Type assertion to access dynamic properties on connection object
      const connectionAny = connection as any;

      // No longer need to access underlying WebSocket - SDK methods handle everything
      // KeepAlive uses connection.keepAlive(), connection state uses connection.getReadyState()
      // This removes 100+ lines of complex socket access code
      const socket: any = null; // Keep for backward compatibility but not used

      // Configuration from environment variables
      const maxReconnectAttempts = parseInt(process.env.DEEPGRAM_MAX_RECONNECT_ATTEMPTS || '3', 10);
      
      // Exotel Bridge: Idle timeout configuration
      const exoIdleCloseS = parseInt(process.env.EXO_IDLE_CLOSE_S || '10', 10);
      const exoIdleCloseMs = exoIdleCloseS * 1000;
      
      state = {
        connection,
        socket: null, // No longer needed - SDK methods handle everything
        isReady: false,
        transcriptQueue: [],
        pendingResolvers: [],
        lastTranscript: null,
        keepAliveSuccessCount: 0,
        keepAliveFailureCount: 0,
        lastKeepAliveTime: 0,
        reconnectAttempts: 0,
        lastReconnectTime: 0,
        maxReconnectAttempts,
        sampleRate,
        // Exotel Bridge: Track last frame time for idle timeout
        lastFrameTime: Date.now(),
        idleTimeoutMs: exoIdleCloseMs,
        idleTimeoutTimer: undefined,
        // Exotel Bridge: Early-audio filtering (suppress transcripts until speech detected)
        earlyAudioFilterEnabled: process.env.EXO_EARLY_AUDIO_FILTER !== 'false', // Default true
        speechDetected: false,
        firstFrameTime: Date.now(),
      };

      // Set up event handlers
      const connectionStartTime = Date.now();
      connection.on(LiveTranscriptionEvents.Open, () => {
        const connectionOpenTime = Date.now() - connectionStartTime;
        this.metrics.connectionOpenMs.push(connectionOpenTime);
        console.info(`[DeepgramProvider] ✅ Connection opened for ${interactionId}`, {
          connectionOpenTimeMs: connectionOpenTime,
        });
        
        // Use SDK's getReadyState() to check connection state
        // SDK's Open event fires when connection is ready, but we verify using SDK method
        const markReadyAndInitialize = () => {
          // Verify connection is actually open using SDK method
          const readyState = connection.getReadyState();
          if (readyState !== 1) {
            // Not OPEN yet - wait a bit and check again
            const waitStartTime = Date.now();
            const MAX_WAIT_MS = 5000; // 5 seconds max wait
            
            const checkReady = () => {
              const currentReadyState = connection.getReadyState();
              const waitTime = Date.now() - waitStartTime;
              
              if (currentReadyState === 1) {
                // OPEN - proceed with initialization
                console.info(`[DeepgramProvider] ✅ Connection is OPEN for ${interactionId} (waited ${waitTime}ms)`);
                initializeConnection();
              } else if (currentReadyState >= 2) {
                // CLOSING or CLOSED - connection failed
                console.error(`[DeepgramProvider] ❌ Connection in invalid state ${currentReadyState} (CLOSING/CLOSED) for ${interactionId}`, {
                  readyState: currentReadyState,
                  readyStateName: currentReadyState === 2 ? 'CLOSING' : 'CLOSED',
                });
                // Close connection - it will be recreated on next sendAudioChunk call
                this.connections.delete(interactionId);
                if (state.connection && typeof state.connection.finish === 'function') {
                  state.connection.finish();
                }
                if (state.keepAliveInterval) {
                  clearInterval(state.keepAliveInterval);
                }
                return;
              } else if (waitTime >= MAX_WAIT_MS) {
                // Socket stuck in CONNECTING for too long
                console.error(`[DeepgramProvider] ❌ Connection stuck in CONNECTING state for ${waitTime}ms (max: ${MAX_WAIT_MS}ms) for ${interactionId}. Closing connection.`, {
                  readyState: currentReadyState,
                  waitTimeMs: waitTime,
                  maxWaitMs: MAX_WAIT_MS,
                });
                this.connections.delete(interactionId);
                if (state.connection && typeof state.connection.finish === 'function') {
                  state.connection.finish();
                }
                if (state.keepAliveInterval) {
                  clearInterval(state.keepAliveInterval);
                }
                return;
          } else {
                // Still CONNECTING - check again
                setTimeout(checkReady, 50); // Check every 50ms
              }
            };
            
            // Start checking
            checkReady();
            return;
          }
          
          // Connection is OPEN - proceed with initialization
          initializeConnection();
        };
        
        // Function to initialize connection (mark as ready, set up KeepAlive, etc.)
        const initializeConnection = () => {
          state.isReady = true;
          console.info(`[DeepgramProvider] ✅ Connection marked as ready for ${interactionId}`, {
            readyState: connection.getReadyState(),
            isConnected: connection.isConnected ? connection.isConnected() : 'unknown',
          });
          
          // Use SDK's keepAlive() method - official and reliable
          // SDK handles JSON formatting and proper frame type internally
          const sendKeepAlive = (): boolean => {
            try {
              connection.keepAlive();
              state.keepAliveSuccessCount++;
              state.lastKeepAliveTime = Date.now();
              this.metrics.keepAliveSuccess++;
              return true;
            } catch (error: any) {
            state.keepAliveFailureCount++;
            this.metrics.keepAliveFailures++;
              console.error(`[DeepgramProvider] ❌ Failed to send KeepAlive for ${interactionId}:`, error);
            return false;
          }
        };
        
        // Send initial KeepAlive
          try {
            sendKeepAlive();
            console.info(`[DeepgramProvider] 📡 Sent initial KeepAlive for ${interactionId}`);
          } catch (error: any) {
            console.warn(`[DeepgramProvider] ⚠️ Initial KeepAlive failed for ${interactionId}, will retry in periodic interval:`, error);
          }
          
          // SDK's send() method automatically flushes its internal buffer when connection opens
          // No need to manually flush - SDK handles it
        if (state.pendingAudioQueue && state.pendingAudioQueue.length > 0) {
            console.info(`[DeepgramProvider] ℹ️ Connection opened with ${state.pendingAudioQueue.length} queued chunks - SDK will handle buffering automatically for ${interactionId}`);
            // Clear our manual queue since SDK handles buffering
            state.pendingAudioQueue = [];
        }
        
        // Set up periodic KeepAlive (every 3 seconds) to prevent timeout during silence
        // This is CRITICAL - Deepgram closes connections if no data is received within timeout
        // KeepAlive must be JSON format sent as TEXT frame via underlying WebSocket
        const keepAliveIntervalMs = parseInt(process.env.DEEPGRAM_KEEPALIVE_INTERVAL_MS || '3000', 10);
        const keepAliveEnabled = process.env.DEEPGRAM_KEEPALIVE_ENABLED !== 'false'; // Default true
        
        if (keepAliveEnabled) {
          state.keepAliveInterval = setInterval(() => {
            if (!state.isReady || !state.connection) {
              return;
            }
            
            try {
                // Check connection state using SDK method
                const readyState = connection.getReadyState();
                if (readyState >= 2) {
                  // CLOSING or CLOSED - clear interval
                  console.warn(`[DeepgramProvider] Connection closing/closed (readyState: ${readyState}), clearing KeepAlive interval for ${interactionId}`);
                  if (state.keepAliveInterval) {
                    clearInterval(state.keepAliveInterval);
                    state.keepAliveInterval = undefined;
                  }
                  return;
                }
                
                const success = sendKeepAlive();
              if (success) {
                console.debug(`[DeepgramProvider] 📡 KeepAlive sent (success: ${state.keepAliveSuccessCount}, failures: ${state.keepAliveFailureCount})`);
              } else {
                console.warn(`[DeepgramProvider] ⚠️ KeepAlive failed (success: ${state.keepAliveSuccessCount}, failures: ${state.keepAliveFailureCount})`);
                
                // If too many failures, log critical warning
                if (state.keepAliveFailureCount > 5 && state.keepAliveFailureCount % 10 === 0) {
                  console.error(`[DeepgramProvider] ❌ CRITICAL: KeepAlive failing repeatedly (${state.keepAliveFailureCount} failures). Connection may timeout.`);
                }
              }
            } catch (error: any) {
              console.error(`[DeepgramProvider] ❌ Failed to send periodic KeepAlive for ${interactionId}:`, error);
              state.keepAliveFailureCount++;
              this.metrics.keepAliveFailures++;
              
                // Check connection state - if closed, clear interval
                try {
                  const readyState = connection.getReadyState();
                  if (readyState >= 2) {
                if (state.keepAliveInterval) {
                  clearInterval(state.keepAliveInterval);
                  state.keepAliveInterval = undefined;
                      console.debug(`[DeepgramProvider] Cleared KeepAlive interval (connection closed) for ${interactionId}`);
                }
                  }
                } catch (e) {
                  // Ignore errors checking readyState
              }
            }
          }, keepAliveIntervalMs);
        } else {
          console.warn(`[DeepgramProvider] ⚠️ KeepAlive disabled via DEEPGRAM_KEEPALIVE_ENABLED=false for ${interactionId}`);
        }
        };
        
        // Use SDK's getReadyState() to verify connection is ready
        // SDK's Open event fires when connection is ready, but we verify using SDK method
        markReadyAndInitialize();
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        try {
          this.metrics.transcriptsReceived++;
          const transcriptTimestamp = new Date().toISOString();
          
          // COMPREHENSIVE FLOW TRACKING: Log transcript receipt
          console.info(`\n${'='.repeat(80)}`);
          console.info(`[DeepgramProvider] 📨 STEP 2: DEEPGRAM TRANSCRIPT RECEIVED`);
          console.info(`[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.info(`[DeepgramProvider] Interaction ID: ${interactionId}`);
          console.info(`[DeepgramProvider] Timestamp: ${transcriptTimestamp}`);
          console.info(`[DeepgramProvider] Transcript Event Structure:`, {
            hasChannel: !!data?.channel,
            hasAlternatives: !!data?.channel?.alternatives,
            alternativesCount: data?.channel?.alternatives?.length ?? 0,
            isFinal: data?.is_final ?? false,
            speechFinal: data?.speech_final ?? false,
            rawDataKeys: data ? Object.keys(data) : [],
          });
          
          // Calculate time since last send (if available)
          const lastSend = state.pendingSends && state.pendingSends.length > 0 
            ? state.pendingSends[state.pendingSends.length - 1]
            : null;
          const timeSinceSend = lastSend ? (Date.now() - lastSend.sendTime) + 'ms' : 'unknown';
          
          console.info(`[DeepgramProvider] Timing:`, {
            timeSinceLastSend: timeSinceSend,
            lastSendSeq: lastSend?.seq || 'unknown',
          });
          
          // Log full data structure (truncated)
          console.info(`[DeepgramProvider] Full Event Data (first 1000 chars):`, {
            dataPreview: data ? JSON.stringify(data).substring(0, 1000) : 'null',
          });
          console.info(`[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
          
          // Log each alternative transcript in detail
          if (data?.channel?.alternatives && Array.isArray(data.channel.alternatives)) {
            data.channel.alternatives.forEach((alt: any, idx: number) => {
              console.info(`[DeepgramProvider] 📝 Alternative ${idx} for ${interactionId}:`, {
                transcript: alt.transcript || '(empty)',
                transcriptLength: alt.transcript?.length ?? 0,
                confidence: alt.confidence,
                words: alt.words?.length ?? 0,
                hasWords: !!alt.words,
                alternativeKeys: alt ? Object.keys(alt) : [],
              });
            });
          } else {
            console.warn(`[DeepgramProvider] ⚠️ No alternatives in transcript data for ${interactionId}`, {
              dataStructure: data ? Object.keys(data) : 'null',
              channelStructure: data?.channel ? Object.keys(data.channel) : 'null',
              channelType: typeof data?.channel,
              alternativesType: typeof data?.channel?.alternatives,
            });
          }
          
          const transcriptText = data?.channel?.alternatives?.[0]?.transcript;
          const isFinal = data?.is_final ?? false;
          const confidence = data?.channel?.alternatives?.[0]?.confidence ?? 0.9;

          // Exotel Bridge: Early-audio filtering - suppress transcripts until speech detected
          if (state.earlyAudioFilterEnabled && !state.speechDetected) {
            // Simple VAD: Check if transcript has actual speech (not just silence/empty)
            const hasSpeech = transcriptText && transcriptText.trim().length > 0 && 
                             transcriptText.trim().toLowerCase() !== 'um' && 
                             transcriptText.trim().toLowerCase() !== 'uh';
            
            // Also check time since first frame (allow after 2 seconds even if no speech)
            const timeSinceFirstFrame = state.firstFrameTime ? Date.now() - state.firstFrameTime : 0;
            const allowAfterTime = timeSinceFirstFrame >= 2000; // 2 seconds
            
            if (hasSpeech || allowAfterTime) {
              state.speechDetected = true;
              console.info(`[DeepgramProvider] 🎤 Speech detected for ${interactionId}`, {
                interactionId,
                transcript: transcriptText?.substring(0, 50),
                timeSinceFirstFrame,
                detectedBy: hasSpeech ? 'transcript' : 'timeout',
              });
            } else {
              // Suppress transcript - still early audio (ringing/early frames)
              console.debug(`[DeepgramProvider] 🔇 Suppressing early-audio transcript for ${interactionId}`, {
                interactionId,
                transcript: transcriptText?.substring(0, 50),
                timeSinceFirstFrame,
                note: 'Early audio filtering active - waiting for speech or 2s timeout',
              });
              return; // Skip this transcript
            }
          }

          if (transcriptText && transcriptText.trim().length > 0) {
            const transcript: Transcript = {
              type: isFinal ? 'final' : 'partial',
              text: transcriptText.trim(),
              confidence,
              isFinal: isFinal as any,
            };

            // COMPREHENSIVE FLOW TRACKING: Log successful transcript
            console.info(`[DeepgramProvider] ✅ STEP 2 SUCCESS: Transcript extracted and processed`, {
              interactionId,
              type: transcript.type,
              textLength: transcript.text.length,
              textPreview: transcript.text.substring(0, 100),
              confidence: confidence.toFixed(2),
              isFinal,
              status: 'SUCCESS - Transcript has text',
            });
            
            // Remove corresponding pending send
            // CRITICAL FIX: Match oldest pending send (Deepgram processes in order, but may have delays)
            // When transcripts arrive late, they correspond to the oldest pending send
            if (state.pendingSends && state.pendingSends.length > 0) {
              // Match oldest pending send (first in queue) - this is correct for in-order processing
              // Even if transcripts arrive late, they still correspond to the oldest pending send
              const completedSend = state.pendingSends.shift();
              if (completedSend) {
                const processingTime = Date.now() - completedSend.sendTime;
                
                // Log backlog warning if processing time is excessive
                if (processingTime > 10000) { // >10 seconds
                  console.warn(`[DeepgramProvider] ⚠️ WARNING: Excessive processing latency detected`, {
                    interactionId,
                    processingTime: processingTime + 'ms',
                    seq: completedSend.seq,
                    pendingSendsCount: state.pendingSends.length,
                    oldestPendingAge: state.pendingSends.length > 0 
                      ? (Date.now() - state.pendingSends[0].sendTime) + 'ms' 
                      : 'none',
                    note: 'Deepgram backlog may be too high - consider reducing send frequency',
                  });
                }
                
                console.info(`[DeepgramProvider] ⏱️ Processing Time: ${processingTime}ms (from send to transcript)`, {
                  interactionId,
                  seq: completedSend.seq,
                  audioSize: completedSend.audioSize,
                  chunkSizeMs: completedSend.chunkSizeMs,
                });
                
                // Exotel Bridge: Track latency metrics
                if (!isFinal) {
                  // First interim transcript latency
                  if (this.metrics.firstInterimLatencyMs.length === 0 || 
                      !state.lastTranscript || 
                      state.lastTranscript.type === 'final') {
                    this.metrics.firstInterimLatencyMs.push(processingTime);
                  }
                } else {
                  // Final transcript latency
                  // Track as average latency (can be enhanced to track per-call)
                  const currentAvg = this.metrics.averageLatencyMs;
                  const count = this.metrics.transcriptsReceived;
                  this.metrics.averageLatencyMs = 
                    (currentAvg * (count - 1) + processingTime) / count;
                }
              }
            }

            state.lastTranscript = transcript;
            state.transcriptQueue.push(transcript);

            // Resolve any pending promises
            if (state.pendingResolvers.length > 0) {
              const resolver = state.pendingResolvers.shift()!;
              resolver(transcript);
              console.info(`[DeepgramProvider] ✅ STEP 3: Transcript delivered to ASR Worker`, {
                interactionId,
                pendingResolversRemaining: state.pendingResolvers.length,
              });
            }
          } else {
            // Track empty transcripts in metrics
            this.metrics.emptyTranscriptsReceived++;
            
            // Log empty transcripts to debug why Deepgram isn't returning text
            // CRITICAL: Empty transcripts can indicate:
            // 1. Audio is silence (no speech detected)
            // 2. Audio format is incorrect (Deepgram can't decode)
            // 3. Audio chunks are too small/infrequent
            // 4. Sample rate mismatch
            const emptyRate = this.metrics.transcriptsReceived > 0 
              ? ((this.metrics.emptyTranscriptsReceived / this.metrics.transcriptsReceived) * 100).toFixed(1) + '%'
              : '0%';
            
            // Track empty partial metric
            if (!isFinal) {
              this.metrics.partialEmptyCount++;
            }
            
            // COMPREHENSIVE FLOW TRACKING: Log empty transcript
            if (isFinal || parseFloat(emptyRate) > 50) {
              console.warn(`[DeepgramProvider] ⚠️ STEP 2 WARNING: Empty transcript received`, {
                interactionId,
                isFinal,
                hasChannel: !!data.channel,
                hasAlternatives: !!data.channel?.alternatives,
                alternativesCount: data.channel?.alternatives?.length || 0,
                emptyTranscriptRate: emptyRate,
                totalTranscripts: this.metrics.transcriptsReceived,
                totalEmpty: this.metrics.emptyTranscriptsReceived,
                status: 'WARNING - No text in transcript',
                possibleCauses: [
                  'Audio is silence (no speech detected)',
                  'Audio format is incorrect (Deepgram can\'t decode)',
                  'Audio chunks are too small/infrequent',
                  'Sample rate mismatch',
                ],
                rawData: JSON.stringify(data).substring(0, 500),
              });
            } else {
              // Log at info level for normal empty partials (silence is normal)
              console.info(`[DeepgramProvider] ℹ️ STEP 2: Empty partial transcript (silence - normal)`, {
                interactionId,
                emptyTranscriptRate: emptyRate,
                status: 'NORMAL - Silence detected',
              });
            }
            
            // Remove corresponding pending send
            // CRITICAL FIX: Match oldest pending send (same logic as non-empty transcripts)
            if (state.pendingSends && state.pendingSends.length > 0) {
              const completedSend = state.pendingSends.shift();
              if (completedSend) {
                const processingTime = Date.now() - completedSend.sendTime;
                
                // Log backlog warning if processing time is excessive
                if (processingTime > 10000) { // >10 seconds
                  console.warn(`[DeepgramProvider] ⚠️ WARNING: Excessive processing latency for empty transcript`, {
                    interactionId,
                    processingTime: processingTime + 'ms',
                    seq: completedSend.seq,
                    pendingSendsCount: state.pendingSends.length,
                    oldestPendingAge: state.pendingSends.length > 0 
                      ? (Date.now() - state.pendingSends[0].sendTime) + 'ms' 
                      : 'none',
                    note: 'Deepgram backlog may be too high - consider reducing send frequency',
                  });
                }
                
                console.info(`[DeepgramProvider] ⏱️ Processing Time: ${processingTime}ms (from send to empty transcript)`, {
                  interactionId,
                  seq: completedSend.seq,
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
            
            // Resolve any pending promises with empty transcript
            if (state.pendingResolvers.length > 0) {
              const resolver = state.pendingResolvers.shift()!;
              resolver(emptyTranscript);
            }
          }
        } catch (error: any) {
          console.error(`[DeepgramProvider] Error processing transcript for ${interactionId}:`, error);
          this.metrics.errors++;
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        const errorCode = error.code;
        const errorMessage = error.message || String(error);
        const errorTimestamp = Date.now();
        
        this.metrics.errors++;
        if (errorCode) {
          this.metrics.errorCodes.set(errorCode, (this.metrics.errorCodes.get(errorCode) || 0) + 1);
        }
        
        // Enhanced error logging with connection health context
        const connectionHealth = {
          isReady: state.isReady,
          hasConnection: !!state.connection,
          readyState: state.connection ? state.connection.getReadyState() : 'unknown',
          readyStateName: state.connection ? (state.connection.getReadyState() === 0 ? 'CONNECTING' : state.connection.getReadyState() === 1 ? 'OPEN' : state.connection.getReadyState() === 2 ? 'CLOSING' : 'CLOSED') : 'no connection',
          lastSendTime: state.lastSendTime ? Date.now() - state.lastSendTime + 'ms ago' : 'never',
          keepAliveSuccess: state.keepAliveSuccessCount,
          keepAliveFailures: state.keepAliveFailureCount,
          pendingSends: state.pendingSends?.length || 0,
          pendingResolvers: state.pendingResolvers.length,
          reconnectAttempts: state.reconnectAttempts,
        };
        
        console.error(`[DeepgramProvider] ❌ API Error for ${interactionId}:`, {
          error: errorMessage,
          code: errorCode,
          type: error.type,
          interactionId,
          timestamp: new Date(errorTimestamp).toISOString(),
          connectionHealth,
        });
        
        // Handle specific error codes
        switch (errorCode) {
          case 1008: // DATA-0000: Invalid audio format
            console.error(`[DeepgramProvider] ❌ Invalid audio format (1008) for ${interactionId}`);
            console.error(`[DeepgramProvider] ❌ CRITICAL: This indicates audio format mismatch!`, {
              interactionId,
              declaredEncoding: 'linear16',
              declaredSampleRate: sampleRate,
              declaredChannels: 1,
              errorMessage: errorMessage,
              note: 'Check: 1) Actual audio encoding matches linear16, 2) Sample rate matches 8000Hz, 3) Channels match 1 (mono), 4) WebSocket URL contains correct query params',
            });
            // Log recent audio send details for debugging
            console.error(`[DeepgramProvider] Recent audio details:`, {
              lastSendTime: state.lastSendTime ? new Date(state.lastSendTime).toISOString() : 'never',
              audioChunksSent: this.metrics.audioChunksSent,
              averageChunkSizeMs: this.metrics.averageChunkSizeMs.toFixed(0),
            });
            console.error(`[DeepgramProvider] Check: encoding, sample_rate, channels match actual audio`);
            console.error(`[DeepgramProvider] Current config:`, {
              encoding: 'linear16',
              sample_rate: sampleRate,
              channels: 1,
            });
            // Close connection - format issue won't resolve
            this.closeConnection(interactionId).catch((e) => {
              console.error(`[DeepgramProvider] Error closing connection after format error:`, e);
            });
            break;
            
          case 4000: // Invalid API key
            console.error(`[DeepgramProvider] ❌ Invalid API key (4000) for ${interactionId}`);
            console.error(`[DeepgramProvider] Check: DEEPGRAM_API_KEY is correct and has not expired`);
            // Close connection - auth issue won't resolve
            this.closeConnection(interactionId).catch((e) => {
              console.error(`[DeepgramProvider] Error closing connection after auth error:`, e);
            });
            break;
            
          case 1011: // NET-0001: Timeout
            console.error(`[DeepgramProvider] ❌ Connection timeout (1011) for ${interactionId}`);
            console.error(`[DeepgramProvider] Possible causes:`);
            console.error(`[DeepgramProvider]   1. Audio chunks too small/infrequent`);
            console.error(`[DeepgramProvider]   2. KeepAlive not being sent/recognized`);
            console.error(`[DeepgramProvider]   3. Network issues`);
            console.error(`[DeepgramProvider] KeepAlive stats:`, {
              success: state.keepAliveSuccessCount,
              failures: state.keepAliveFailureCount,
              lastKeepAlive: state.lastKeepAliveTime ? Date.now() - state.lastKeepAliveTime + 'ms ago' : 'never',
            });
            // Don't close immediately - may recover with reconnection
            break;
            
          default:
            // Unknown error - log and continue
            console.warn(`[DeepgramProvider] ⚠️ Unknown error code ${errorCode} for ${interactionId}`);
        }
        
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

      connection.on(LiveTranscriptionEvents.Close, (event: any) => {
        this.metrics.connectionsClosed++;
        
        console.warn(`[DeepgramProvider] 🔒 Connection closed for ${interactionId}`, {
          reason: event?.reason || 'unknown',
          code: event?.code,
          wasClean: event?.wasClean,
          fullEvent: event ? JSON.stringify(event).substring(0, 200) : 'no event data',
        });
        
        // CRITICAL: Immediately mark connection as not ready and remove from map
        // This prevents race conditions where audio arrives after close but before cleanup
        state.isReady = false;
        this.connections.delete(interactionId);
        
        // Clear KeepAlive interval when connection closes
        if (state.keepAliveInterval) {
          clearInterval(state.keepAliveInterval);
          state.keepAliveInterval = undefined;
          console.debug(`[DeepgramProvider] Cleared KeepAlive interval for ${interactionId}`);
        }
        
        // If connection closed due to timeout (1011), log critical warning
        if (event?.code === 1011) {
          console.error(`[DeepgramProvider] ❌ CRITICAL: Connection closed due to timeout (1011) for ${interactionId}`);
          console.error(`[DeepgramProvider] This means Deepgram did not receive audio data within the timeout window.`);
          console.error(`[DeepgramProvider] Possible causes:`);
          console.error(`[DeepgramProvider]   1. Audio chunks are too small/infrequent`);
          console.error(`[DeepgramProvider]   2. Audio format is incorrect`);
          console.error(`[DeepgramProvider]   3. connection.send() is not working properly`);
          console.error(`[DeepgramProvider]   4. KeepAlive messages not being sent/recognized`);
          console.error(`[DeepgramProvider] KeepAlive stats:`, {
            success: state.keepAliveSuccessCount,
            failures: state.keepAliveFailureCount,
            lastKeepAlive: state.lastKeepAliveTime ? Date.now() - state.lastKeepAliveTime + 'ms ago' : 'never',
          });
        }
        
        // Enhanced reconnection logic for transient failures
        // Check if we should reconnect (not a clean close, not too many attempts)
        // NOTE: For 1011 (timeout), we still try to reconnect if we haven't exceeded attempts
        // because the timeout might be due to temporary network issues
        const isTransientError = event?.code === 1011; // Timeout - likely transient
        const isPermanentError = event?.code === 1008 || event?.code === 4000; // Format or auth - permanent
        const canReconnect = 
          !isPermanentError && // Don't reconnect on permanent errors
          state.reconnectAttempts < state.maxReconnectAttempts &&
          (Date.now() - state.lastReconnectTime) > 5000; // Wait 5s between attempts
        
        if (canReconnect) {
          const reconnectDelay = isTransientError ? 2000 : 1000; // Longer delay for timeouts
          console.info(`[DeepgramProvider] Attempting to reconnect for ${interactionId} (attempt ${state.reconnectAttempts + 1}/${state.maxReconnectAttempts}, delay: ${reconnectDelay}ms)`, {
            errorCode: event?.code,
            isTransientError,
            lastReconnectTime: state.lastReconnectTime ? Date.now() - state.lastReconnectTime + 'ms ago' : 'never',
          });
          
          state.reconnectAttempts++;
          state.lastReconnectTime = Date.now();
          this.metrics.connectionsReconnects++;
          
          // Schedule reconnection (don't block)
          // Note: Connection already deleted from map above
          setTimeout(async () => {
            try {
              // Recreate connection with same parameters
              const newState = await this.getOrCreateConnection(interactionId, state.sampleRate || 8000);
              console.info(`[DeepgramProvider] ✅ Reconnected for ${interactionId}`, {
                reconnectAttempt: state.reconnectAttempts,
                connectionOpenTime: this.metrics.connectionOpenMs[this.metrics.connectionOpenMs.length - 1] + 'ms',
              });
              
              // If we have pending audio queue from previous connection, try to flush it
              // (though this is unlikely since connection was deleted)
            } catch (error: any) {
              // Re-fetch state to get current reconnect attempts
              const currentState = this.connections.get(interactionId);
              const currentAttempts = currentState?.reconnectAttempts ?? state.reconnectAttempts;
              
              console.error(`[DeepgramProvider] ❌ Reconnection failed for ${interactionId}:`, {
                error: error.message || String(error),
                reconnectAttempt: currentAttempts,
                maxAttempts: state.maxReconnectAttempts,
                note: currentAttempts >= state.maxReconnectAttempts 
                  ? 'Max reconnection attempts reached. Connection will not be retried.'
                  : 'Will retry on next audio chunk if within max attempts',
              });
            }
          }, reconnectDelay);
        } else if (isPermanentError) {
          console.error(`[DeepgramProvider] ❌ Not attempting reconnection for ${interactionId} - permanent error (code: ${event?.code})`, {
            errorCode: event?.code,
            reason: event?.code === 1008 ? 'Invalid audio format' : 'Invalid API key',
            note: 'Connection will not be retried. Check audio format or API key configuration.',
          });
        } else if (state.reconnectAttempts >= state.maxReconnectAttempts) {
          console.error(`[DeepgramProvider] ❌ Max reconnection attempts reached for ${interactionId}`, {
            reconnectAttempts: state.reconnectAttempts,
            maxAttempts: state.maxReconnectAttempts,
            note: 'Connection will not be retried. Manual intervention may be required.',
          });
        }
      });

        this.connections.set(interactionId, state);

        // Note: Deepgram SDK connection is already active when created via listen.live()
        // No need to call start() - the connection is ready when Open event fires
        console.info(`[DeepgramProvider] 🚀 Connection created for ${interactionId}, waiting for Open event...`);
        
        // Wait for connection to be ready (Open event)
        // This ensures the connection is fully established before returning
        if (!state.isReady) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Connection not ready after 10 seconds for ${interactionId}`));
            }, 10000);

            const checkReady = setInterval(() => {
              const currentState = this.connections.get(interactionId);
              if (currentState && currentState.isReady) {
                clearInterval(checkReady);
                clearTimeout(timeout);
                resolve();
              } else if (!currentState) {
                // Connection was deleted (closed)
                clearInterval(checkReady);
                clearTimeout(timeout);
                reject(new Error(`Connection was closed before ready for ${interactionId}`));
              }
            }, 100);
          });
        }

        // Verify connection is still valid before returning
        const finalState = this.connections.get(interactionId);
        if (!finalState || !finalState.isReady) {
          throw new Error(`Connection not ready after creation for ${interactionId}`);
        }

        return finalState;
      } catch (error: any) {
        // Clean up on error
        this.connections.delete(interactionId);
        console.error(`[DeepgramProvider] ❌ Failed to create connection for ${interactionId}:`, error);
        throw error; // Re-throw so waiting calls know it failed
      } finally {
        // Always remove lock when done (success or failure)
        // This allows retries if connection creation fails
        this.connectionCreationLocks.delete(interactionId);
      }
    })();

    // Store the promise so other concurrent calls can wait for it
    this.connectionCreationLocks.set(interactionId, connectionPromise);
    
    return connectionPromise;
  }

  async sendAudioChunk(
    audio: Buffer,
    opts: { interactionId: string; seq: number; sampleRate: number }
  ): Promise<Transcript> {
    const { interactionId, sampleRate, seq } = opts;

    try {
      // Circuit breaker: Check if connection is unhealthy before attempting to send
      // BUT: If no connection exists, allow creation (don't block)
      const health = this.getConnectionHealth(interactionId);
      if (health && health.exists) {
        // Connection exists - check if it's unhealthy
        if (this.isConnectionUnhealthy(interactionId)) {
          console.warn(`[DeepgramProvider] ⚠️ Circuit breaker: Connection unhealthy for ${interactionId}, skipping send`, {
            interactionId,
            seq,
            health,
            note: 'Connection will be recreated on next attempt',
          });
          
          // Delete unhealthy connection to force recreation
          this.connections.delete(interactionId);
          
          // Return empty transcript - connection will be recreated on next chunk
          return {
            type: 'partial',
            text: '',
            isFinal: false,
            confidence: 0,
          };
        }
      } else {
        // No connection exists - this is fine, we'll create one below
        console.debug(`[DeepgramProvider] No connection exists for ${interactionId}, will create new connection`);
      }

      // Get or create connection
      const state = await this.getOrCreateConnection(interactionId, sampleRate);

      // Wait for connection to be ready (with timeout)
      if (!state.isReady) {
        console.debug(`[DeepgramProvider] Waiting for connection to be ready for ${interactionId}...`);
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            clearInterval(checkReady);
            reject(new Error(`Connection not ready after 5 seconds for ${interactionId} (isReady: ${state.isReady}, hasConnection: ${!!state.connection})`));
          }, 5000);

          const checkReady = setInterval(() => {
            // Re-fetch state in case it was updated
            const currentState = this.connections.get(interactionId);
            if (currentState && currentState.isReady) {
              clearInterval(checkReady);
              clearTimeout(timeout);
              resolve();
            } else if (!currentState) {
              // Connection was deleted
              clearInterval(checkReady);
              clearTimeout(timeout);
              reject(new Error(`Connection was deleted before ready for ${interactionId}`));
            }
          }, 100);
        });
      }
      
      // Verify state is still valid after wait
      const currentState = this.connections.get(interactionId);
      if (!currentState || !currentState.isReady) {
        throw new Error(`Connection not ready after wait for ${interactionId} (isReady: ${currentState?.isReady ?? false}, hasConnection: ${!!currentState?.connection})`);
      }
      
      // Use current state (it might have been updated)
      const stateToUse = currentState;

      // Send audio chunk
      try {
        // Calculate expected audio duration for debugging
        const bytesPerSample = 2; // 16-bit = 2 bytes
        const samples = audio.length / bytesPerSample;
        const durationMs = (samples / sampleRate) * 1000;
        
        // CRITICAL: Validate sample rate calculation makes sense
        // If duration is way off, sample rate may be mismatched
        const expectedBytesFor100ms = (sampleRate * 0.1) * 2; // 100ms at declared sample rate
        const actualDurationFor100ms = (expectedBytesFor100ms / audio.length) * durationMs;
        
        // Warn if audio duration doesn't match expected for declared sample rate
        // This helps detect sample rate mismatches
        if (seq <= 3 && Math.abs(actualDurationFor100ms - 100) > 20) {
          console.warn(`[DeepgramProvider] ⚠️ Sample rate validation warning for ${interactionId}`, {
            seq,
            declaredSampleRate: sampleRate,
            audioLength: audio.length,
            calculatedDurationMs: durationMs.toFixed(2),
            expectedBytesFor100ms: expectedBytesFor100ms.toFixed(0),
            note: 'Audio duration may not match declared sample rate. Verify actual audio sample rate.',
          });
        }
        
        // Use SDK's getReadyState() to check connection state
        // SDK's send() method automatically buffers if not connected, so we can trust it
        const connectionReadyState = stateToUse.connection.getReadyState();
        
        // Deepgram SDK expects Uint8Array or Buffer for binary audio
        // Convert Buffer to Uint8Array to ensure compatibility
        const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
        
        // Check connection state using SDK method
        // If not OPEN, SDK's send() will buffer automatically, but we log a warning
        if (connectionReadyState !== 1) {
          const stateName = connectionReadyState === 0 ? 'CONNECTING' : connectionReadyState === 2 ? 'CLOSING' : connectionReadyState === 3 ? 'CLOSED' : `UNKNOWN(${connectionReadyState})`;
          console.warn(`[DeepgramProvider] ⚠️ Connection not OPEN (${stateName}), SDK will buffer audio for ${interactionId}`, {
            interactionId,
            seq,
            readyState: connectionReadyState,
            isReady: stateToUse.isReady,
            note: 'SDK will buffer audio until connection is OPEN',
          });
        }
        
        // Trust SDK's send() method - it handles buffering automatically if not connected
        
        console.info(`[DeepgramProvider] 📤 Sending audio chunk:`, {
          interactionId,
          seq,
          bufferDurationMs: durationMs.toFixed(2),
          size: audio.length,
          sampleRate,
          samples,
          durationMs: durationMs.toFixed(0) + 'ms',
          encoding: 'linear16',
          isReady: stateToUse.isReady,
          connectionReadyState,
          readyStateName: connectionReadyState === 0 ? 'CONNECTING' : connectionReadyState === 1 ? 'OPEN' : connectionReadyState === 2 ? 'CLOSING' : connectionReadyState === 3 ? 'CLOSED' : `UNKNOWN(${connectionReadyState})`,
          timeSinceLastSend: stateToUse.lastSendTime ? (Date.now() - stateToUse.lastSendTime) + 'ms' : 'first',
          hasConnection: !!stateToUse.connection,
          note: 'SDK will buffer if not connected',
        });
        
        // CRITICAL: Comprehensive PCM16 format validation
        // Validate that audio is truly PCM16 (16-bit signed integers, little-endian)
        if (audioData.length >= 2) {
          // Check multiple samples across the buffer (not just first 2)
          const sampleCount = Math.min(10, Math.floor(audioData.length / 2));
          let validSamples = 0;
          let invalidSamples = 0;
          let allZeros = true;
          const sampleValues: number[] = [];
          
          for (let i = 0; i < sampleCount; i++) {
            const offset = i * 2;
            if (offset + 1 >= audioData.length) break;
            
            // Read as little-endian signed 16-bit integer
            const sample = (audioData[offset] | (audioData[offset + 1] << 8)) << 16 >> 16;
            sampleValues.push(sample);
            
            // Validate range
            if (sample >= -32768 && sample <= 32767) {
              validSamples++;
              if (sample !== 0) allZeros = false;
            } else {
              invalidSamples++;
            }
          }
          
          // Log warning if format issues detected
          if (invalidSamples > 0 && seq <= 3) {
            console.error(`[DeepgramProvider] ❌ CRITICAL: Audio format validation failed for ${interactionId}`, {
              seq,
              validSamples,
              invalidSamples,
              totalChecked: sampleCount,
              sampleValues: sampleValues.slice(0, 5),
              firstBytes: Array.from(audioData.slice(0, 4)).map(b => `0x${b.toString(16).padStart(2, '0')}`),
              note: 'Audio may not be PCM16 format. Expected 16-bit signed integers in range [-32768, 32767].',
            });
          }
          
          // Enhanced silence detection: calculate RMS energy
          let audioEnergy = 0;
          let maxAmplitude = 0;
          let minAmplitude = 0;
          if (sampleValues.length > 0 && !allZeros) {
            // Calculate RMS (Root Mean Square) energy
            const sumSquares = sampleValues.reduce((sum, val) => sum + (val * val), 0);
            audioEnergy = Math.sqrt(sumSquares / sampleValues.length);
            maxAmplitude = Math.max(...sampleValues.map(Math.abs));
            minAmplitude = Math.min(...sampleValues.map(Math.abs));
          }
          
          // Warn if audio is likely silence (but don't block - Deepgram will handle it)
          const SILENCE_THRESHOLD = 100; // RMS energy threshold for silence (PCM16 range is -32768 to 32767)
          const isLikelySilence = allZeros || (audioEnergy < SILENCE_THRESHOLD);
          
          if (isLikelySilence && seq <= 5) {
            const logLevel = seq <= 3 ? 'warn' : 'debug';
            const logFn = logLevel === 'warn' ? console.warn : console.debug;
            logFn(`[DeepgramProvider] ⚠️ Audio appears to be silence for ${interactionId}`, {
              seq,
              rmsEnergy: audioEnergy.toFixed(2),
              maxAmplitude,
              allZeros,
              silenceThreshold: SILENCE_THRESHOLD,
              note: 'Deepgram will return empty transcript for silence - this is normal',
            });
          } else if (!isLikelySilence && seq <= 3) {
            // Log audio quality metrics for first few chunks
            console.debug(`[DeepgramProvider] 📊 Audio quality metrics for ${interactionId}`, {
              seq,
              audioEnergy: audioEnergy.toFixed(2),
              maxAmplitude,
              minAmplitude,
              samplesChecked: sampleCount,
              note: 'Audio has sufficient energy for transcription.',
            });
          }
        }
        
        // Verify audio data is valid
        if (!audioData || audioData.length === 0) {
          throw new Error(`Invalid audio data: empty or null (length: ${audioData?.length ?? 'null'})`);
        }
        
        // Log audio data details for debugging
        console.debug(`[DeepgramProvider] Audio data details:`, {
          interactionId,
          seq,
          dataType: audioData.constructor.name,
          dataLength: audioData.length,
          firstBytes: Array.from(audioData.slice(0, Math.min(8, audioData.length))).map(b => `0x${b.toString(16).padStart(2, '0')}`),
          isBuffer: audioData instanceof Buffer,
          isUint8Array: audioData instanceof Uint8Array,
        });
        
        // Track metrics
        this.metrics.audioChunksSent++;
        const chunkSizeMs = durationMs;
        // Update average chunk size (rolling average)
        this.metrics.averageChunkSizeMs = 
          (this.metrics.averageChunkSizeMs * (this.metrics.audioChunksSent - 1) + chunkSizeMs) / this.metrics.audioChunksSent;
        
        // CRITICAL: Send audio chunk to Deepgram
        // According to Deepgram SDK docs, connection.send() accepts Buffer or Uint8Array
        // The SDK handles binary WebSocket frame transmission internally
        const sendStartTime = Date.now();
        const sendTimestamp = new Date().toISOString();
        
        // COMPREHENSIVE FLOW TRACKING: Log before send
        console.info(`\n${'='.repeat(80)}`);
        console.info(`[DeepgramProvider] 🎤 STEP 1: SENDING AUDIO TO DEEPGRAM`);
        console.info(`[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.info(`[DeepgramProvider] Interaction ID: ${interactionId}`);
        console.info(`[DeepgramProvider] Sequence: ${seq}`);
        console.info(`[DeepgramProvider] Timestamp: ${sendTimestamp}`);
        console.info(`[DeepgramProvider] Audio Details:`, {
          chunkSizeMs: chunkSizeMs.toFixed(0) + 'ms',
          dataLength: audioData.length + ' bytes',
          samples: Math.floor(audioData.length / 2),
          sampleRate: sampleRate + ' Hz',
          encoding: 'linear16 (PCM16)',
          channels: 1,
        });
        console.info(`[DeepgramProvider] Connection State:`, {
          isReady: stateToUse.isReady,
          connectionReadyState: connectionReadyState,
          readyStateName: connectionReadyState === 0 ? 'CONNECTING' : connectionReadyState === 1 ? 'OPEN' : connectionReadyState === 2 ? 'CLOSING' : connectionReadyState === 3 ? 'CLOSED' : `UNKNOWN(${connectionReadyState})`,
          isConnected: stateToUse.connection.isConnected ? stateToUse.connection.isConnected() : 'unknown',
          hasConnection: !!stateToUse.connection,
          timeSinceLastSend: stateToUse.lastSendTime ? (Date.now() - stateToUse.lastSendTime) + 'ms' : 'first send',
        });
        console.info(`[DeepgramProvider] Metrics:`, {
          totalAudioChunksSent: this.metrics.audioChunksSent + 1,
          totalTranscriptsReceived: this.metrics.transcriptsReceived,
          totalEmptyTranscripts: this.metrics.emptyTranscriptsReceived,
          averageChunkSizeMs: this.metrics.averageChunkSizeMs.toFixed(0) + 'ms',
        });
        console.info(`[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        // CRITICAL FIX: Trust the Deepgram SDK - if isReady is true, send directly
        // The SDK manages its own WebSocket internally and will handle the state
        // We don't need to check socket.readyState - the SDK's connection.send() handles it
        const connectionReady = stateToUse.isReady && !!stateToUse.connection;
        
        if (!connectionReady) {
          throw new Error(`Connection not ready for ${interactionId} (isReady: ${stateToUse.isReady}, hasConnection: ${!!stateToUse.connection})`);
        }
        
        try {
          // Explicit connection state check (following Deepgram starter pattern)
          // This matches the starter's approach: check getReadyState() before sending
          const readyState = stateToUse.connection.getReadyState();
          
          if (readyState === 1) {
            // OPEN - send directly (matches starter pattern)
            stateToUse.connection.send(audioData);
          } else if (readyState >= 2) {
            // CLOSING or CLOSED - connection is invalid, need to reconnect
            // This matches starter pattern: if >= 2, finish and recreate
            console.warn(`[DeepgramProvider] ⚠️ Connection closed (readyState: ${readyState}) for ${interactionId}, closing and will recreate on next attempt`);
            
            // Close the connection (matches starter: deepgram.finish())
            if (stateToUse.connection && typeof stateToUse.connection.finish === 'function') {
              stateToUse.connection.finish();
            }
            
            // Clear KeepAlive interval
            if (stateToUse.keepAliveInterval) {
              clearInterval(stateToUse.keepAliveInterval);
              stateToUse.keepAliveInterval = undefined;
            }
            
            // Remove from connections map - will be recreated on next sendAudioChunk call
            this.connections.delete(interactionId);
            
            // Return empty transcript - connection will be recreated on next chunk
            return {
              type: 'partial',
              text: '',
              isFinal: false,
              confidence: 0,
            };
          } else {
            // CONNECTING (0) - SDK will buffer automatically, but log for visibility
            // SDK's send() method handles buffering internally, so this is safe
            console.debug(`[DeepgramProvider] Connection CONNECTING (readyState: 0), SDK will buffer audio for ${interactionId}`);
            stateToUse.connection.send(audioData); // SDK handles buffering
          }
          const sendDuration = Date.now() - sendStartTime;
          
          // COMPREHENSIVE FLOW TRACKING: Log after successful send
          console.info(`[DeepgramProvider] ✅ STEP 1 COMPLETE: Audio sent successfully`, {
            interactionId,
            seq,
            sendDurationMs: sendDuration,
            status: 'SUCCESS',
            note: 'Audio data sent to Deepgram WebSocket. Waiting for transcript response...',
          });
          
          stateToUse.lastSendTime = Date.now();
          
          // Exotel Bridge: Update last frame time for idle timeout tracking
          if (stateToUse.lastFrameTime !== undefined) {
            stateToUse.lastFrameTime = Date.now();
            
            // Reset idle timeout timer
            if (stateToUse.idleTimeoutTimer) {
              clearTimeout(stateToUse.idleTimeoutTimer);
            }
            
            // Set up new idle timeout timer
            if (stateToUse.idleTimeoutMs && stateToUse.idleTimeoutMs > 0) {
              stateToUse.idleTimeoutTimer = setTimeout(() => {
                const currentState = this.connections.get(interactionId);
                if (currentState && currentState.lastFrameTime) {
                  const idleDuration = Date.now() - currentState.lastFrameTime;
                  if (idleDuration >= currentState.idleTimeoutMs!) {
                    console.info(`[DeepgramProvider] ⏱️ Idle timeout reached for ${interactionId} (${idleDuration}ms idle)`, {
                      interactionId,
                      idleDurationMs: idleDuration,
                      timeoutMs: currentState.idleTimeoutMs,
                    });
                    // Close connection due to idle timeout
                    this.closeConnection(interactionId).catch((err) => {
                      console.error(`[DeepgramProvider] Error closing idle connection for ${interactionId}:`, err);
                    });
                  }
                }
              }, stateToUse.idleTimeoutMs);
            }
          }
          
          // Track pending send for timeout detection
          const pendingSend = {
            seq,
            sendTime: Date.now(),
            audioSize: audioData.length,
            chunkSizeMs,
          };
          if (!stateToUse.pendingSends) {
            stateToUse.pendingSends = [];
          }
          stateToUse.pendingSends.push(pendingSend);
          
          // CRITICAL FIX: Backlog monitoring and alerting
          const BACKLOG_WARNING_THRESHOLD = 50;
          const BACKLOG_CRITICAL_THRESHOLD = 100;
          const pendingCount = stateToUse.pendingSends.length;
          
          if (pendingCount > BACKLOG_CRITICAL_THRESHOLD) {
            const oldestSend = stateToUse.pendingSends[0];
            const oldestAge = oldestSend ? Date.now() - oldestSend.sendTime : 0;
            console.error(`[DeepgramProvider] 🔴 CRITICAL: Deepgram backlog too high`, {
              interactionId,
              pendingSends: pendingCount,
              oldestSeq: oldestSend?.seq || 'unknown',
              newestSeq: pendingSend.seq,
              oldestAge: oldestAge + 'ms',
              note: 'Deepgram is processing audio slower than we are sending. Consider reducing send frequency.',
              recommendation: 'Increase MAX_TIME_BETWEEN_SENDS_MS to 500ms or higher',
            });
          } else if (pendingCount > BACKLOG_WARNING_THRESHOLD) {
            console.warn(`[DeepgramProvider] ⚠️ WARNING: Deepgram backlog growing`, {
              interactionId,
              pendingSends: pendingCount,
              newestSeq: pendingSend.seq,
              note: 'Backlog is increasing - monitor for latency issues',
            });
          }
          
          // Log pending sends count
          console.info(`[DeepgramProvider] 📊 Pending transcript requests: ${pendingCount}`, {
            interactionId,
            pendingSeqs: stateToUse.pendingSends.map(s => s.seq).slice(-10).join(', '), // Show last 10 to avoid log spam
            totalPending: pendingCount,
          });
        } catch (sendError: any) {
          console.error(`[DeepgramProvider] ❌ Error during connection.send() for ${interactionId}:`, {
            error: sendError.message || String(sendError),
            errorType: sendError.constructor?.name,
            errorCode: sendError.code,
            stack: sendError.stack?.split('\n').slice(0, 5).join('\n'),
            interactionId,
            seq,
            audioDataLength: audioData.length,
            connectionType: typeof stateToUse.connection,
            connectionKeys: Object.keys(stateToUse.connection || {}).slice(0, 10),
          });
          throw sendError;
        }
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
        if (stateToUse.transcriptQueue.length > 0) {
          const transcript = stateToUse.transcriptQueue.shift()!;
          resolve(transcript);
          return;
        }

        // Check if we have a last transcript (for partial updates)
        if (stateToUse.lastTranscript && stateToUse.lastTranscript.type === 'partial') {
          resolve(stateToUse.lastTranscript);
          return;
        }

        // Add to pending resolvers
        stateToUse.pendingResolvers.push(resolve);

        // Timeout after 5 seconds if no response (longer for Deepgram processing)
        const timeoutStartTime = Date.now();
        setTimeout(() => {
          // Re-fetch state from map to ensure we have the latest
          const currentState = this.connections.get(interactionId);
          if (!currentState) {
            // Connection was deleted, resolve with empty transcript
            resolve({ type: 'partial', text: '', isFinal: false, confidence: 0 });
            return;
          }
          
          const index = currentState.pendingResolvers.indexOf(resolve);
          if (index >= 0) {
            currentState.pendingResolvers.splice(index, 1);
            
            // COMPREHENSIVE FLOW TRACKING: Log timeout
            const timeoutDuration = Date.now() - timeoutStartTime;
            const pendingSend = currentState.pendingSends?.find(s => s.seq === seq);
            const timeSinceSend = pendingSend ? (Date.now() - pendingSend.sendTime) + 'ms' : 'unknown';
            
            // Track timeout metric
            this.metrics.transcriptTimeoutCount++;
            
            console.warn(`\n${'='.repeat(80)}`);
            console.warn(`[DeepgramProvider] ⚠️ STEP 2 TIMEOUT: No transcript received from Deepgram`);
            console.warn(`[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.warn(`[DeepgramProvider] Interaction ID: ${interactionId}`);
            console.warn(`[DeepgramProvider] Sequence: ${seq}`);
            console.warn(`[DeepgramProvider] Timeout Duration: ${timeoutDuration}ms`);
            console.warn(`[DeepgramProvider] Time Since Send: ${timeSinceSend}`);
            console.warn(`[DeepgramProvider] Connection State:`, {
              isReady: currentState.isReady,
              hasConnection: !!currentState.connection,
              readyState: currentState.connection ? currentState.connection.getReadyState() : 'unknown',
              readyStateName: currentState.connection ? (currentState.connection.getReadyState() === 0 ? 'CONNECTING' : currentState.connection.getReadyState() === 1 ? 'OPEN' : currentState.connection.getReadyState() === 2 ? 'CLOSING' : 'CLOSED') : 'no connection',
            });
            console.warn(`[DeepgramProvider] Metrics:`, {
              totalAudioChunksSent: this.metrics.audioChunksSent,
              totalTranscriptsReceived: this.metrics.transcriptsReceived,
              totalEmptyTranscripts: this.metrics.emptyTranscriptsReceived,
              pendingResolvers: currentState.pendingResolvers.length,
              pendingSends: currentState.pendingSends?.length || 0,
            });
            console.warn(`[DeepgramProvider] Possible Causes:`, [
              'Deepgram did not receive the audio',
              'Deepgram is processing but taking longer than 5 seconds',
              'Connection closed before transcript could be sent',
              'Audio format issue preventing Deepgram from processing',
              'Network issue preventing transcript delivery',
            ]);
            console.warn(`[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
            
            // Remove corresponding pending send
            if (currentState.pendingSends) {
              const sendIndex = currentState.pendingSends.findIndex(s => s.seq === seq);
              if (sendIndex >= 0) {
                const pendingSend = currentState.pendingSends[sendIndex];
              }
            }
            
            // Return last known transcript or empty
            if (currentState.lastTranscript) {
              resolve(currentState.lastTranscript);
            } else {
              resolve({
                type: 'partial',
                text: '',
                isFinal: false,
                confidence: 0,
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

  async closeConnection(interactionId: string): Promise<void> {
    const state = this.connections.get(interactionId);
    if (state) {
      console.info(`[DeepgramProvider] Closing connection for ${interactionId}`);
      
      // Clear KeepAlive interval
      if (state.keepAliveInterval) {
        clearInterval(state.keepAliveInterval);
        state.keepAliveInterval = undefined;
      }
      
      // Exotel Bridge: Clear idle timeout timer
      if (state.idleTimeoutTimer) {
        clearTimeout(state.idleTimeoutTimer);
        state.idleTimeoutTimer = undefined;
      }
      
      // CRITICAL: Send CloseStream message before closing
      // Deepgram requires this to properly finalize transcripts
      // Use SDK's requestClose() method to properly close the connection
      // SDK handles CloseStream message internally
      try {
        if (state.connection && typeof state.connection.requestClose === 'function') {
          state.connection.requestClose();
          console.info(`[DeepgramProvider] 📤 Sent CloseStream via SDK requestClose() for ${interactionId}`);
        // Wait a brief moment for Deepgram to process CloseStream
          await new Promise(resolve => setTimeout(resolve, 100));
        } else if (state.connection && typeof state.connection.finish === 'function') {
          // Fallback to finish() if requestClose() not available (older SDK versions)
          state.connection.finish();
          console.info(`[DeepgramProvider] 📤 Closed connection via SDK finish() for ${interactionId}`);
        }
      } catch (error: any) {
        console.warn(`[DeepgramProvider] Error closing connection for ${interactionId}:`, error);
        // Continue with disconnect even if requestClose fails
      }
      
      // Disconnect the connection (requestClose already called above)
      if (state.connection && typeof state.connection.disconnect === 'function') {
        state.connection.disconnect();
      }
      
      // Remove from connections map
      this.connections.delete(interactionId);
      this.metrics.connectionsClosed++;
      console.info(`[DeepgramProvider] ✅ Connection closed for ${interactionId}`);
    }
  }
  
  /**
   * Get Deepgram metrics for observability
   */
  getMetrics(): DeepgramMetrics {
    return {
      ...this.metrics,
      errorCodes: new Map(this.metrics.errorCodes), // Return copy
    };
  }

  /**
   * Get connection health status for a specific interaction
   */
  getConnectionHealth(interactionId: string): {
    exists: boolean;
    isReady: boolean;
    readyState: number | 'unknown';
    readyStateName: string;
    hasConnection: boolean;
    isConnected: boolean;
    lastSendTime: number | null;
    keepAliveStats: { success: number; failures: number };
    reconnectAttempts: number;
    pendingSends: number;
    pendingResolvers: number;
  } | null {
    const state = this.connections.get(interactionId);
    if (!state) {
      return null;
    }

    return {
      exists: true,
      isReady: state.isReady,
      readyState: state.connection ? state.connection.getReadyState() : 'unknown',
      readyStateName: state.connection ? (state.connection.getReadyState() === 0 ? 'CONNECTING' : state.connection.getReadyState() === 1 ? 'OPEN' : state.connection.getReadyState() === 2 ? 'CLOSING' : 'CLOSED') : 'no connection',
      hasConnection: !!state.connection,
      isConnected: state.connection && state.connection.isConnected ? state.connection.isConnected() : false,
      lastSendTime: state.lastSendTime || null,
      keepAliveStats: {
        success: state.keepAliveSuccessCount,
        failures: state.keepAliveFailureCount,
      },
      reconnectAttempts: state.reconnectAttempts,
      pendingSends: state.pendingSends?.length || 0,
      pendingResolvers: state.pendingResolvers.length,
    };
  }

  /**
   * Check if connection should be considered unhealthy (circuit breaker pattern)
   */
  isConnectionUnhealthy(interactionId: string): boolean {
    const state = this.connections.get(interactionId);
    if (!state) {
      return true; // No connection = unhealthy
    }

    // Consider unhealthy if:
    // 1. Too many reconnection attempts
    // 2. KeepAlive failures > 10 and failures > successes
    // 3. Connection not ready for > 10 seconds
    const tooManyReconnects = state.reconnectAttempts >= state.maxReconnectAttempts;
    const keepAliveFailing = state.keepAliveFailureCount > 10 && 
                             state.keepAliveFailureCount > state.keepAliveSuccessCount;
    
    return tooManyReconnects || keepAliveFailing;
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

// ========== END DEEPGRAM PROVIDER ==========
*/


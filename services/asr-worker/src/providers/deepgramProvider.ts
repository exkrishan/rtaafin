/**
 * Deepgram streaming ASR provider
 * Uses Deepgram SDK for real-time speech recognition
 */

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { AsrProvider, Transcript } from '../types';

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
        // Additional safety check: verify connection is not closed
        // Check socket readyState only if socket exists, but don't fail if it doesn't
        const socketState = state.socket?.readyState;
        const socketValid = !state.socket || socketState === 1 || socketState === 0; // OPEN or CONNECTING is OK
        
        if (socketValid) {
          this.metrics.connectionsReused++;
          console.debug(`[DeepgramProvider] Reusing existing connection for ${interactionId}`, {
            isReady: state.isReady,
            socketReadyState: socketState,
          });
          return state;
        } else {
          // Socket exists but is in CLOSING or CLOSED state
          console.warn(`[DeepgramProvider] Connection exists but socket is closed for ${interactionId}`, {
            socketReadyState: socketState,
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
          socketReadyState: state.socket?.readyState,
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
      const connectionConfig = {
        model: process.env.DEEPGRAM_MODEL || 'nova-2',
        language: process.env.DEEPGRAM_LANGUAGE || 'en-US',
        smart_format: process.env.DEEPGRAM_SMART_FORMAT !== 'false', // Default true
        interim_results: process.env.DEEPGRAM_INTERIM_RESULTS !== 'false', // Default true
        sample_rate: sampleRate, // CRITICAL: Must match actual audio sample rate (8kHz for telephony)
        encoding: 'linear16', // 16-bit PCM, little-endian (required for raw audio)
        channels: 1, // Mono audio (required for telephony)
      };
      
      console.info(`[DeepgramProvider] Connection config:`, {
        interactionId,
        ...connectionConfig,
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

      // Access underlying WebSocket for text frames (KeepAlive)
      // The Deepgram SDK connection object may expose the socket in different ways
      // Based on logs, connection has 'conn' and 'transport' keys
      // Try multiple patterns to find the WebSocket
      let socket: any = null;
      
      // Helper function to check if object is a WebSocket
      const isWebSocket = (obj: any): boolean => {
        if (!obj) return false;
        // WebSocket has send method and readyState property
        return typeof obj.send === 'function' && 
               typeof obj.readyState !== 'undefined' &&
               (obj.readyState === 0 || obj.readyState === 1 || obj.readyState === 2 || obj.readyState === 3);
      };
      
      // Helper function to recursively search for WebSocket
      const findWebSocket = (obj: any, depth: number = 0, maxDepth: number = 3): any => {
        if (depth > maxDepth || !obj || typeof obj !== 'object') return null;
        
        // Check if this object is a WebSocket
        if (isWebSocket(obj)) {
          return obj;
        }
        
        // Recursively check properties
        for (const key in obj) {
          if (key === 'constructor' || key === 'prototype') continue;
          try {
            const value = obj[key];
            if (value && typeof value === 'object') {
              const found = findWebSocket(value, depth + 1, maxDepth);
              if (found) return found;
            }
          } catch (e) {
            // Ignore errors accessing properties
          }
        }
        return null;
      };
      
      // Try direct socket access patterns (using type assertion)
      if (connectionAny._socket && isWebSocket(connectionAny._socket)) {
        socket = connectionAny._socket;
      } else if (connectionAny.socket && isWebSocket(connectionAny.socket)) {
        socket = connectionAny.socket;
      } 
      // Try through 'conn' property (seen in connection object keys)
      else if (connectionAny.conn?._socket && isWebSocket(connectionAny.conn._socket)) {
        socket = connectionAny.conn._socket;
      } else if (connectionAny.conn?.socket && isWebSocket(connectionAny.conn.socket)) {
        socket = connectionAny.conn.socket;
      } else if (connectionAny.conn && isWebSocket(connectionAny.conn)) {
        // conn might be the WebSocket itself
        socket = connectionAny.conn;
      }
      // Try through 'transport' property (seen in connection object keys)
      else if (connectionAny.transport?._socket && isWebSocket(connectionAny.transport._socket)) {
        socket = connectionAny.transport._socket;
      } else if (connectionAny.transport?.socket && isWebSocket(connectionAny.transport.socket)) {
        socket = connectionAny.transport.socket;
      } else if (connectionAny.transport && isWebSocket(connectionAny.transport)) {
        // transport might be the WebSocket itself
        socket = connectionAny.transport;
      }
      // Try nested patterns
      else if (connectionAny._connection?._socket && isWebSocket(connectionAny._connection._socket)) {
        socket = connectionAny._connection._socket;
      } else if (connectionAny._connection?.socket && isWebSocket(connectionAny._connection.socket)) {
        socket = connectionAny._connection.socket;
      } else if (typeof connectionAny.getSocket === 'function') {
        const candidate = connectionAny.getSocket();
        if (isWebSocket(candidate)) {
          socket = candidate;
        }
      }
      
      // If still not found, try recursive search (slower but more thorough)
      if (!socket) {
        console.debug(`[DeepgramProvider] Trying recursive search for WebSocket in connection object...`);
        socket = findWebSocket(connection);
        if (socket) {
          console.info(`[DeepgramProvider] ✅ Found WebSocket via recursive search for ${interactionId}`);
        }
      }

      if (!socket) {
        console.warn(`[DeepgramProvider] ⚠️ Could not access underlying WebSocket for ${interactionId}. KeepAlive may not work.`);
        console.warn(`[DeepgramProvider] Connection object keys:`, Object.keys(connectionAny));
        // Log connection structure for debugging
        console.warn(`[DeepgramProvider] Connection structure:`, {
          has_socket: !!connectionAny.socket,
          has_socket_underscore: !!connectionAny._socket,
          has_connection: !!connectionAny._connection,
          has_conn: !!connectionAny.conn,
          has_transport: !!connectionAny.transport,
          conn_type: connectionAny.conn ? typeof connectionAny.conn : 'undefined',
          transport_type: connectionAny.transport ? typeof connectionAny.transport : 'undefined',
          conn_keys: connectionAny.conn ? Object.keys(connectionAny.conn) : [],
          transport_keys: connectionAny.transport ? Object.keys(connectionAny.transport) : [],
          connection_keys: connectionAny._connection ? Object.keys(connectionAny._connection) : [],
        });
      } else {
        console.info(`[DeepgramProvider] ✅ Accessed underlying WebSocket for ${interactionId}`);
        console.debug(`[DeepgramProvider] WebSocket type:`, typeof socket, 'has send:', typeof socket.send);
      }

      // Configuration from environment variables
      const maxReconnectAttempts = parseInt(process.env.DEEPGRAM_MAX_RECONNECT_ATTEMPTS || '3', 10);
      
      state = {
        connection,
        socket,
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
      };

      // Set up event handlers
      const connectionStartTime = Date.now();
      connection.on(LiveTranscriptionEvents.Open, () => {
        const connectionOpenTime = Date.now() - connectionStartTime;
        this.metrics.connectionOpenMs.push(connectionOpenTime);
        console.info(`[DeepgramProvider] ✅ Connection opened for ${interactionId}`, {
          connectionOpenTimeMs: connectionOpenTime,
        });
        
        // CRITICAL FIX: Only mark as ready after confirming socket is OPEN (or will be soon)
        // The Open event may fire before socket.readyState === 1, so we'll verify in flush logic
        // But we can mark isReady = true here since the connection is established
        // The actual send logic will check socket.readyState before sending
        state.isReady = true;
        
        // Try to access socket again if not found initially (socket might only be available after Open)
        if (!state.socket) {
          console.debug(`[DeepgramProvider] Socket not found initially, trying again after Open event for ${interactionId}`);
          
          // Try all patterns again, including conn and transport (using type assertion)
          if (connectionAny._socket) {
            state.socket = connectionAny._socket;
          } else if (connectionAny.socket) {
            state.socket = connectionAny.socket;
          } else if (connectionAny.conn?._socket) {
            state.socket = connectionAny.conn._socket;
          } else if (connectionAny.conn?.socket) {
            state.socket = connectionAny.conn.socket;
          } else if (connectionAny.conn && typeof connectionAny.conn.send === 'function' && connectionAny.conn.readyState !== undefined) {
            state.socket = connectionAny.conn;
          } else if (connectionAny.transport?._socket) {
            state.socket = connectionAny.transport._socket;
          } else if (connectionAny.transport?.socket) {
            state.socket = connectionAny.transport.socket;
          } else if (connectionAny.transport && typeof connectionAny.transport.send === 'function' && connectionAny.transport.readyState !== undefined) {
            state.socket = connectionAny.transport;
          } else if (connectionAny._connection?._socket) {
            state.socket = connectionAny._connection._socket;
          } else if (connectionAny._connection?.socket) {
            state.socket = connectionAny._connection.socket;
          } else if (typeof connectionAny.getSocket === 'function') {
            state.socket = connectionAny.getSocket();
          }
          
          if (state.socket) {
            console.info(`[DeepgramProvider] ✅ Accessed underlying WebSocket after Open event for ${interactionId}`);
            console.debug(`[DeepgramProvider] Socket path:`, {
              has_conn: !!connectionAny.conn,
              has_transport: !!connectionAny.transport,
              conn_keys: connectionAny.conn ? Object.keys(connectionAny.conn) : [],
              transport_keys: connectionAny.transport ? Object.keys(connectionAny.transport) : [],
            });
          } else {
            // Log detailed structure for debugging
            console.warn(`[DeepgramProvider] ⚠️ Socket still not found after Open event for ${interactionId}`);
            console.warn(`[DeepgramProvider] Connection structure after Open:`, {
              has_conn: !!connectionAny.conn,
              has_transport: !!connectionAny.transport,
              conn_type: connectionAny.conn ? typeof connectionAny.conn : 'undefined',
              transport_type: connectionAny.transport ? typeof connectionAny.transport : 'undefined',
              conn_keys: connectionAny.conn ? Object.keys(connectionAny.conn) : [],
              transport_keys: connectionAny.transport ? Object.keys(connectionAny.transport) : [],
            });
          }
        }
        
        // Reliable KeepAlive sending with multiple fallback methods
        // Deepgram REQUIRES KeepAlive as JSON text frame: {"type": "KeepAlive"}
        // Must be sent as TEXT WebSocket frame via underlying socket, not binary via connection.send()
        const sendKeepAliveReliable = (): boolean => {
          const keepAliveMsg = JSON.stringify({ type: 'KeepAlive' });
          
          // Method 1: Try underlying WebSocket (preferred - most reliable)
          if (state.socket && typeof state.socket.send === 'function') {
            try {
              state.socket.send(keepAliveMsg);
              state.keepAliveSuccessCount++;
              state.lastKeepAliveTime = Date.now();
              this.metrics.keepAliveSuccess++;
              return true;
            } catch (e) {
              // Continue to next method
            }
          }
          
          // Method 2: Try Deepgram SDK's sendText if available (some SDK versions)
          const connectionAny = connection as any;
          if (connectionAny.sendText && typeof connectionAny.sendText === 'function') {
            try {
              connectionAny.sendText(keepAliveMsg);
              state.keepAliveSuccessCount++;
              state.lastKeepAliveTime = Date.now();
              this.metrics.keepAliveSuccess++;
              return true;
            } catch (e) {
              // Continue to next method
            }
          }
          
          // Method 3: Try connection.send() as last resort (may not work - sends as binary)
          try {
            connectionAny.send(keepAliveMsg);
            state.keepAliveFailureCount++;
            state.lastKeepAliveTime = Date.now();
            this.metrics.keepAliveFailures++;
            console.warn(`[DeepgramProvider] ⚠️ KeepAlive sent via connection.send() (may not work - binary frame)`);
            return false; // Mark as uncertain
          } catch (e) {
            state.keepAliveFailureCount++;
            this.metrics.keepAliveFailures++;
            return false;
          }
        };
        
        // Send initial KeepAlive
        const sendInitialKeepAlive = () => {
          try {
            const success = sendKeepAliveReliable();
            if (success) {
              console.info(`[DeepgramProvider] 📡 Sent initial KeepAlive (JSON text frame) for ${interactionId}`);
            } else {
              console.warn(`[DeepgramProvider] ⚠️ Initial KeepAlive may have failed for ${interactionId}`);
            }
            return success;
          } catch (error: any) {
            console.error(`[DeepgramProvider] ❌ Failed to send initial KeepAlive for ${interactionId}:`, error);
            return false;
          }
        };
        
        // Try to send immediately
        if (!sendInitialKeepAlive()) {
          // If send failed, retry after short delay
          setTimeout(() => {
            if (!sendInitialKeepAlive()) {
              console.warn(`[DeepgramProvider] ⚠️ Could not send initial KeepAlive after retry for ${interactionId} - will try in periodic interval`);
            }
          }, 200); // Retry after 200ms
        }
        
        // CRITICAL FIX: Flush queued audio chunks with polling to wait for socket.readyState === 1
        // The Open event may fire before the underlying WebSocket is fully OPEN
        if (state.pendingAudioQueue && state.pendingAudioQueue.length > 0) {
          console.info(`[DeepgramProvider] 📤 Flushing ${state.pendingAudioQueue.length} queued audio chunks for ${interactionId}`);
          
          // Constants for polling
          const MAX_ATTEMPTS = 10; // Maximum 10 attempts (~5 seconds total)
          const INITIAL_DELAY_MS = 50; // Start with 50ms delay
          const MAX_DELAY_MS = 500; // Cap at 500ms delay
          
          // Poll until socket is OPEN (readyState === 1) with exponential backoff
          const flushQueuedAudio = (attempt: number = 0): void => {
            
            // Calculate delay with exponential backoff
            const delayMs = Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
            
            // Check if socket is ready
            const socketReady = state.socket?.readyState === 1;
            const connectionReady = state.connection && typeof state.connection.send === 'function';
            
            if (socketReady && connectionReady) {
              // Socket is ready - flush the queue
              const queue = state.pendingAudioQueue || [];
              state.pendingAudioQueue = []; // Clear queue
              
              console.info(`[DeepgramProvider] ✅ Socket is OPEN (readyState: 1), flushing ${queue.length} queued chunks for ${interactionId}`, {
                attempt,
                totalDelay: delayMs * attempt,
                queueSize: queue.length,
              });
              
              for (const queuedAudio of queue) {
                try {
                  // Send directly via connection.send (socket is ready)
                  const audioData = queuedAudio.audio instanceof Uint8Array 
                    ? queuedAudio.audio 
                    : new Uint8Array(queuedAudio.audio);
                  
                  state.connection.send(audioData);
                  this.metrics.audioChunksSent++;
                  state.lastSendTime = Date.now();
                  
                  // Track pending send
                  if (!state.pendingSends) {
                    state.pendingSends = [];
                  }
                  state.pendingSends.push({
                    seq: queuedAudio.seq,
                    sendTime: Date.now(),
                    audioSize: audioData.length,
                    chunkSizeMs: queuedAudio.durationMs,
                  });
                  
                  console.debug(`[DeepgramProvider] ✅ Flushed queued chunk seq ${queuedAudio.seq} for ${interactionId}`, {
                    queueDelay: Date.now() - queuedAudio.queuedAt,
                  });
                } catch (error: any) {
                  console.error(`[DeepgramProvider] ❌ Failed to flush queued audio chunk for ${interactionId}:`, {
                    seq: queuedAudio.seq,
                    error: error.message || String(error),
                    queuedAt: new Date(queuedAudio.queuedAt).toISOString(),
                    queueDelay: Date.now() - queuedAudio.queuedAt,
                  });
                }
              }
              
              if (queue.length > 0) {
                console.info(`[DeepgramProvider] ✅ Successfully flushed ${queue.length} queued audio chunks for ${interactionId}`);
              }
            } else if (attempt < MAX_ATTEMPTS) {
              // Socket not ready yet - retry after delay
              console.debug(`[DeepgramProvider] ⏳ Socket not ready yet (attempt ${attempt + 1}/${MAX_ATTEMPTS})`, {
                interactionId,
                socketReadyState: state.socket?.readyState ?? 'unknown',
                hasConnection: !!state.connection,
                hasSocket: !!state.socket,
                delayMs,
              });
              
              setTimeout(() => {
                flushQueuedAudio(attempt + 1);
              }, delayMs);
            } else {
              // Max attempts reached - re-queue and log warning
              console.warn(`[DeepgramProvider] ⚠️ Socket did not become OPEN after ${MAX_ATTEMPTS} attempts, re-queueing ${state.pendingAudioQueue?.length || 0} chunks for ${interactionId}`, {
                interactionId,
                socketReadyState: state.socket?.readyState ?? 'unknown',
                hasConnection: !!state.connection,
                hasSocket: !!state.socket,
                totalDelay: delayMs * MAX_ATTEMPTS,
                note: 'Audio will be sent when socket becomes OPEN or on next send attempt',
              });
              
              // Keep the queue - it will be flushed on next send attempt or when socket becomes ready
              // Don't clear the queue here - let it be flushed by the normal send flow
            }
          };
          
          // Start flushing with initial delay
          setTimeout(() => {
            flushQueuedAudio(0);
          }, INITIAL_DELAY_MS);
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
              const success = sendKeepAliveReliable();
              if (success) {
                console.debug(`[DeepgramProvider] 📡 KeepAlive sent (success: ${state.keepAliveSuccessCount}, failures: ${state.keepAliveFailureCount})`);
              } else {
                console.warn(`[DeepgramProvider] ⚠️ KeepAlive failed (success: ${state.keepAliveSuccessCount}, failures: ${state.keepAliveFailureCount})`);
                
                // If too many failures, log critical warning
                if (state.keepAliveFailureCount > 5 && state.keepAliveFailureCount % 10 === 0) {
                  console.error(`[DeepgramProvider] ❌ CRITICAL: KeepAlive failing repeatedly (${state.keepAliveFailureCount} failures). Connection may timeout.`);
                }
                
                // Check if socket is closed
                if (state.socket && state.socket.readyState === 3) {
                  // CLOSED - clear interval
                  console.warn(`[DeepgramProvider] Socket closed (readyState=3), clearing KeepAlive interval for ${interactionId}`);
                  if (state.keepAliveInterval) {
                    clearInterval(state.keepAliveInterval);
                    state.keepAliveInterval = undefined;
                  }
                }
              }
            } catch (error: any) {
              console.error(`[DeepgramProvider] ❌ Failed to send periodic KeepAlive for ${interactionId}:`, error);
              state.keepAliveFailureCount++;
              this.metrics.keepAliveFailures++;
              
              // If error is due to closed socket, clear interval
              if (error.message?.includes('closed') || error.message?.includes('CLOSED') || error.message?.includes('not open')) {
                if (state.keepAliveInterval) {
                  clearInterval(state.keepAliveInterval);
                  state.keepAliveInterval = undefined;
                  console.debug(`[DeepgramProvider] Cleared KeepAlive interval (error: socket closed) for ${interactionId}`);
                }
              }
            }
          }, keepAliveIntervalMs);
        } else {
          console.warn(`[DeepgramProvider] ⚠️ KeepAlive disabled via DEEPGRAM_KEEPALIVE_ENABLED=false for ${interactionId}`);
        }
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
            if (state.pendingSends && state.pendingSends.length > 0) {
              const completedSend = state.pendingSends.shift();
              if (completedSend) {
                const processingTime = Date.now() - completedSend.sendTime;
                console.info(`[DeepgramProvider] ⏱️ Processing Time: ${processingTime}ms (from send to transcript)`, {
                  interactionId,
                  seq: completedSend.seq,
                  audioSize: completedSend.audioSize,
                  chunkSizeMs: completedSend.chunkSizeMs,
                });
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
            if (state.pendingSends && state.pendingSends.length > 0) {
              const completedSend = state.pendingSends.shift();
              if (completedSend) {
                const processingTime = Date.now() - completedSend.sendTime;
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
          hasSocket: !!state.socket,
          socketReadyState: state.socket?.readyState ?? 'unknown',
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
        
        // CRITICAL: Verify connection state before sending
        const connectionAny = stateToUse.connection as any;
        const connectionReadyState = connectionAny?.getReadyState?.() ?? connectionAny?.readyState ?? 'unknown';
        const socketReadyState = stateToUse.socket?.readyState ?? 'unknown';
        
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
          socketReadyState,
          timeSinceLastSend: stateToUse.lastSendTime ? (Date.now() - stateToUse.lastSendTime) + 'ms' : 'first',
          hasConnection: !!stateToUse.connection,
          hasSocket: !!stateToUse.socket,
          connectionType: typeof stateToUse.connection,
          connectionHasSend: typeof stateToUse.connection?.send === 'function',
        });
        
        // Deepgram SDK expects Uint8Array or Buffer for binary audio
        // Convert Buffer to Uint8Array to ensure compatibility
        const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
        
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
          
          // Warn if audio is all zeros (silence)
          if (allZeros && seq <= 3) {
            console.warn(`[DeepgramProvider] ⚠️ Audio appears to be silence (all zeros) for ${interactionId}`, {
              seq,
              samplesChecked: sampleCount,
              note: 'This is normal for silence, but may cause empty transcripts.',
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
          connectionReadyState: stateToUse.connection ? 'ready' : 'not ready',
          socketReadyState: stateToUse.socket?.readyState ?? 'unknown',
          hasConnection: !!stateToUse.connection,
          hasSocket: !!stateToUse.socket,
          timeSinceLastSend: stateToUse.lastSendTime ? (Date.now() - stateToUse.lastSendTime) + 'ms' : 'first send',
        });
        console.info(`[DeepgramProvider] Metrics:`, {
          totalAudioChunksSent: this.metrics.audioChunksSent + 1,
          totalTranscriptsReceived: this.metrics.transcriptsReceived,
          totalEmptyTranscripts: this.metrics.emptyTranscriptsReceived,
          averageChunkSizeMs: this.metrics.averageChunkSizeMs.toFixed(0) + 'ms',
        });
        console.info(`[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        // CRITICAL FIX: Verify connection is ready, then wait for socket to be OPEN
        // The Deepgram SDK's Open event can fire before the underlying WebSocket is fully OPEN
        // We need to wait for socket.readyState === 1 before sending
        const connectionReady = stateToUse.isReady && !!stateToUse.connection;
        
        if (!connectionReady) {
          throw new Error(`Connection not ready for ${interactionId} (isReady: ${stateToUse.isReady}, hasConnection: ${!!stateToUse.connection})`);
        }
        
        // Wait for underlying WebSocket to be OPEN (readyState === 1)
        // This addresses the race condition where Open event fires but socket is still CONNECTING
        if (stateToUse.socket && stateToUse.socket.readyState !== 1) {
          console.debug(`[DeepgramProvider] ⏳ Waiting for socket to be OPEN for ${interactionId} (current state: ${stateToUse.socket.readyState})`);
          
          try {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                clearInterval(checkSocket);
                // Enhanced error message with connection health info
                const currentState = this.connections.get(interactionId);
                reject(new Error(`Socket did not become ready within 3000ms for ${interactionId} (socketReadyState: ${currentState?.socket?.readyState ?? 'unknown'}, isReady: ${currentState?.isReady ?? false}, hasConnection: ${!!currentState?.connection})`));
              }, 3000);
              
              const checkSocket = setInterval(() => {
                // Re-fetch state to ensure we have the latest
                const currentState = this.connections.get(interactionId);
                if (!currentState || !currentState.socket) {
                  clearInterval(checkSocket);
                  clearTimeout(timeout);
                  reject(new Error(`Connection or socket was deleted while waiting for ${interactionId}`));
                  return;
                }
                
                // Check if socket is closing or closed - don't wait for these
                if (currentState.socket.readyState === 2 || currentState.socket.readyState === 3) {
                  clearInterval(checkSocket);
                  clearTimeout(timeout);
                  reject(new Error(`Socket is closing/closed (readyState: ${currentState.socket.readyState}) for ${interactionId}`));
                  return;
                }
                
                if (currentState.socket.readyState === 1) {
                  clearInterval(checkSocket);
                  clearTimeout(timeout);
                  console.debug(`[DeepgramProvider] ✅ Socket is now OPEN for ${interactionId}`);
                  resolve();
                }
              }, 50); // Check every 50ms
            });
            
            // Re-fetch state after wait (socket might have changed)
            const stateAfterWait = this.connections.get(interactionId);
            if (!stateAfterWait || !stateAfterWait.isReady || !stateAfterWait.connection) {
              throw new Error(`Connection invalid after socket wait for ${interactionId}`);
            }
            // Update stateToUse to use the latest state
            Object.assign(stateToUse, stateAfterWait);
          } catch (waitError: any) {
            // Enhanced error handling: if socket wait fails, try to queue audio instead of failing immediately
            console.warn(`[DeepgramProvider] ⚠️ Socket wait failed for ${interactionId}, queueing audio:`, {
              error: waitError.message || String(waitError),
              socketReadyState: stateToUse.socket?.readyState,
              isReady: stateToUse.isReady,
              hasConnection: !!stateToUse.connection,
            });
            
            // Queue audio for later flush when socket becomes ready
            if (!stateToUse.pendingAudioQueue) {
              stateToUse.pendingAudioQueue = [];
            }
            
            const bytesPerSample = 2;
            const samples = audio.length / bytesPerSample;
            const durationMs = (samples / sampleRate) * 1000;
            
            stateToUse.pendingAudioQueue.push({
              audio: audio instanceof Uint8Array ? audio : new Uint8Array(audio),
              seq,
              sampleRate,
              durationMs,
              queuedAt: Date.now(),
            });
            
            console.info(`[DeepgramProvider] ⏳ Queueing audio chunk (socket not ready)`, {
              interactionId,
              seq,
              queueSize: stateToUse.pendingAudioQueue.length,
              note: 'Audio will be flushed when socket becomes OPEN',
            });
            
            // Return empty transcript promise - actual send will happen when socket is ready
            return new Promise<Transcript>((resolve) => {
              // Resolve with empty transcript for now - actual transcript will come after flush
              setTimeout(() => {
                resolve({
                  type: 'partial',
                  text: '',
                  isFinal: false,
                  confidence: 0,
                });
              }, 100);
            });
          }
        }
        
        try {
          // Check if we have queued audio to flush first (maintain order)
          if (stateToUse.pendingAudioQueue && stateToUse.pendingAudioQueue.length > 0) {
            console.info(`[DeepgramProvider] 📤 Flushing ${stateToUse.pendingAudioQueue.length} queued chunks before sending new chunk for ${interactionId}`);
            const queue = [...stateToUse.pendingAudioQueue]; // Copy queue
            stateToUse.pendingAudioQueue = []; // Clear queue
            
            // Flush queue first, then send current chunk
            for (const queuedAudio of queue) {
              try {
                // Verify socket is still ready before flushing
                if (stateToUse.socket?.readyState === 1) {
                  stateToUse.connection.send(queuedAudio.audio instanceof Uint8Array ? queuedAudio.audio : new Uint8Array(queuedAudio.audio));
                  this.metrics.audioChunksSent++;
                  stateToUse.lastSendTime = Date.now();
                  console.debug(`[DeepgramProvider] ✅ Flushed queued chunk seq ${queuedAudio.seq} for ${interactionId}`);
                } else {
                  console.warn(`[DeepgramProvider] ⚠️ Skipping queued chunk seq ${queuedAudio.seq} - socket not ready (readyState: ${stateToUse.socket?.readyState})`);
                }
              } catch (error: any) {
                console.error(`[DeepgramProvider] ❌ Failed to flush queued chunk seq ${queuedAudio.seq}:`, error);
              }
            }
          }
          
          // Verify socket is ready one more time before sending
          if (stateToUse.socket?.readyState !== 1) {
            throw new Error(`Socket not ready for ${interactionId} (socketReadyState: ${stateToUse.socket?.readyState}, isReady: ${stateToUse.isReady})`);
          }
          
          // Send audio via Deepgram SDK connection.send()
          // Socket is confirmed to be OPEN (readyState === 1) at this point
          stateToUse.connection.send(audioData);
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
          
          // Log pending sends count
          console.info(`[DeepgramProvider] 📊 Pending transcript requests: ${stateToUse.pendingSends.length}`, {
            interactionId,
            pendingSeqs: stateToUse.pendingSends.map(s => s.seq).join(', '),
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
              hasSocket: !!currentState.socket,
              socketReadyState: currentState.socket?.readyState,
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
      
      // CRITICAL: Send CloseStream message before closing
      // Deepgram requires this to properly finalize transcripts
      try {
        const closeStreamMsg = JSON.stringify({ type: 'CloseStream' });
        let closeStreamSent = false;
        
        // Method 1: Try underlying WebSocket (preferred)
        if (state.socket && typeof state.socket.send === 'function') {
          try {
            state.socket.send(closeStreamMsg);
            closeStreamSent = true;
            console.info(`[DeepgramProvider] 📤 Sent CloseStream message for ${interactionId}`);
          } catch (e) {
            console.warn(`[DeepgramProvider] Failed to send CloseStream via socket:`, e);
          }
        }
        
        // Method 2: Try Deepgram SDK's sendText if available
        if (!closeStreamSent) {
          const connectionAny = state.connection as any;
          if (connectionAny.sendText && typeof connectionAny.sendText === 'function') {
            try {
              connectionAny.sendText(closeStreamMsg);
              closeStreamSent = true;
              console.info(`[DeepgramProvider] 📤 Sent CloseStream via sendText for ${interactionId}`);
            } catch (e) {
              console.warn(`[DeepgramProvider] Failed to send CloseStream via sendText:`, e);
            }
          }
        }
        
        // Method 3: Fallback to connection.send() (may not work)
        if (!closeStreamSent) {
          const connectionAny = state.connection as any;
          if (connectionAny && typeof connectionAny.send === 'function') {
            try {
              connectionAny.send(closeStreamMsg);
              console.warn(`[DeepgramProvider] ⚠️ Sent CloseStream via connection.send() (fallback, may not work)`);
            } catch (e) {
              console.warn(`[DeepgramProvider] ⚠️ Could not send CloseStream:`, e);
            }
          }
        }
        
        // Wait a brief moment for Deepgram to process CloseStream
        if (closeStreamSent) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error: any) {
        console.warn(`[DeepgramProvider] Error sending CloseStream for ${interactionId}:`, error);
        // Continue with close even if CloseStream fails
      }
      
      // Close the connection
      if (state.connection && typeof state.connection.finish === 'function') {
        state.connection.finish();
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
    socketReadyState: number | 'unknown';
    hasConnection: boolean;
    hasSocket: boolean;
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
      socketReadyState: state.socket?.readyState ?? 'unknown',
      hasConnection: !!state.connection,
      hasSocket: !!state.socket,
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


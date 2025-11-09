/**
 * Deepgram streaming ASR provider
 * Uses Deepgram SDK for real-time speech recognition
 */

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { AsrProvider, Transcript } from '../types';

interface ConnectionState {
  connection: any;
  socket?: any; // Underlying WebSocket for text frames
  isReady: boolean;
  transcriptQueue: Transcript[];
  pendingResolvers: Array<(transcript: Transcript) => void>;
  lastTranscript: Transcript | null;
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
  audioChunksSent: number;
  transcriptsReceived: number;
  emptyTranscriptsReceived: number;
  errors: number;
  errorCodes: Map<number, number>; // error code -> count
  keepAliveSuccess: number;
  keepAliveFailures: number;
  averageChunkSizeMs: number;
  averageLatencyMs: number;
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
    audioChunksSent: 0,
    transcriptsReceived: 0,
    emptyTranscriptsReceived: 0,
    errors: 0,
    errorCodes: new Map(),
    keepAliveSuccess: 0,
    keepAliveFailures: 0,
    averageChunkSizeMs: 0,
    averageLatencyMs: 0,
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
      const connectionConfig = {
        model: process.env.DEEPGRAM_MODEL || 'nova-2',
        language: process.env.DEEPGRAM_LANGUAGE || 'en-US',
        smart_format: process.env.DEEPGRAM_SMART_FORMAT !== 'false', // Default true
        interim_results: process.env.DEEPGRAM_INTERIM_RESULTS !== 'false', // Default true
        sample_rate: sampleRate,
        encoding: 'linear16',
        channels: 1,
      };
      
      console.info(`[DeepgramProvider] Connection config:`, {
        interactionId,
        ...connectionConfig,
      });
      
      const connection = this.client.listen.live(connectionConfig);
      
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
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.info(`[DeepgramProvider] ✅ Connection opened for ${interactionId}`);
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
          
          // CRITICAL: Log FULL transcript event structure for debugging
          console.info(`[DeepgramProvider] 📨 Transcript event received for ${interactionId}`, {
            hasChannel: !!data?.channel,
            hasAlternatives: !!data?.channel?.alternatives,
            alternativesCount: data?.channel?.alternatives?.length ?? 0,
            isFinal: data?.is_final ?? false,
            speechFinal: data?.speech_final ?? false,
            rawDataKeys: data ? Object.keys(data) : [],
            // Log full data structure (truncated for readability)
            fullDataPreview: data ? JSON.stringify(data).substring(0, 1000) : 'null',
          });
          
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
            // Track empty transcripts in metrics
            this.metrics.emptyTranscriptsReceived++;
            
            // Log empty transcripts to debug why Deepgram isn't returning text
            console.warn(`[DeepgramProvider] ⚠️ Empty transcript received from Deepgram for ${interactionId}`, {
              isFinal,
              hasChannel: !!data.channel,
              hasAlternatives: !!data.channel?.alternatives,
              alternativesCount: data.channel?.alternatives?.length || 0,
              emptyTranscriptRate: ((this.metrics.emptyTranscriptsReceived / this.metrics.transcriptsReceived) * 100).toFixed(1) + '%',
              rawData: JSON.stringify(data).substring(0, 200), // First 200 chars for debugging
            });
          }
        } catch (error: any) {
          console.error(`[DeepgramProvider] Error processing transcript for ${interactionId}:`, error);
          this.metrics.errors++;
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        const errorCode = error.code;
        const errorMessage = error.message || String(error);
        
        this.metrics.errors++;
        if (errorCode) {
          this.metrics.errorCodes.set(errorCode, (this.metrics.errorCodes.get(errorCode) || 0) + 1);
        }
        
        console.error(`[DeepgramProvider] ❌ API Error for ${interactionId}:`, {
          error: errorMessage,
          code: errorCode,
          type: error.type,
          interactionId,
        });
        
        // Handle specific error codes
        switch (errorCode) {
          case 1008: // DATA-0000: Invalid audio format
            console.error(`[DeepgramProvider] ❌ Invalid audio format (1008) for ${interactionId}`);
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
        
        // Check if we should reconnect (not a clean close, not too many attempts)
        // NOTE: For 1011 (timeout), we still try to reconnect if we haven't exceeded attempts
        // because the timeout might be due to temporary network issues
        const shouldReconnect = 
          event?.code !== 1008 && // Don't reconnect on format errors
          event?.code !== 4000 && // Don't reconnect on auth errors
          state.reconnectAttempts < state.maxReconnectAttempts &&
          (Date.now() - state.lastReconnectTime) > 5000; // Wait 5s between attempts
        
        if (shouldReconnect) {
          console.info(`[DeepgramProvider] Attempting to reconnect for ${interactionId} (attempt ${state.reconnectAttempts + 1}/${state.maxReconnectAttempts})`);
          state.reconnectAttempts++;
          state.lastReconnectTime = Date.now();
          
          // Schedule reconnection (don't block)
          // Note: Connection already deleted from map above
          setTimeout(async () => {
            try {
              // Recreate connection with same parameters
              await this.getOrCreateConnection(interactionId, state.sampleRate || 8000);
              console.info(`[DeepgramProvider] ✅ Reconnected for ${interactionId}`);
            } catch (error: any) {
              console.error(`[DeepgramProvider] ❌ Reconnection failed for ${interactionId}:`, error);
            }
          }, 1000);
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
        
        // CRITICAL: Verify connection state before sending
        const connectionAny = state.connection as any;
        const connectionReadyState = connectionAny?.getReadyState?.() ?? connectionAny?.readyState ?? 'unknown';
        const socketReadyState = state.socket?.readyState ?? 'unknown';
        
        console.info(`[DeepgramProvider] 📤 Sending audio chunk:`, {
          interactionId,
          seq,
          size: audio.length,
          sampleRate,
          samples,
          durationMs: durationMs.toFixed(0) + 'ms',
          isReady: state.isReady,
          connectionReadyState,
          socketReadyState,
          hasConnection: !!state.connection,
          hasSocket: !!state.socket,
          connectionType: typeof state.connection,
          connectionHasSend: typeof state.connection?.send === 'function',
        });
        
        // Verify connection is ready
        if (!state.isReady) {
          throw new Error(`Connection not ready for ${interactionId} (isReady: ${state.isReady})`);
        }
        
        if (!state.connection) {
          throw new Error(`Connection object is null for ${interactionId}`);
        }
        
        if (typeof state.connection.send !== 'function') {
          throw new Error(`Connection.send is not a function for ${interactionId}. Connection type: ${typeof state.connection}, keys: ${Object.keys(state.connection).join(', ')}`);
        }
        
        // Deepgram SDK expects Uint8Array or Buffer for binary audio
        // Convert Buffer to Uint8Array to ensure compatibility
        const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
        
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
          firstBytes: Array.from(audioData.slice(0, Math.min(8, audioData.length)))).map(b => `0x${b.toString(16).padStart(2, '0')}`)),
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
        try {
          state.connection.send(audioData);
          const sendDuration = Date.now() - sendStartTime;
          
          // Log successful send with detailed metrics
          console.info(`[DeepgramProvider] ✅ Audio sent successfully for ${interactionId}, seq=${seq}`, {
            chunkSizeMs: chunkSizeMs.toFixed(0),
            averageChunkSizeMs: this.metrics.averageChunkSizeMs.toFixed(0),
            sendDurationMs: sendDuration,
            dataLength: audioData.length,
            connectionReadyState,
            socketReadyState,
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
            connectionType: typeof state.connection,
            connectionKeys: Object.keys(state.connection || {}).slice(0, 10),
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


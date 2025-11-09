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
      
      // Try direct socket access patterns
      if (connection._socket && isWebSocket(connection._socket)) {
        socket = connection._socket;
      } else if (connection.socket && isWebSocket(connection.socket)) {
        socket = connection.socket;
      } 
      // Try through 'conn' property (seen in connection object keys)
      else if (connection.conn?._socket && isWebSocket(connection.conn._socket)) {
        socket = connection.conn._socket;
      } else if (connection.conn?.socket && isWebSocket(connection.conn.socket)) {
        socket = connection.conn.socket;
      } else if (connection.conn && isWebSocket(connection.conn)) {
        // conn might be the WebSocket itself
        socket = connection.conn;
      }
      // Try through 'transport' property (seen in connection object keys)
      else if (connection.transport?._socket && isWebSocket(connection.transport._socket)) {
        socket = connection.transport._socket;
      } else if (connection.transport?.socket && isWebSocket(connection.transport.socket)) {
        socket = connection.transport.socket;
      } else if (connection.transport && isWebSocket(connection.transport)) {
        // transport might be the WebSocket itself
        socket = connection.transport;
      }
      // Try nested patterns
      else if (connection._connection?._socket && isWebSocket(connection._connection._socket)) {
        socket = connection._connection._socket;
      } else if (connection._connection?.socket && isWebSocket(connection._connection.socket)) {
        socket = connection._connection.socket;
      } else if (typeof connection.getSocket === 'function') {
        const candidate = connection.getSocket();
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
        console.warn(`[DeepgramProvider] Connection object keys:`, Object.keys(connection));
        // Log connection structure for debugging
        console.warn(`[DeepgramProvider] Connection structure:`, {
          has_socket: !!connection.socket,
          has_socket_underscore: !!connection._socket,
          has_connection: !!connection._connection,
          has_conn: !!connection.conn,
          has_transport: !!connection.transport,
          conn_type: connection.conn ? typeof connection.conn : 'undefined',
          transport_type: connection.transport ? typeof connection.transport : 'undefined',
          conn_keys: connection.conn ? Object.keys(connection.conn) : [],
          transport_keys: connection.transport ? Object.keys(connection.transport) : [],
          connection_keys: connection._connection ? Object.keys(connection._connection) : [],
        });
      } else {
        console.info(`[DeepgramProvider] ✅ Accessed underlying WebSocket for ${interactionId}`);
        console.debug(`[DeepgramProvider] WebSocket type:`, typeof socket, 'has send:', typeof socket.send);
      }

      state = {
        connection,
        socket,
        isReady: false,
        transcriptQueue: [],
        pendingResolvers: [],
        lastTranscript: null,
      };

      // Set up event handlers
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.info(`[DeepgramProvider] ✅ Connection opened for ${interactionId}`);
        state.isReady = true;
        
        // Try to access socket again if not found initially (socket might only be available after Open)
        if (!state.socket) {
          console.debug(`[DeepgramProvider] Socket not found initially, trying again after Open event for ${interactionId}`);
          
          // Try all patterns again, including conn and transport
          if (connection._socket) {
            state.socket = connection._socket;
          } else if (connection.socket) {
            state.socket = connection.socket;
          } else if (connection.conn?._socket) {
            state.socket = connection.conn._socket;
          } else if (connection.conn?.socket) {
            state.socket = connection.conn.socket;
          } else if (connection.conn && typeof connection.conn.send === 'function' && connection.conn.readyState !== undefined) {
            state.socket = connection.conn;
          } else if (connection.transport?._socket) {
            state.socket = connection.transport._socket;
          } else if (connection.transport?.socket) {
            state.socket = connection.transport.socket;
          } else if (connection.transport && typeof connection.transport.send === 'function' && connection.transport.readyState !== undefined) {
            state.socket = connection.transport;
          } else if (connection._connection?._socket) {
            state.socket = connection._connection._socket;
          } else if (connection._connection?.socket) {
            state.socket = connection._connection.socket;
          } else if (typeof connection.getSocket === 'function') {
            state.socket = connection.getSocket();
          }
          
          if (state.socket) {
            console.info(`[DeepgramProvider] ✅ Accessed underlying WebSocket after Open event for ${interactionId}`);
            console.debug(`[DeepgramProvider] Socket path:`, {
              has_conn: !!connection.conn,
              has_transport: !!connection.transport,
              conn_keys: connection.conn ? Object.keys(connection.conn) : [],
              transport_keys: connection.transport ? Object.keys(connection.transport) : [],
            });
          } else {
            // Log detailed structure for debugging
            console.warn(`[DeepgramProvider] ⚠️ Socket still not found after Open event for ${interactionId}`);
            console.warn(`[DeepgramProvider] Connection structure after Open:`, {
              has_conn: !!connection.conn,
              has_transport: !!connection.transport,
              conn_type: connection.conn ? typeof connection.conn : 'undefined',
              transport_type: connection.transport ? typeof connection.transport : 'undefined',
              conn_keys: connection.conn ? Object.keys(connection.conn) : [],
              transport_keys: connection.transport ? Object.keys(connection.transport) : [],
            });
          }
        }
        
        // Send KeepAlive message after connection opens
        // Deepgram REQUIRES KeepAlive as JSON text frame: {"type": "KeepAlive"}
        // Must be sent as TEXT WebSocket frame via underlying socket, not binary via connection.send()
        // connection.send() only accepts binary audio data (Uint8Array)
        // CRITICAL: Socket readyState may be stuck at 0 even after connection opens
        // Try to send KeepAlive anyway - if socket is actually open, it will work
        // If it fails, we'll catch the error and retry
        const sendInitialKeepAlive = () => {
          try {
            if (state.socket && typeof state.socket.send === 'function') {
              const readyState = state.socket.readyState;
              // Try to send even if readyState is 0 - the socket might actually be open
              // Some WebSocket wrappers don't update readyState correctly
              try {
                const keepAliveMsg = JSON.stringify({ type: 'KeepAlive' });
                state.socket.send(keepAliveMsg); // Send as text frame via underlying WebSocket
                console.info(`[DeepgramProvider] 📡 Sent initial KeepAlive (JSON text frame) for ${interactionId}`, {
                  readyState,
                  note: readyState === 0 ? 'readyState was 0 but send succeeded - socket wrapper issue' : 'readyState was OPEN',
                });
                return true;
              } catch (sendError: any) {
                // If send fails, log but don't error - will retry in periodic interval
                if (sendError.message?.includes('not open') || sendError.message?.includes('CLOSED')) {
                  console.debug(`[DeepgramProvider] Socket not ready (readyState=${readyState}), send failed:`, sendError.message);
                  return false;
                } else {
                  // Other error - log and return false
                  console.warn(`[DeepgramProvider] Error sending KeepAlive (readyState=${readyState}):`, sendError.message);
                  return false;
                }
              }
            } else {
              console.warn(`[DeepgramProvider] ⚠️ Cannot send KeepAlive: underlying WebSocket not accessible for ${interactionId}`);
              // Fallback: Try connection.send() as last resort (may not work)
              try {
                connection.send(JSON.stringify({ type: 'KeepAlive' }));
                console.warn(`[DeepgramProvider] ⚠️ Fallback: Sent KeepAlive via connection.send() (may not work)`);
                return true;
              } catch (fallbackError: any) {
                console.error(`[DeepgramProvider] ❌ Failed to send KeepAlive via fallback:`, fallbackError);
                return false;
              }
            }
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
        // CRITICAL: Don't rely on readyState - try to send and catch errors
        // Some WebSocket wrappers don't update readyState correctly
        state.keepAliveInterval = setInterval(() => {
          try {
            if (state.socket && state.isReady && typeof state.socket.send === 'function') {
              const readyState = state.socket.readyState;
              // Try to send KeepAlive regardless of readyState
              // If socket is actually open, send will succeed even if readyState is 0
              try {
                const keepAliveMsg = JSON.stringify({ type: 'KeepAlive' });
                state.socket.send(keepAliveMsg); // Send as text frame via underlying WebSocket
                console.info(`[DeepgramProvider] 📡 Sent periodic KeepAlive (JSON text frame) for ${interactionId}`, {
                  readyState,
                  note: readyState === 0 ? 'readyState was 0 but send succeeded' : 'readyState was OPEN',
                });
              } catch (sendError: any) {
                // If send fails, check the error
                if (sendError.message?.includes('not open') || sendError.message?.includes('CLOSED')) {
                  if (readyState === 3) {
                    // CLOSED - clear interval
                    console.warn(`[DeepgramProvider] Socket closed (readyState=3), clearing KeepAlive interval for ${interactionId}`);
                    if (state.keepAliveInterval) {
                      clearInterval(state.keepAliveInterval);
                      state.keepAliveInterval = undefined;
                    }
                  } else {
                    console.debug(`[DeepgramProvider] Socket not ready (readyState=${readyState}), KeepAlive send failed:`, sendError.message);
                  }
                } else {
                  console.warn(`[DeepgramProvider] ⚠️ Error sending periodic KeepAlive (readyState=${readyState}):`, sendError.message);
                }
              }
            } else {
              console.warn(`[DeepgramProvider] ⚠️ Cannot send periodic KeepAlive: WebSocket not accessible for ${interactionId}`, {
                hasSocket: !!state.socket,
                isReady: state.isReady,
                hasSend: state.socket ? typeof state.socket.send : 'no socket',
              });
            }
          } catch (error: any) {
            console.error(`[DeepgramProvider] ❌ Failed to send periodic KeepAlive for ${interactionId}:`, error);
            // If error is due to closed socket, clear interval
            if (error.message?.includes('closed') || error.message?.includes('CLOSED') || error.message?.includes('not open')) {
              if (state.keepAliveInterval) {
                clearInterval(state.keepAliveInterval);
                state.keepAliveInterval = undefined;
                console.debug(`[DeepgramProvider] Cleared KeepAlive interval (error: socket closed) for ${interactionId}`);
              }
            }
          }
        }, 3000); // Every 3 seconds
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

      connection.on(LiveTranscriptionEvents.Close, (event: any) => {
        console.warn(`[DeepgramProvider] 🔒 Connection closed for ${interactionId}`, {
          reason: event?.reason || 'unknown',
          code: event?.code,
          wasClean: event?.wasClean,
          fullEvent: event ? JSON.stringify(event).substring(0, 200) : 'no event data',
        });
        
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
        }
        
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
        
        // Deepgram SDK expects Uint8Array, not Buffer
        // Convert Buffer to Uint8Array to ensure compatibility
        const audioData = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
        
        // Send audio chunk to Deepgram
        state.connection.send(audioData);
        
        // Log successful send
        console.debug(`[DeepgramProvider] ✅ Audio sent successfully for ${interactionId}, seq=${seq}`);
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
      
      // Close the connection
      if (state.connection && typeof state.connection.finish === 'function') {
        state.connection.finish();
      }
      
      // Remove from connections map
      this.connections.delete(interactionId);
      console.info(`[DeepgramProvider] ✅ Connection closed for ${interactionId}`);
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


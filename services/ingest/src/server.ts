/**
 * WebSocket ingestion server for PCM16 audio frames
 * 
 * Endpoint: wss://<host>:<PORT>/v1/ingest
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { authenticateConnection } from './auth';
import { createPubSubAdapter } from './pubsub-adapter.dev';
import {
  StartEvent,
  AckEvent,
  AudioFrame,
  ConnectionState,
  PubSubAdapter,
} from './types';
import { ExotelHandler } from './exotel-handler';
import { validateConfig, printValidationResults } from './config-validator';
import { dumpAudioChunk } from './audio-dumper';
import { uploadToGoogleDrive } from './google-drive-uploader';

// Load environment variables from project root .env.local
// This is safe - dotenv handles missing files gracefully
try {
  require('dotenv').config({ path: require('path').join(__dirname, '../../../.env.local') });
} catch (err) {
  // Ignore - environment variables may be set via Render dashboard
}

/**
 * Environment variable validation and configuration
 */
interface ServerConfig {
  port: number;
  bufferDurationMs: number;
  ackInterval: number;
  sslKeyPath?: string;
  sslCertPath?: string;
  supportExotel: boolean;
  pubsubAdapter: string;
  redisUrl?: string;
  exoBridgeEnabled: boolean;
  exoMaxBufferMs: number;
  exoIdleCloseS: number;
}

function validateAndLoadConfig(): ServerConfig {
  // Exotel Bridge feature flag
  const exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
  const exoMaxBufferMs = parseInt(process.env.EXO_MAX_BUFFER_MS || '500', 10);
  const exoIdleCloseS = parseInt(process.env.EXO_IDLE_CLOSE_S || '10', 10);

  // PORT: Use process.env.PORT for cloud deployment (Render, etc.), default to 5000
  const port = parseInt(process.env.PORT || '5000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}. Must be between 1 and 65535.`);
  }

  const bufferDurationMs = parseInt(process.env.BUFFER_DURATION_MS || '3000', 10);
  if (isNaN(bufferDurationMs) || bufferDurationMs < 100 || bufferDurationMs > 30000) {
    throw new Error(`Invalid BUFFER_DURATION_MS: ${process.env.BUFFER_DURATION_MS}. Must be between 100 and 30000.`);
  }

  const ackInterval = parseInt(process.env.ACK_INTERVAL || '10', 10);
  if (isNaN(ackInterval) || ackInterval < 1 || ackInterval > 1000) {
    throw new Error(`Invalid ACK_INTERVAL: ${process.env.ACK_INTERVAL}. Must be between 1 and 1000.`);
  }

  const pubsubAdapter = process.env.PUBSUB_ADAPTER || 'redis_streams';
  if (!['redis_streams', 'kafka', 'in_memory'].includes(pubsubAdapter)) {
    throw new Error(`Invalid PUBSUB_ADAPTER: ${pubsubAdapter}. Must be one of: redis_streams, kafka, in_memory`);
  }

  // Validate Redis URL if using redis_streams
  if (pubsubAdapter === 'redis_streams') {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is required when PUBSUB_ADAPTER=redis_streams');
    }
    if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
      throw new Error(`Invalid REDIS_URL format: ${redisUrl}. Must start with redis:// or rediss://`);
    }
  }

  return {
    port,
    bufferDurationMs,
    ackInterval,
    sslKeyPath: process.env.SSL_KEY_PATH,
    sslCertPath: process.env.SSL_CERT_PATH,
    supportExotel: process.env.SUPPORT_EXOTEL === 'true',
    pubsubAdapter,
    redisUrl: process.env.REDIS_URL,
    exoBridgeEnabled,
    exoMaxBufferMs,
    exoIdleCloseS,
  };
}

// Validate configuration at startup
const validationResult = validateConfig();
printValidationResults(validationResult);

if (!validationResult.valid) {
  console.error('[server] ❌ Configuration validation failed. Please fix the errors above.');
  process.exit(1);
}

// Load and validate configuration
const config = validateAndLoadConfig();
const PORT = config.port;
const BUFFER_DURATION_MS = config.bufferDurationMs;
const ACK_INTERVAL = config.ackInterval;
const SSL_KEY_PATH = config.sslKeyPath;
const SSL_CERT_PATH = config.sslCertPath;
const EXO_BRIDGE_ENABLED = config.exoBridgeEnabled;
const EXO_MAX_BUFFER_MS = config.exoMaxBufferMs;
const EXO_IDLE_CLOSE_S = config.exoIdleCloseS;

interface Connection extends WebSocket {
  state?: ConnectionState;
}

class IngestionServer {
  private wss: WebSocketServer;
  private pubsub: PubSubAdapter;
  private exotelHandler: ExotelHandler;
  private supportExotel: boolean;
  private server: any;
  private isShuttingDown: boolean = false;
  private healthStatus: { status: 'healthy' | 'degraded' | 'unhealthy'; pubsub: boolean; timestamp: number } = {
    status: 'healthy',
    pubsub: true,
    timestamp: Date.now(),
  };

  constructor() {
    // Initialize pub/sub adapter with error handling
    try {
      this.pubsub = createPubSubAdapter();
      console.info('[server] Pub/Sub adapter initialized:', config.pubsubAdapter);
    } catch (error: any) {
      console.error('[server] Failed to initialize pub/sub adapter:', error.message);
      throw new Error(`Pub/Sub initialization failed: ${error.message}. Check REDIS_URL and PUBSUB_ADAPTER.`);
    }

    this.exotelHandler = new ExotelHandler(this.pubsub);
    this.supportExotel = config.supportExotel;

    // Log audio dump and Google Drive status on startup
    this.logAudioDumpStatus();
    this.logGoogleDriveStatus();

    // Create HTTP/HTTPS server
    if (SSL_KEY_PATH && SSL_CERT_PATH) {
      try {
        const key = readFileSync(SSL_KEY_PATH);
        const cert = readFileSync(SSL_CERT_PATH);
        this.server = createServer({ key, cert });
        console.info('[server] Using HTTPS/WSS');
      } catch (error: any) {
        console.error('[server] Failed to load SSL certificates:', error.message);
        throw new Error(`SSL configuration error: ${error.message}`);
      }
    } else {
      const http = require('http');
      this.server = http.createServer();
      if (process.env.NODE_ENV === 'production') {
        console.warn('[server] Using HTTP/WS (no SSL) - Render handles HTTPS termination');
      } else {
        console.warn('[server] Using HTTP/WS (no SSL) - not recommended for production');
      }
    }

    // ============================================
    // HTTP Routes
    // ============================================
    // Log ALL HTTP requests for debugging
    this.server.on('request', (req: any, res: any) => {
      // Log all incoming requests (but only once per request to avoid spam)
      if (!req._logged) {
        // Check if this is a WebSocket upgrade attempt
        const isWebSocketUpgrade = req.headers.upgrade === 'websocket' || 
                                   req.headers.connection?.toLowerCase().includes('upgrade');
        
        if (isWebSocketUpgrade) {
          console.info('[server] 🔌 WebSocket upgrade attempt detected in HTTP request', {
            method: req.method,
            url: req.url,
            headers: {
              'user-agent': req.headers['user-agent']?.substring(0, 50) || 'unknown',
              'upgrade': req.headers.upgrade || 'none',
              'connection': req.headers.connection || 'none',
              'authorization': req.headers.authorization ? 'present' : 'missing',
              'origin': req.headers.origin || 'none',
              'sec-websocket-key': req.headers['sec-websocket-key'] ? 'present' : 'missing',
              'sec-websocket-version': req.headers['sec-websocket-version'] || 'none',
            },
            remoteAddress: req.socket?.remoteAddress || 'unknown',
            remotePort: req.socket?.remotePort || 'unknown',
          });
        } else if (req.url !== '/health') {
          // Only log non-health-check requests to reduce noise
          console.info('[server] HTTP request received', {
            method: req.method,
            url: req.url,
            headers: {
              'user-agent': req.headers['user-agent']?.substring(0, 50) || 'unknown',
              'upgrade': req.headers.upgrade || 'none',
              'connection': req.headers.connection || 'none',
              'authorization': req.headers.authorization ? 'present' : 'missing',
              'origin': req.headers.origin || 'none',
            },
            remoteAddress: req.socket?.remoteAddress || 'unknown',
          });
        }
        req._logged = true;
      }
    });
    
    // Health check endpoint (required for cloud deployment)
    this.server.on('request', (req: any, res: any) => {
      // Don't handle WebSocket upgrade requests - let WebSocket server handle them
      if (req.url === '/v1/ingest' && 
          (req.headers.upgrade === 'websocket' || 
           req.headers.connection?.toLowerCase().includes('upgrade'))) {
        // This is a WebSocket upgrade for /v1/ingest - don't respond, let WebSocket server handle it
        return;
      }
      
      if (req.url === '/health') {
        // Update health status
        this.updateHealthStatus();
        
        const statusCode = this.healthStatus.status === 'healthy' ? 200 : 
                          this.healthStatus.status === 'degraded' ? 200 : 503;
        
        res.writeHead(statusCode, { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        });
        const healthResponse: any = {
          status: this.healthStatus.status,
          service: 'ingest',
          pubsub: this.healthStatus.pubsub,
          timestamp: new Date(this.healthStatus.timestamp).toISOString(),
          exotelBridge: EXO_BRIDGE_ENABLED ? 'enabled' : 'disabled',
        };

        // Add Exotel metrics if bridge is enabled
        if (EXO_BRIDGE_ENABLED) {
          const exotelMetrics = this.exotelHandler.getMetrics();
          healthResponse.exotelMetrics = {
            framesIn: exotelMetrics.framesIn,
            bytesIn: exotelMetrics.bytesIn,
            bufferDrops: exotelMetrics.bufferDrops,
            publishFailures: exotelMetrics.publishFailures,
            bufferDepth: exotelMetrics.bufferDepth,
            activeBuffers: exotelMetrics.activeBuffers,
          };
        }
        
        res.end(JSON.stringify(healthResponse));
        return;
      }

      // Audio dump endpoints (removed - not needed for now)
      // Files are uploaded to Google Drive instead
      
      // Only send 404 if it's not a WebSocket upgrade
      if (req.headers.upgrade !== 'websocket') {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // ============================================
    // WebSocket Server Setup
    // ============================================
    // WebSocket endpoint: /v1/ingest (required for cloud deployment)
    this.wss = new WebSocketServer({
      server: this.server,
      path: '/v1/ingest',
      verifyClient: (info, callback) => {
        try {
          // Log ALL WebSocket upgrade attempts for debugging
          console.info('[server] 🔌 WebSocket upgrade request received', {
            url: info.req.url,
            method: info.req.method,
            headers: {
              authorization: info.req.headers.authorization ? 'present' : 'missing',
              'user-agent': info.req.headers['user-agent']?.substring(0, 50) || 'unknown',
              origin: info.req.headers.origin || 'none',
              upgrade: info.req.headers.upgrade || 'none',
              connection: info.req.headers.connection || 'none',
              'sec-websocket-key': info.req.headers['sec-websocket-key'] ? 'present' : 'missing',
              'sec-websocket-version': info.req.headers['sec-websocket-version'] || 'none',
            },
            remoteAddress: info.req.socket?.remoteAddress || 'unknown',
            remotePort: info.req.socket?.remotePort || 'unknown',
          });
          
          // Check if this is Exotel (no JWT or Basic Auth) or our protocol (JWT)
          const authHeader = info.req.headers.authorization;
          const isExotel = this.detectExotelProtocol(info.req);
          
          if (isExotel && this.supportExotel) {
            // Exotel connection - accept without JWT validation
            console.info('[server] ✅ Exotel WebSocket upgrade request accepted (IP whitelist/Basic Auth)');
            (info.req as any).isExotel = true;
            callback(true);
          } else if (!authHeader && this.supportExotel) {
            // No auth header but Exotel support enabled - might be Exotel with IP whitelisting
            console.info('[server] ⚠️  WebSocket upgrade with no auth - accepting as Exotel (SUPPORT_EXOTEL=true)');
            (info.req as any).isExotel = true;
            callback(true);
          } else {
            // Our protocol - require JWT authentication
            try {
              console.info('[server] WebSocket upgrade request (JWT protocol)', {
                hasAuthHeader: !!authHeader,
                authHeaderPrefix: authHeader?.substring(0, 20) || 'none',
              });
              const payload = authenticateConnection(info.req.headers as any);
              // Store payload in request for later use
              (info.req as any).jwtPayload = payload;
              (info.req as any).isExotel = false;
              console.info('[server] ✅ Authentication successful', {
                tenant_id: payload.tenant_id,
                interaction_id: payload.interaction_id,
              });
              callback(true);
            } catch (error: any) {
              console.warn('[server] ❌ Authentication failed:', error.message);
              console.warn('[server] Error details:', error);
              callback(false, 401, 'Unauthorized');
            }
          }
        } catch (error: any) {
          console.error('[server] ❌ Error in verifyClient:', error);
          console.error('[server] Error stack:', error.stack);
          callback(false, 500, 'Internal Server Error');
        }
      },
    });

    this.wss.on('connection', (ws: Connection, req) => {
      try {
        // Check if this is Exotel connection
        const isExotel = (req as any).isExotel !== false && this.supportExotel;
        
        if (isExotel) {
          this.handleExotelConnection(ws, req);
        } else {
          this.handleConnection(ws, req);
        }
      } catch (error: any) {
        console.error('[server] ❌ Error handling WebSocket connection:', error);
        console.error('[server] Error stack:', error.stack);
        ws.close(1011, 'Internal Server Error');
      }
    });

    // Handle WebSocket server errors
    this.wss.on('error', (error: Error) => {
      console.error('[server] ❌ WebSocket server error:', error);
      console.error('[server] Error stack:', error.stack);
    });

    // Handle server errors
    this.server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[server] Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('[server] Server error:', error);
      }
    });

    this.server.listen(PORT, () => {
      console.info(`[server] ✅ Ingestion server listening on port ${PORT}`);
      console.info(`[server] WebSocket endpoint: ws${SSL_KEY_PATH ? 's' : ''}://localhost:${PORT}/v1/ingest`);
      console.info(`[server] Health check: http://localhost:${PORT}/health`);
      // Log condensed config summary (mask secrets)
      const configSummary: any = {
        port: PORT,
        bufferDurationMs: BUFFER_DURATION_MS,
        ackInterval: ACK_INTERVAL,
        pubsubAdapter: config.pubsubAdapter,
        supportExotel: this.supportExotel,
        ssl: !!(SSL_KEY_PATH && SSL_CERT_PATH),
        exoBridgeEnabled: EXO_BRIDGE_ENABLED,
      };

      if (EXO_BRIDGE_ENABLED) {
        configSummary.exoMaxBufferMs = EXO_MAX_BUFFER_MS;
        configSummary.exoIdleCloseS = EXO_IDLE_CLOSE_S;
        console.info(`[server] Exotel→Deepgram bridge: ENABLED`, {
          maxBufferMs: EXO_MAX_BUFFER_MS,
          idleCloseS: EXO_IDLE_CLOSE_S,
        });
      } else {
        console.info(`[server] Exotel→Deepgram bridge: DISABLED (set EXO_BRIDGE_ENABLED=true to enable)`);
      }

      console.info(`[server] Configuration:`, configSummary);
    });
  }

  private updateHealthStatus(): void {
    // Check pub/sub health (basic check - adapter exists)
    const pubsubHealthy = this.pubsub !== null;
    
    this.healthStatus = {
      status: pubsubHealthy ? 'healthy' : 'unhealthy',
      pubsub: pubsubHealthy,
      timestamp: Date.now(),
    };
  }

  private detectExotelProtocol(req: any): boolean {
    // Exotel uses IP whitelisting or Basic Auth, not JWT
    // Check if Authorization header is Basic Auth or missing (IP whitelist)
    const authHeader = req.headers?.authorization;
    
    if (!authHeader) {
      // No auth = might be IP whitelisted Exotel
      return this.supportExotel;
    }
    
    // Basic Auth = Exotel
    if (authHeader.startsWith('Basic ')) {
      return true;
    }
    
    // JWT Bearer = our protocol
    if (authHeader.startsWith('Bearer ')) {
      return false;
    }
    
    // Default: assume our protocol
    return false;
  }

  private handleExotelConnection(ws: Connection, req: any): void {
    console.info('[exotel] New Exotel WebSocket connection');
    
    // Exotel doesn't require JWT, uses IP whitelisting or Basic Auth
    // We'll accept the connection and handle messages
    
    // Initialize default state for binary-only connections
    let exotelState: any = {
      streamSid: `exotel-${Date.now()}`,
      callSid: `call-${Date.now()}`,
      accountSid: 'exotel',
      sampleRate: 8000, // Default, will be updated from start event if received
      encoding: 'pcm16',
      seq: 0,
      started: false,
    };
    (ws as any).exotelState = exotelState;
    
    ws.on('message', (data: Buffer | string) => {
      if (typeof data === 'string') {
        // Exotel sends JSON messages (start, media, stop events)
        try {
          const json = JSON.parse(data);
          // If this is a start event, update state
          if (json.event === 'start' && json.start) {
            exotelState.streamSid = json.stream_sid || json.start.stream_sid || exotelState.streamSid;
            exotelState.callSid = json.start.call_sid || exotelState.callSid;
            exotelState.accountSid = json.start.account_sid || exotelState.accountSid;
            // Exotel can send 8kHz, 16kHz, or 24kHz - accept valid rates, prefer 16kHz for transcription
            let parsedSampleRate = parseInt(json.start.media_format?.sample_rate || '8000', 10);
            const ALLOWED_EXOTEL_RATES = [8000, 16000, 24000];
            
            if (!ALLOWED_EXOTEL_RATES.includes(parsedSampleRate)) {
              // Invalid sample rate - default to 8000
              console.warn(`[exotel] ⚠️ Invalid sample rate ${parsedSampleRate} from Exotel, defaulting to 8000 Hz`, {
                stream_sid: exotelState.streamSid,
                call_sid: exotelState.callSid,
                received_sample_rate: json.start.media_format?.sample_rate,
                corrected_sample_rate: 8000,
              });
              parsedSampleRate = 8000;
            } else if (parsedSampleRate === 24000) {
              // Convert 24kHz to 16kHz (ElevenLabs max)
              parsedSampleRate = 16000;
              console.info(`[exotel] ℹ️ Converting 24kHz to 16kHz for ElevenLabs`, {
                stream_sid: exotelState.streamSid,
                call_sid: exotelState.callSid,
              });
            }
            exotelState.sampleRate = parsedSampleRate;
            exotelState.encoding = json.start.media_format?.encoding || 'pcm16';
            exotelState.started = true;
            console.info('[exotel] Start event received via JSON', {
              stream_sid: exotelState.streamSid,
              call_sid: exotelState.callSid,
              sample_rate: exotelState.sampleRate,
            });
          }
        } catch (e) {
          // Not JSON, might be text but not valid JSON
        }
        this.exotelHandler.handleMessage(ws as any, data);
      } else {
        // Binary message - Exotel might be sending raw PCM16 audio OR base64-encoded JSON
        // Handle binary frames directly if state is initialized
        if (exotelState.started || exotelState.seq === 0) {
          // If not started yet, assume defaults and start processing
          if (!exotelState.started) {
            exotelState.started = true;
            console.info('[exotel] Processing binary frames with default config', {
              sample_rate: exotelState.sampleRate,
              stream_sid: exotelState.streamSid,
            });
          }
          
          exotelState.seq += 1;
          
          // Validate binary data - check if it's actually JSON text (base64-encoded JSON)
          // This can happen if Exotel sends JSON as binary frames
          const firstBytes = Array.from(data.slice(0, Math.min(8, data.length)));
          if (firstBytes[0] === 0x7b || firstBytes[0] === 0x5b) { // '{' or '['
            // This looks like JSON text, not binary audio!
            try {
              const jsonText = data.toString('utf8');
              const parsedJson = JSON.parse(jsonText);
              // This is NORMAL behavior - Exotel sends JSON messages as binary frames
              // We handle it correctly by parsing and routing to exotelHandler
              // Only log as debug to reduce noise (was CRITICAL error)
              console.debug('[exotel] Binary frame contains JSON (normal Exotel behavior)', {
                stream_sid: exotelState.streamSid,
                call_sid: exotelState.callSid,
                seq: exotelState.seq,
                event: parsedJson.event,
                note: 'Exotel sends JSON as binary frames - handled correctly',
              });
              
              // Handle it as a JSON message (Exotel is sending JSON as binary frames)
              // This works but is not ideal - Exotel should send JSON as text frames
              // Handle all event types: start, media, stop, dtmf, mark
              console.info('[exotel] Handling binary JSON frame as text message', {
                event: parsedJson.event,
                stream_sid: exotelState.streamSid,
                call_sid: exotelState.callSid,
              });
              this.exotelHandler.handleMessage(ws as any, jsonText);
              return; // Don't publish as audio
            } catch (parseError) {
              // Not valid JSON, but starts with { or [
              // Invalid JSON in binary frame - log as warning, not CRITICAL
              console.warn('[exotel] Binary frame contains JSON-like text (invalid JSON)', {
                stream_sid: exotelState.streamSid,
                call_sid: exotelState.callSid,
                seq: exotelState.seq,
                buffer_length: data.length,
                note: 'Skipping invalid JSON frame',
              });
              return; // Don't publish as audio
            }
          }
          
          // Log first few binary frames for debugging
          if (exotelState.seq <= 3) {
            const firstBytesHex = firstBytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ');
            console.info('[exotel] 🔍 Raw binary frame received:', {
              stream_sid: exotelState.streamSid,
              call_sid: exotelState.callSid,
              seq: exotelState.seq,
              buffer_length: data.length,
              first_bytes_hex: firstBytesHex,
              first_bytes_decimal: firstBytes.join(', '),
            });
          }
          
          // Create audio frame from binary data
          const frame: AudioFrame = {
            tenant_id: exotelState.accountSid,
            interaction_id: exotelState.callSid || exotelState.streamSid,
            seq: exotelState.seq,
            timestamp_ms: Date.now(),
            sample_rate: exotelState.sampleRate,
            encoding: 'pcm16' as const,
            audio: data,
          };

          // Dump audio chunk to file if enabled
          dumpAudioChunk(
            frame.interaction_id,
            frame.seq,
            data,
            exotelState.sampleRate,
            'pcm16'
          ).catch((err) => {
            // Non-critical - don't block processing
            console.debug('[exotel] Audio dump failed (non-critical)', { error: err.message });
          });
          
          // Publish to pub/sub
          this.pubsub.publish(frame).then(() => {
            // Log every 100th frame to reduce noise
            if (exotelState.seq % 100 === 0) {
              console.info('[exotel] Published binary audio frame', {
                stream_sid: exotelState.streamSid,
                call_sid: exotelState.callSid,
                seq: exotelState.seq,
                size: data.length,
              });
            }
          }).catch((error: any) => {
            console.error('[exotel] Failed to publish binary frame:', error);
          });
        } else {
          console.warn('[exotel] Received binary message before start event');
        }
      }
    });

    ws.on('error', (error: Error) => {
      console.error('[exotel] WebSocket error:', error);
    });

    ws.on('close', () => {
      const state = (ws as any).exotelState;
      if (state) {
        console.info('[exotel] Connection closed', {
          stream_sid: state.streamSid,
          call_sid: state.callSid,
        });
      }
    });
  }

  private handleConnection(ws: Connection, req: any): void {
    const jwtPayload = req.jwtPayload;
    console.info('[server] New connection', {
      interaction_id: jwtPayload?.interaction_id,
      tenant_id: jwtPayload?.tenant_id,
    });

    ws.on('message', async (data: Buffer, isBinary: boolean) => {
      try {
        if (isBinary) {
          await this.handleBinaryFrame(ws, data);
        } else {
          await this.handleTextMessage(ws, data.toString());
        }
      } catch (error: any) {
        console.error('[server] Error handling message:', error);
        ws.close(1011, error.message);
      }
    });

    ws.on('error', (error) => {
      console.error('[server] WebSocket error:', error);
    });

    ws.on('close', () => {
      console.info('[server] Connection closed', {
        interaction_id: ws.state?.interactionId,
        tenant_id: ws.state?.tenantId,
      });
      // Clean up state
      delete ws.state;
    });
  }

  private async handleTextMessage(ws: Connection, message: string): Promise<void> {
    try {
      const event = JSON.parse(message) as StartEvent | AckEvent;

      if (event.event === 'start') {
        await this.handleStartEvent(ws, event as StartEvent);
      } else {
        console.warn('[server] Unknown text event:', event);
      }
    } catch (error: any) {
      throw new Error(`Failed to parse text message: ${error.message}`);
    }
  }

  private async handleStartEvent(ws: Connection, event: StartEvent): Promise<void> {
    if (ws.state) {
      throw new Error('Start event received but connection already initialized');
    }

    // Validate event
    if (!event.interaction_id || !event.tenant_id || !event.sample_rate) {
      throw new Error('Invalid start event: missing required fields');
    }

    if (event.encoding !== 'pcm16') {
      throw new Error(`Unsupported encoding: ${event.encoding}`);
    }

    // Initialize connection state
    ws.state = {
      interactionId: event.interaction_id,
      tenantId: event.tenant_id,
      sampleRate: event.sample_rate,
      encoding: event.encoding,
      seq: 0,
      frameBuffer: [],
      bufferStartTime: Date.now(),
      lastAckSeq: 0,
    };

    // Log structured JSON
    console.info(JSON.stringify({
      event: 'start',
      interaction_id: event.interaction_id,
      tenant_id: event.tenant_id,
      sample_rate: event.sample_rate,
      encoding: event.encoding,
      timestamp: new Date().toISOString(),
    }));

    // Send acknowledgment
    ws.send(JSON.stringify({ event: 'started', interaction_id: event.interaction_id }));
  }

  private async handleBinaryFrame(ws: Connection, data: Buffer): Promise<void> {
    if (!ws.state) {
      throw new Error('Binary frame received before start event');
    }

    const state = ws.state;
    state.seq += 1;

    const timestampMs = Date.now();
    const frame: AudioFrame = {
      tenant_id: state.tenantId,
      interaction_id: state.interactionId,
      seq: state.seq,
      timestamp_ms: timestampMs,
      sample_rate: state.sampleRate,
      encoding: state.encoding,
      audio: data,
    };

    // Add to circular buffer
    this.addToBuffer(state, data, timestampMs);

    // Publish to pub/sub (async, non-blocking)
    this.pubsub.publish(frame).then(() => {
      // Only log every 100th frame to reduce noise
      if (state.seq % 100 === 0) {
        console.info('[server] Published audio frame', {
          interaction_id: state.interactionId,
          seq: state.seq,
          topic: 'audio_stream',
        });
      }
    }).catch((error: any) => {
      console.error('[server] Failed to publish frame:', {
        interaction_id: state.interactionId,
        seq: state.seq,
        error: error.message,
      });
      // Update health status on repeated failures
      if (this.healthStatus.pubsub) {
        this.healthStatus.pubsub = false;
        this.healthStatus.status = 'degraded';
      }
    });

    // Send ACK every N frames
    if (state.seq % ACK_INTERVAL === 0) {
      const ack: AckEvent = {
        event: 'ack',
        seq: state.seq,
      };
      ws.send(JSON.stringify(ack));
      state.lastAckSeq = state.seq;
    }
  }

  private addToBuffer(state: ConnectionState, frame: Buffer, timestampMs: number): void {
    state.frameBuffer.push(frame);

    // Calculate total buffer duration
    // Estimate: each frame is ~200ms, so buffer size = duration / 200ms
    const maxFrames = Math.ceil((BUFFER_DURATION_MS / 200) * 1.5); // Add 50% margin

    // Remove old frames if buffer exceeds duration
    while (state.frameBuffer.length > maxFrames) {
      state.frameBuffer.shift();
    }

    // Also check by actual time
    const bufferAge = timestampMs - state.bufferStartTime;
    if (bufferAge > BUFFER_DURATION_MS) {
      // Remove frames older than buffer duration
      const framesToKeep = Math.ceil((BUFFER_DURATION_MS / 200) * 0.8);
      if (state.frameBuffer.length > framesToKeep) {
        state.frameBuffer = state.frameBuffer.slice(-framesToKeep);
      }
      state.bufferStartTime = timestampMs - BUFFER_DURATION_MS;
    }
  }

  private logAudioDumpStatus(): void {
    const enabled = process.env.AUDIO_DUMP_ENABLED === 'true';
    const dumpDir = process.env.AUDIO_DUMP_DIR || './audio-dumps';
    const format = process.env.AUDIO_DUMP_FORMAT || 'wav';
    
    if (enabled) {
      console.info('[audio-dumper] Audio dumping enabled', {
        dump_dir: dumpDir,
        format,
      });
    } else {
      console.debug('[audio-dumper] Audio dumping disabled (set AUDIO_DUMP_ENABLED=true to enable)');
    }
  }

  private logGoogleDriveStatus(): void {
    const enabled = process.env.GOOGLE_DRIVE_ENABLED === 'true';
    const hasCredentials = !!(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const parentFolder = process.env.GOOGLE_DRIVE_PARENT_FOLDER_NAME || 'Audio Dumps';
    
    if (enabled) {
      if (hasCredentials) {
        console.info('[google-drive] Google Drive uploads enabled', {
          parent_folder: parentFolder,
          auth_method: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ? 'JSON string' : 'file path',
        });
        
        // Try to initialize (will log success/error)
        try {
          // Trigger initialization by calling getConfig (lazy init)
          // We'll just log that it's enabled, actual init happens on first upload
          console.info('[google-drive] Google Drive client will initialize on first upload');
        } catch (error: any) {
          console.warn('[google-drive] Google Drive initialization will be attempted on first upload', {
            error: error.message,
          });
        }
      } else {
        console.warn('[google-drive] Google Drive uploads enabled but credentials not found', {
          note: 'Set GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS',
        });
      }
    } else {
      console.debug('[google-drive] Google Drive uploads disabled (set GOOGLE_DRIVE_ENABLED=true to enable)');
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    console.info('[server] Starting graceful shutdown...');

    return new Promise((resolve) => {
      // Close WebSocket server
      this.wss.close(() => {
        console.info('[server] WebSocket server closed');
        
        // Close HTTP server
        this.server.close(() => {
          console.info('[server] HTTP server closed');
          
          // Disconnect pub/sub
          if ('disconnect' in this.pubsub) {
            (this.pubsub as any).disconnect().then(() => {
              console.info('[server] Pub/Sub adapter disconnected');
              resolve();
            }).catch((error: any) => {
              console.error('[server] Error disconnecting pub/sub:', error);
              resolve(); // Continue shutdown even if pub/sub fails
            });
          } else if ('close' in this.pubsub) {
            (this.pubsub as any).close().then(() => {
              console.info('[server] Pub/Sub adapter closed');
              resolve();
            }).catch((error: any) => {
              console.error('[server] Error closing pub/sub:', error);
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    });
  }
}

// Start server with error handling
let server: IngestionServer;
try {
  server = new IngestionServer();
} catch (error: any) {
  console.error('[server] ❌ Failed to start server:', error.message);
  console.error('[server] Stack:', error.stack);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.info(`[server] ${signal} received, shutting down gracefully...`);
  try {
    await server.shutdown();
    console.info('[server] ✅ Shutdown complete');
    process.exit(0);
  } catch (error: any) {
    console.error('[server] ❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('[server] ❌ Uncaught exception:', error);
  shutdown('uncaughtException').catch(() => process.exit(1));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[server] ❌ Unhandled rejection:', reason);
  // Don't exit - log and continue (may be recoverable)
});


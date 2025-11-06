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

// Load environment variables from project root .env.local
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env.local') });

// PORT: Use process.env.PORT for cloud deployment (Render, etc.), default to 5000
const PORT = parseInt(process.env.PORT || '5000', 10);
const BUFFER_DURATION_MS = parseInt(process.env.BUFFER_DURATION_MS || '3000', 10);
const ACK_INTERVAL = parseInt(process.env.ACK_INTERVAL || '10', 10);

// SSL/TLS configuration (optional for POC)
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;

interface Connection extends WebSocket {
  state?: ConnectionState;
}

class IngestionServer {
  private wss: WebSocketServer;
  private pubsub: PubSubAdapter;
  private exotelHandler: ExotelHandler;
  private supportExotel: boolean;

  constructor() {
    this.pubsub = createPubSubAdapter();
    this.exotelHandler = new ExotelHandler(this.pubsub);
    this.supportExotel = process.env.SUPPORT_EXOTEL === 'true';

    // Create HTTP/HTTPS server
    let server;
    if (SSL_KEY_PATH && SSL_CERT_PATH) {
      const key = readFileSync(SSL_KEY_PATH);
      const cert = readFileSync(SSL_CERT_PATH);
      server = createServer({ key, cert });
      console.info('[server] Using HTTPS/WSS');
    } else {
      const http = require('http');
      server = http.createServer();
      console.warn('[server] Using HTTP/WS (no SSL) - not recommended for production');
    }

    // ============================================
    // HTTP Routes
    // ============================================
    // Health check endpoint (required for cloud deployment)
    server.on('request', (req: any, res: any) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'ingest' }));
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });

    // ============================================
    // WebSocket Server Setup
    // ============================================
    // WebSocket endpoint: /v1/ingest (required for cloud deployment)
    this.wss = new WebSocketServer({
      server,
      path: '/v1/ingest',
      verifyClient: (info, callback) => {
        // Check if this is Exotel (no JWT or Basic Auth) or our protocol (JWT)
        const authHeader = info.req.headers.authorization;
        const isExotel = this.detectExotelProtocol(info.req);
        
        if (isExotel && this.supportExotel) {
          // Exotel connection - accept without JWT validation
          console.info('[server] Exotel WebSocket upgrade request (IP whitelist/Basic Auth)');
          callback(true);
        } else {
          // Our protocol - require JWT authentication
          try {
            console.info('[server] WebSocket upgrade request', {
              hasAuthHeader: !!authHeader,
              authHeaderPrefix: authHeader?.substring(0, 20) || 'none',
            });
            const payload = authenticateConnection(info.req.headers as any);
            // Store payload in request for later use
            (info.req as any).jwtPayload = payload;
            (info.req as any).isExotel = false;
            console.info('[server] Authentication successful', {
              tenant_id: payload.tenant_id,
              interaction_id: payload.interaction_id,
            });
            callback(true);
          } catch (error: any) {
            console.warn('[server] Authentication failed:', error.message);
            console.warn('[server] Error details:', error);
            callback(false, 401, 'Unauthorized');
          }
        }
      },
    });

    this.wss.on('connection', (ws: Connection, req) => {
      // Check if this is Exotel connection
      const isExotel = (req as any).isExotel !== false && this.supportExotel;
      
      if (isExotel) {
        this.handleExotelConnection(ws, req);
      } else {
        this.handleConnection(ws, req);
      }
    });

    server.listen(PORT, () => {
      console.info(`[server] Ingestion server listening on port ${PORT}`);
      console.info(`[server] WebSocket endpoint: ws${SSL_KEY_PATH ? 's' : ''}://localhost:${PORT}/v1/ingest`);
      console.info(`[server] Health check: http://localhost:${PORT}/health`);
    });
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
    
    ws.on('message', (data: Buffer | string) => {
      if (typeof data === 'string') {
        // Exotel sends JSON messages
        this.exotelHandler.handleMessage(ws as any, data);
      } else {
        console.warn('[exotel] Received binary message, expected JSON');
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
      console.info('[server] Published audio frame', {
        interaction_id: state.interactionId,
        seq: state.seq,
        topic: 'audio_stream',
      });
    }).catch((error) => {
      console.error('[server] Failed to publish frame:', error);
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

  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        console.info('[server] WebSocket server closed');
        if ('disconnect' in this.pubsub) {
          (this.pubsub as any).disconnect().then(() => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }
}

// Start server
const server = new IngestionServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.info('[server] SIGTERM received, shutting down gracefully');
  await server.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.info('[server] SIGINT received, shutting down gracefully');
  await server.shutdown();
  process.exit(0);
});


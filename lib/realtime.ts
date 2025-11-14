/**
 * Real-time event broadcasting module
 * Supports Server-Sent Events (SSE) for live transcript and intent updates
 *
 * In-memory pub/sub system with per-call subscriptions.
 */

import type { RealtimeEvent } from './types';

/**
 * SSE client representation
 */
interface SseClientEntry {
  id: string;
  callId: string | null; // null = global subscription
  res: any; // Node ServerResponse
  createdAt: Date;
}

// In-memory store of active SSE connections
const clients = new Map<string, SseClientEntry>();

// Keep-alive interval (send comment every 30s to prevent timeout)
const HEARTBEAT_INTERVAL_MS = 30000;
let heartbeatTimer: NodeJS.Timeout | null = null;

/**
 * Generate unique client ID
 */
function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Register an SSE client connection
 *
 * @param req - Request object (for cleanup listening)
 * @param res - Node ServerResponse for streaming
 * @param callId - Optional callId to subscribe to specific call (null = global)
 */
export function registerSseClient(req: any, res: any, callId: string | null = null): void {
  const clientId = generateClientId();

  console.info('[realtime] ✅ New SSE client connected', {
    clientId,
    callId: callId || 'global',
    totalClients: clients.size + 1,
    timestamp: new Date().toISOString(),
  });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // CORS for dev (restrict in production)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Flush headers immediately
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  // Send initial connection event
  sendEvent(res, {
    type: 'transcript_line',
    callId: callId || 'system',
    text: `Connected to realtime stream (clientId: ${clientId})`,
  });

  // Store client
  clients.set(clientId, {
    id: clientId,
    callId,
    res,
    createdAt: new Date(),
  });

  // Start heartbeat if not already running
  startHeartbeat();

  // Cleanup on disconnect
  req.on('close', () => {
    const client = clients.get(clientId);
    const durationMs = client?.createdAt ? Date.now() - client.createdAt.getTime() : 0;

    console.info('[realtime] ❌ SSE client disconnected', {
      clientId,
      callId: callId || 'global',
      duration: `${durationMs}ms`,
      timestamp: new Date().toISOString(),
    });
    clients.delete(clientId);

    // Stop heartbeat if no clients left
    if (clients.size === 0) {
      stopHeartbeat();
    }
  });

  req.on('error', (err: Error) => {
    console.error('[realtime] SSE client error', { clientId, error: err.message });
    clients.delete(clientId);
  });
}

/**
 * Send a single event to a response stream
 */
function sendEvent(res: any, event: RealtimeEvent): void {
  try {
    // Format: event: <type>\ndata: <json>\n\n
    const eventStr = `event: ${event.type}\n`;
    const dataStr = `data: ${JSON.stringify(event)}\n\n`;
    
    // Write both parts
    if (typeof res.write === 'function') {
      res.write(eventStr);
      res.write(dataStr);
      
      // Try to flush if available (Node.js streams)
      if (typeof res.flush === 'function') {
        res.flush();
      }
      
      // Log successful send for transcript_line events (for debugging)
      if (event.type === 'transcript_line') {
        console.log('[realtime] 📤 Sent transcript_line event to client', {
          callId: event.callId,
          seq: event.seq,
          textLength: event.text?.length || 0,
        });
      }
    } else {
      console.error('[realtime] ❌ res.write is not a function', typeof res);
    }
  } catch (err: any) {
    console.error('[realtime] ❌ Failed to send event', {
      error: err?.message || err,
      eventType: event.type,
      callId: event.callId,
    });
    // Don't throw - just log the error
  }
}

/**
 * Broadcast an event to all matching clients
 *
 * @param event - Event to broadcast
 */
export function broadcastEvent(event: RealtimeEvent): void {
  const targetCallId = event.callId;
  let sentCount = 0;

  for (const [clientId, client] of clients.entries()) {
    // Send to global subscribers or matching callId subscribers
    if (client.callId === null || client.callId === targetCallId) {
      try {
        sendEvent(client.res, event);
        sentCount++;
      } catch (err) {
        console.error('[realtime] Failed to send to client', { clientId, error: err });
        // Remove failed client
        clients.delete(clientId);
      }
    }
  }

  console.info('[realtime] 📡 Broadcast event', {
    type: event.type,
    callId: targetCallId,
    seq: event.seq,
    recipients: sentCount,
    totalClients: clients.size,
    timestamp: new Date().toISOString(),
    clientDetails: sentCount > 0 ? Array.from(clients.entries())
      .filter(([_, client]) => client.callId === null || client.callId === targetCallId)
      .map(([id, client]) => ({ id, callId: client.callId }))
      : []
  });
}

/**
 * Start heartbeat to keep connections alive
 */
function startHeartbeat(): void {
  if (heartbeatTimer) return; // Already running

  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [clientId, client] of clients.entries()) {
      try {
        // Send comment (ignored by EventSource but keeps connection alive)
        client.res.write(`: heartbeat ${now}\n\n`);
      } catch (err) {
        console.warn('[realtime] Heartbeat failed for client', { clientId });
        clients.delete(clientId);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.info('[realtime] Heartbeat started');
}

/**
 * Stop heartbeat timer
 */
function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.info('[realtime] Heartbeat stopped');
  }
}

/**
 * Get current client count (for monitoring)
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Get clients by callId (for debugging)
 */
export function getClientsByCallId(callId: string): number {
  let count = 0;
  for (const client of clients.values()) {
    if (client.callId === null || client.callId === callId) {
      count++;
    }
  }
  return count;
}

/**
 * Disconnect all clients (for shutdown)
 */
export function disconnectAllClients(): void {
  console.info('[realtime] Disconnecting all clients', { count: clients.size });
  for (const [clientId, client] of clients.entries()) {
    try {
      client.res.end();
    } catch (err) {
      // Ignore errors during shutdown
    }
  }
  clients.clear();
  stopHeartbeat();
}

/**
 * Placeholder for WebSocket support (not implemented in Phase 3)
 *
 * To implement:
 * - Use 'ws' package
 * - Mirror broadcastEvent logic for WS clients
 * - Handle WebSocket upgrade requests
 */
export function openWebSocketServer(server: any): void {
  console.warn('[realtime] WebSocket support not implemented. Use SSE for now.');
  // Future: Initialize ws.Server(server) and handle connections
}

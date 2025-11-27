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

// CRITICAL FIX: Limit SSE clients to prevent memory issues and OOM crashes
// Reduced from 100 to 50, then to 20 for 512MB Render instances
const MAX_SSE_CLIENTS = 20; // Maximum number of concurrent SSE connections (CRITICAL: reduced for 512MB)

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
  // CRITICAL FIX: Limit SSE clients to prevent memory issues and OOM crashes
  // If we have too many clients, remove oldest ones first
  if (clients.size >= MAX_SSE_CLIENTS) {
    // Remove oldest clients (by creation time)
    const clientsArray = Array.from(clients.entries())
      .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());
    
    const toRemove = clientsArray.slice(0, 10); // Remove 10 oldest
    for (const [id] of toRemove) {
      const client = clients.get(id);
      if (client) {
        try {
          if (client.res && typeof client.res.end === 'function') {
            client.res.end();
          } else if (client.res && client.res.controller && typeof client.res.controller.close === 'function') {
            client.res.controller.close();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
        clients.delete(id);
      }
    }
    
    console.warn('[realtime] ⚠️ SSE client limit reached, removed oldest clients', {
      removed: toRemove.length,
      remaining: clients.size,
      maxAllowed: MAX_SSE_CLIENTS,
      timestamp: new Date().toISOString(),
    });
  }

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

  // CRITICAL FIX: Named function to break circular reference
  // This prevents the closure from capturing the entire clients Map
  function cleanupClient() {
    const client = clients.get(clientId);
    if (!client) {
      // Already cleaned up, ignore
      return;
    }
    
    const durationMs = client.createdAt ? Date.now() - client.createdAt.getTime() : 0;

    console.info('[realtime] ❌ SSE client disconnected', {
      clientId,
      callId: callId || 'global',
      duration: `${durationMs}ms`,
      timestamp: new Date().toISOString(),
    });
    
    // CRITICAL FIX: Remove from Map FIRST to break circular reference
    clients.delete(clientId);
    
    // CRITICAL FIX: Clean up response stream to free resources
    try {
      if (client.res && typeof client.res.end === 'function') {
        client.res.end();
      } else if (client.res && client.res.controller && typeof client.res.controller.close === 'function') {
        // Handle ReadableStream controller
        client.res.controller.close();
      }
    } catch (err) {
      // Ignore cleanup errors (stream may already be closed)
    }

    // CRITICAL FIX: Explicitly remove event listeners to prevent memory leaks
    try {
      req.removeListener('close', cleanupClient);
      req.removeListener('error', errorHandler);
    } catch (err) {
      // Ignore if listeners already removed
    }

    // Stop heartbeat if no clients left
    if (clients.size === 0) {
      stopHeartbeat();
    }
  }

  // CRITICAL FIX: Named error handler to allow explicit removal
  function errorHandler(err: Error) {
    console.error('[realtime] SSE client error', { clientId, error: err.message });
    cleanupClient();
  }

  // Cleanup on disconnect
  req.on('close', cleanupClient);
  req.on('error', errorHandler);
}

/**
 * Send a single event to a response stream
 */
function sendEvent(res: any, event: RealtimeEvent): void {
  try {
    // Format: event: <type>\ndata: <json>\n\n
    const eventStr = `event: ${event.type}\n`;
    const dataStr = `data: ${JSON.stringify(event)}\n\n`;
    
    // CRITICAL FIX: Validate that res.write exists and is a function
    // Also check if the stream is still writable (for ReadableStream compatibility)
    if (typeof res.write !== 'function') {
      console.error('[realtime] ❌ res.write is not a function', {
        resType: typeof res,
        hasWrite: 'write' in res,
        writeType: typeof res.write,
      });
      return;
    }
    
    // CRITICAL FIX: Check if stream is closed (for ReadableStream)
    // ReadableStream controller.desiredSize is null when closed
    // For Node.js streams, check if res.writableEnded or res.destroyed
    const isClosed = res.destroyed || res.writableEnded || 
                     (res.controller && res.controller.desiredSize === null);
    
    if (isClosed) {
      console.warn('[realtime] ⚠️ Attempted to write to closed stream', {
        eventType: event.type,
        callId: event.callId,
      });
      return;
    }
    
    // Write both parts
    try {
      res.write(eventStr);
      res.write(dataStr);
      
      // Try to flush if available (Node.js streams)
      if (typeof res.flush === 'function') {
        res.flush();
      }
      
      // CRITICAL MEMORY FIX: Removed per-event logging to prevent memory exhaustion
      // With 300ms chunks, this was logging 200+ times per minute per call
      // Creating millions of log objects that accumulate in memory
    } catch (writeErr: any) {
      // CRITICAL FIX: Handle write errors gracefully
      // If stream is closed, remove client from registry
      if (writeErr?.message?.includes('closed') || 
          writeErr?.name === 'TypeError' ||
          writeErr?.code === 'ERR_STREAM_WRITE_AFTER_END') {
        console.warn('[realtime] ⚠️ Stream closed during write, removing client', {
          eventType: event.type,
          callId: event.callId,
          error: writeErr?.message || writeErr,
        });
        // Note: Client cleanup is handled by the 'close' event handler
        return;
      }
      throw writeErr; // Re-throw unexpected errors
    }
  } catch (err: any) {
    console.error('[realtime] ❌ Failed to send event', {
      error: err?.message || err,
      errorName: err?.name,
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
  
  // CRITICAL FIX: Removed excessive debug logging that creates arrays on every broadcast
  // This was causing massive memory leaks - creating 5-10 temporary arrays per event
  // With 30 transcripts/minute, that's 150-300 arrays/minute accumulating in memory

  for (const [clientId, client] of clients.entries()) {
    // CRITICAL FIX: Use exact matching only - partial matching causes incorrect delivery
    // Send to global subscribers (callId === null) or exact callId match
    const matches = client.callId === null || client.callId === targetCallId;
    
    if (matches) {
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

  // Minimal logging - only warn if important (0 recipients with active clients)
  if (sentCount === 0 && clients.size > 0) {
    console.warn('[realtime] ⚠️ Broadcast event with 0 recipients', {
      type: event.type,
      targetCallId,
      totalClients: clients.size,
      suggestion: 'Check if UI is connected with correct callId/interactionId',
    });
  }

  // CRITICAL MEMORY FIX: Remove per-event broadcast logging
  // With 300ms chunks + multiple clients, this creates too many log objects
  // Only log summary stats periodically instead (handled by periodic cleanup)
}

/**
 * Start heartbeat to keep connections alive
 */
function startHeartbeat(): void {
  if (heartbeatTimer) return; // Already running

  heartbeatTimer = setInterval(() => {
    const now = Date.now();
    // CRITICAL FIX: Snapshot client IDs first to avoid capturing entire Map in closure
    // This prevents the closure from keeping all clients alive
    const clientIds = Array.from(clients.keys());
    
    for (const clientId of clientIds) {
      const client = clients.get(clientId);
      if (!client) continue; // Already removed
      
      try {
        // CRITICAL FIX: Validate stream is writable before sending heartbeat
        const isClosed = client.res.destroyed || client.res.writableEnded || 
                         (client.res.controller && client.res.controller.desiredSize === null);
        
        if (isClosed) {
          clients.delete(clientId);
          continue;
        }
        
        // Send comment (ignored by EventSource but keeps connection alive)
        if (typeof client.res.write === 'function') {
          client.res.write(`: heartbeat ${now}\n\n`);
        } else {
          clients.delete(clientId);
        }
      } catch (err: any) {
        // CRITICAL FIX: Handle different error types
        if (err?.message?.includes('closed') || 
            err?.name === 'TypeError' ||
            err?.code === 'ERR_STREAM_WRITE_AFTER_END') {
          // Stream closed - silently remove
        } else {
          console.warn('[realtime] Heartbeat failed for client', { 
            clientId, 
            error: err?.message || err 
          });
        }
        clients.delete(clientId);
      }
    }
    
    // Stop heartbeat if no clients left
    if (clients.size === 0) {
      stopHeartbeat();
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
      if (client.res && typeof client.res.end === 'function') {
        client.res.end();
      } else if (client.res && client.res.controller && typeof client.res.controller.close === 'function') {
        client.res.controller.close();
      }
    } catch (err) {
      // Ignore errors during shutdown
    }
  }
  clients.clear();
  stopHeartbeat();
}

/**
 * Periodic cleanup of stale SSE clients (prevents memory leaks)
 * Removes clients that have been connected for more than 1 hour
 */
let staleClientCleanupTimer: NodeJS.Timeout | null = null;

export function startStaleClientCleanup(): void {
  if (staleClientCleanupTimer) return; // Already running
  
  const CLEANUP_INTERVAL_MS = 30000; // Check every 30 seconds (CRITICAL MEMORY FIX: reduced from 60s)
  const MAX_CLIENT_AGE_MS = 600000; // 10 minutes (CRITICAL MEMORY FIX: reduced from 1 hour)
  
  staleClientCleanupTimer = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [clientId, client] of clients.entries()) {
      const age = now - client.createdAt.getTime();
      if (age > MAX_CLIENT_AGE_MS) {
        console.warn('[realtime] Removing stale client', { 
          clientId, 
          callId: client.callId || 'global',
          age: `${Math.round(age / 1000)}s`,
          maxAge: `${MAX_CLIENT_AGE_MS / 1000}s`,
        });
        
        try {
          if (client.res && typeof client.res.end === 'function') {
            client.res.end();
          } else if (client.res && client.res.controller && typeof client.res.controller.close === 'function') {
            client.res.controller.close();
          }
        } catch (err) {
          // Ignore cleanup errors
        }
        
        clients.delete(clientId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.info('[realtime] Stale client cleanup completed', { 
        cleanedCount, 
        remainingClients: clients.size 
      });
    }
    
    // Stop heartbeat if no clients left
    if (clients.size === 0) {
      stopHeartbeat();
    }
  }, CLEANUP_INTERVAL_MS);
  
  console.info('[realtime] Stale client cleanup started');
}

// Start stale client cleanup on module load
startStaleClientCleanup();

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

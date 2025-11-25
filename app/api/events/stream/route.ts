/**
 * SSE Stream Endpoint
 * GET /api/events/stream?callId=...
 *
 * Real-time event stream for transcript lines and intent updates.
 * Clients connect via EventSource and receive live events as they occur.
 *
 * Note: Must use Node.js runtime (not Edge) for response streaming support.
 */

import { registerSseClient } from '@/lib/realtime';

// Force Node runtime (Edge doesn't support streaming responses properly)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET handler for SSE stream
 *
 * Query params:
 * - callId: Optional. Subscribe to specific call. Omit for global feed.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId') || null;

    console.info('[sse-endpoint] 🔌 New SSE connection request', {
      callId: callId || 'global',
      userAgent: req.headers.get('user-agent')?.substring(0, 50),
      timestamp: new Date().toISOString(),
    });

    // Create a ReadableStream to handle SSE
    // Use a closure-safe approach for Turbopack
    const streamCallId = callId; // Capture in const for closure
    let closeHandler: (() => void) | null = null;
    
    const stream = new ReadableStream({
    start(controller) {
      // CRITICAL FIX: Send comment line FIRST to trigger headers and onopen
      // EventSource's onopen fires when it receives ANY data, including comments
      // Comment lines (starting with :) are ignored by EventSource but trigger the connection
      try {
        // Send comment line first - this triggers headers to be sent and onopen to fire
        const commentLine = `: connected\n\n`;
        controller.enqueue(new TextEncoder().encode(commentLine));
        console.log('[sse-endpoint] ✅ Sent connection comment (triggers onopen)', {
          callId: streamCallId || 'global',
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error('[sse-endpoint] Failed to send comment line', {
          error: err?.message || err,
          stack: err?.stack,
        });
      }

      // Then send initial connection event
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const initialEvent = {
        type: 'transcript_line',
        callId: streamCallId || 'system',
        text: `Connected to realtime stream (clientId: ${clientId})`,
      };
      
      // Format as SSE event: event: <type>\ndata: <json>\n\n
      const initialEventStr = `event: ${initialEvent.type}\ndata: ${JSON.stringify(initialEvent)}\n\n`;
      
      try {
        // Send immediately via controller (before registering client)
        // This ensures headers are sent and browser's onopen event fires
        const encoded = new TextEncoder().encode(initialEventStr);
        controller.enqueue(encoded);
        console.log('[sse-endpoint] ✅ Sent initial connection event immediately', {
          clientId,
          callId: streamCallId || 'global',
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error('[sse-endpoint] Failed to send initial event', {
          error: err?.message || err,
          stack: err?.stack,
        });
        // If we can't send initial event, try to send error event
        try {
          const errorEvent = `event: error\ndata: ${JSON.stringify({ error: 'Failed to initialize stream' })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorEvent));
        } catch {
          // If even that fails, we'll let the outer try-catch handle it
          throw err;
        }
      }

      // CRITICAL FIX: Create a mock response object that properly writes to ReadableStream
      // The write() method must handle SSE format correctly and ensure data is properly encoded
      // Store controller reference so realtime.ts can check if stream is closed
      const mockRes = {
        controller, // CRITICAL FIX: Expose controller for closed-state checks
        setHeader: () => {},
        flushHeaders: () => {},
        write: (chunk: string | Uint8Array) => {
          try {
            // CRITICAL FIX: Check if stream is closed before writing
            if (controller.desiredSize === null) {
              // Stream is closed, don't write
              return;
            }
            
            // CRITICAL FIX: Ensure chunk is properly encoded as UTF-8
            // ReadableStream expects Uint8Array, so we need to encode strings
            if (typeof chunk === 'string') {
              const encoded = new TextEncoder().encode(chunk);
              controller.enqueue(encoded);
            } else if (chunk instanceof Uint8Array) {
              controller.enqueue(chunk);
            } else {
              // Fallback: convert to string then encode
              const encoded = new TextEncoder().encode(String(chunk));
              controller.enqueue(encoded);
            }
          } catch (err: any) {
            // Stream might be closed, log but don't throw
            if (err?.name !== 'TypeError' || !err?.message?.includes('closed')) {
              console.warn('[sse-endpoint] Write error (stream may be closed)', {
                error: err?.message || err,
                chunkType: typeof chunk,
                chunkLength: typeof chunk === 'string' ? chunk.length : 'N/A',
              });
            }
          }
        },
        flush: () => {
          // CRITICAL FIX: Add flush method for compatibility with Node.js streams
          // ReadableStream doesn't need explicit flush, but some code may call it
          try {
            // No-op for ReadableStream, but ensure controller is still open
            if (controller.desiredSize === null) {
              // Stream is closed
              return;
            }
          } catch (err) {
            // Ignore flush errors
          }
        },
        end: () => {
          try {
            controller.close();
          } catch (err) {
            // Already closed - ignore
          }
        },
      };

      // Create a mock request for cleanup handling
      const mockReq = {
        on: (event: string, handler: any) => {
          if (event === 'close') {
            // Store cleanup handler to call when stream is cancelled
            closeHandler = handler;
          }
          return mockReq; // Return self for chaining
        },
      };

      // Register SSE client
      // CRITICAL: Don't close stream if registration fails - initial event was already sent
      // The browser already knows it's connected, so let the stream continue
      try {
        registerSseClient(mockReq, mockRes, streamCallId);
      } catch (err: any) {
        console.error('[sse-endpoint] Failed to register client', {
          error: err?.message || err,
          stack: err?.stack,
          callId: streamCallId || 'global',
        });
        // DON'T call controller.error() - let stream continue
        // The initial event was already sent, so browser knows it's connected
      }
    },
    cancel() {
      const cancelledCallId = streamCallId || 'global';
      console.info('[sse-endpoint] ❌ Stream cancelled', { 
        callId: cancelledCallId,
        timestamp: new Date().toISOString()
      });
      // Call cleanup handler if it exists
      if (closeHandler) {
        try {
          closeHandler();
        } catch (err) {
          console.warn('[sse-endpoint] Error in close handler', err);
        }
      }
    },
  });

    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        // CORS for dev (restrict in production)
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (err: any) {
    // CRITICAL: If stream creation fails completely, return error response instead of hanging
    console.error('[sse-endpoint] Fatal error creating SSE stream', {
      error: err?.message || err,
      stack: err?.stack,
      timestamp: new Date().toISOString(),
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to create SSE stream', 
        message: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * SSE Stream Endpoint
 * GET /api/events/stream?callId=...
 *
 * Real-time event stream for transcript lines and intent updates.
 * Clients connect via EventSource and receive live events as they occur.
 *
 * Note: Must use Node.js runtime (not Edge) for response streaming support.
 */

// Force Node runtime (Edge doesn't support streaming responses properly)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { registerSseClient } from '@/lib/realtime';

/**
 * GET handler for SSE stream
 *
 * Query params:
 * - callId: Optional. Subscribe to specific call. Omit for global feed.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const callId = url.searchParams.get('callId') || null;

  console.info('[sse-endpoint] New connection request', {
    callId: callId || 'global',
    userAgent: req.headers.get('user-agent')?.substring(0, 50),
  });

  // Create a ReadableStream to handle SSE
  let closeHandler: (() => void) | null = null;
  
  const stream = new ReadableStream({
    start(controller) {
      // Create a mock response object that writes to the controller
      const mockRes = {
        setHeader: () => {},
        flushHeaders: () => {},
        write: (chunk: string) => {
          try {
            const encoded = typeof chunk === 'string' 
              ? new TextEncoder().encode(chunk)
              : chunk;
            controller.enqueue(encoded);
          } catch (err) {
            // Stream might be closed, ignore
            console.warn('[sse-endpoint] Write error (stream may be closed)', err);
          }
        },
        end: () => {
          try {
            controller.close();
          } catch (err) {
            // Already closed
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
      try {
        registerSseClient(mockReq, mockRes, callId);
      } catch (err) {
        console.error('[sse-endpoint] Failed to register client', err);
        controller.error(err);
      }
    },
    cancel() {
      console.info('[sse-endpoint] Stream cancelled', { callId: callId || 'global' });
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

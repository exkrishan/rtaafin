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

  // Create a TransformStream to handle SSE
  const stream = new ReadableStream({
    start(controller) {
      // Create a mock response object that writes to the controller
      const mockRes = {
        setHeader: () => {},
        flushHeaders: () => {},
        write: (chunk: string) => {
          try {
            controller.enqueue(new TextEncoder().encode(chunk));
          } catch (err) {
            console.error('[sse-endpoint] Write error', err);
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
            return handler;
          }
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

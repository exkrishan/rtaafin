/**
 * SSE Stream Endpoint
 * GET /api/events/stream?callId=...
 *
 * Real-time event stream for transcript lines and intent updates.
 * Clients connect via EventSource and receive live events as they occur.
 *
 * CTO FIX: Using ReadableStream with controller.enqueue() for immediate data flush
 * This fixes the issue where EventSource.onopen wasn't firing because
 * Next.js was buffering data. Using controller.enqueue() in the start() callback
 * ensures data is sent immediately before the Response is returned.
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

    const streamCallId = callId; // Capture in const for closure
    const encoder = new TextEncoder();
    let closeHandler: (() => void) | null = null;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

    // CRITICAL FIX: Use ReadableStream with controller - Next.js App Router supports this natively
    // This ensures immediate data transmission without buffering issues
    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
        
        // Send initial connection data IMMEDIATELY (synchronously in start callback)
        // This ensures EventSource.onopen fires because data is sent before Response is returned
        const initialData = {
          type: 'connection',
          callId: streamCallId || 'system',
          message: 'connected',
          timestamp: new Date().toISOString(),
        };
        const initialDataStr = `data: ${JSON.stringify(initialData)}\n\n`;
        
        try {
          controller.enqueue(encoder.encode(initialDataStr));
          console.log('[sse-endpoint] ✅ Sent initial connection data (enqueued)', {
            callId: streamCallId || 'global',
            timestamp: new Date().toISOString(),
          });
        } catch (err: any) {
          console.error('[sse-endpoint] Failed to send initial data', {
            error: err?.message || err,
            callId: streamCallId || 'global',
          });
        }

        // Create mock response object for registerSseClient
        // This allows realtime.ts to write to our ReadableStream
        const mockRes = {
          controller: { desiredSize: 1 }, // Mock controller for compatibility checks
          setHeader: () => {}, // No-op (headers set in Response constructor)
          flushHeaders: () => {}, // No-op (ReadableStream flushes automatically)
          write: (chunk: string | Uint8Array) => {
            try {
              if (!streamController) {
                console.warn('[sse-endpoint] Cannot write - stream controller is null');
                return;
              }
              
              // Encode string chunks to Uint8Array
              const encoded = typeof chunk === 'string' 
                ? encoder.encode(chunk)
                : chunk instanceof Uint8Array 
                ? chunk
                : encoder.encode(String(chunk));
              
              // Enqueue to ReadableStream (this sends data immediately)
              streamController.enqueue(encoded);
            } catch (err: any) {
              console.warn('[sse-endpoint] Write error', {
                error: err?.message || err,
                chunkType: typeof chunk,
              });
            }
          },
          flush: () => {
            // No-op for ReadableStream (flushes automatically)
          },
          end: () => {
            try {
              if (streamController) {
                streamController.close();
                streamController = null;
              }
            } catch (err) {
              // Already closed - ignore
            }
          },
        };

        // Create mock request for cleanup handling
        const mockReq = {
          on: (event: string, handler: any) => {
            if (event === 'close') {
              closeHandler = handler;
            }
            return mockReq;
          },
        };

        // Register SSE client (synchronously in start callback)
        // This allows broadcasts from realtime.ts to work
        try {
          registerSseClient(mockReq, mockRes, streamCallId);
        } catch (err: any) {
          console.error('[sse-endpoint] Failed to register client', {
            error: err?.message || err,
            callId: streamCallId || 'global',
          });
        }
      },
      cancel() {
        console.info('[sse-endpoint] ❌ Stream cancelled', {
          callId: streamCallId || 'global',
          timestamp: new Date().toISOString(),
        });
        
        if (closeHandler) {
          try {
            closeHandler();
          } catch (err) {
            console.warn('[sse-endpoint] Error in close handler', err);
          }
        }
        
        streamController = null;
      },
    });

    // Return SSE response with ReadableStream
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx/proxy buffering
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

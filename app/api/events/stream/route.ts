/**
 * SSE Stream Endpoint
 * GET /api/events/stream?callId=...
 *
 * Real-time event stream for transcript lines and intent updates.
 * Clients connect via EventSource and receive live events as they occur.
 *
 * CTO FIX: Using TransformStream to ensure immediate data flush
 * This fixes the issue where EventSource.onopen wasn't firing because
 * Next.js ReadableStream was buffering data instead of flushing immediately.
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

    // CTO FIX: Use TransformStream instead of ReadableStream
    // TransformStream ensures immediate data transmission, fixing the buffering issue
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // CRITICAL: Send initial data IMMEDIATELY (synchronously, before any async operations)
    // This ensures EventSource.onopen fires because data is actually sent to the browser
    const initialData = {
      type: 'connection',
      callId: streamCallId || 'system',
      message: 'connected',
      timestamp: new Date().toISOString(),
    };
    const initialDataStr = `data: ${JSON.stringify(initialData)}\n\n`;
    
    // Write immediately - this will be flushed to browser right away
    writer.write(encoder.encode(initialDataStr));
    console.log('[sse-endpoint] ✅ Sent initial connection data (immediate flush)', {
      callId: streamCallId || 'global',
      timestamp: new Date().toISOString(),
    });

    // Create mock response object for registerSseClient
    // This allows realtime.ts to write to our TransformStream
    const mockRes = {
      controller: { desiredSize: 1 }, // Mock controller for compatibility checks
      setHeader: () => {}, // No-op (headers set in Response constructor)
      flushHeaders: () => {}, // No-op (TransformStream flushes automatically)
      write: (chunk: string | Uint8Array) => {
        try {
          // Encode string chunks to Uint8Array
          const encoded = typeof chunk === 'string' 
            ? encoder.encode(chunk)
            : chunk instanceof Uint8Array 
            ? chunk
            : encoder.encode(String(chunk));
          
          // Write to TransformStream (this flushes immediately)
          writer.write(encoded).catch((err: any) => {
            // Stream might be closed, log but don't throw
            if (err?.name !== 'TypeError' || !err?.message?.includes('closed')) {
              console.warn('[sse-endpoint] Write error (stream may be closed)', {
                error: err?.message || err,
                chunkType: typeof chunk,
              });
            }
          });
        } catch (err: any) {
          console.warn('[sse-endpoint] Failed to write chunk', {
            error: err?.message || err,
          });
        }
      },
      flush: () => {
        // No-op for TransformStream (flushes automatically)
      },
      end: () => {
        writer.close().catch(() => {
          // Already closed - ignore
        });
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

    // Register SSE client asynchronously (after initial data is sent)
    // This allows broadcasts from realtime.ts to work
    registerSseClient(mockReq, mockRes, streamCallId).catch((err: any) => {
      console.error('[sse-endpoint] Failed to register client', {
        error: err?.message || err,
        callId: streamCallId || 'global',
      });
    });

    // Handle cleanup when stream is cancelled
    // TransformStream automatically handles cancellation, but we need to clean up our resources
    // The writer will be closed automatically when readable is cancelled
    // We use a promise to detect when the stream ends
    writer.closed.then(() => {
      console.info('[sse-endpoint] ❌ Stream writer closed', {
        callId: streamCallId || 'global',
        timestamp: new Date().toISOString(),
      });
      
      // Call cleanup handler if it exists
      if (closeHandler) {
        try {
          closeHandler();
        } catch (err) {
          console.warn('[sse-endpoint] Error in close handler', err);
        }
      }
    }).catch(() => {
      // Stream closed normally or cancelled - ignore
    });

    // Return SSE response with TransformStream readable side
    return new Response(readable, {
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

/**
 * Subscribe to transcripts for a specific interaction ID
 * POST /api/transcripts/subscribe
 * 
 * Body: { interactionId: string }
 * 
 * This will start the transcript consumer (if not running) and subscribe to
 * the transcript.{interactionId} topic from Redis Streams.
 * Transcripts will be automatically forwarded to /api/calls/ingest-transcript
 * which triggers intent detection and SSE broadcast.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { subscribeToTranscripts } from '@/lib/transcript-consumer';
import { startTranscriptConsumer } from '@/lib/transcript-consumer';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { interactionId } = body;

    if (!interactionId || typeof interactionId !== 'string') {
      return Response.json(
        { ok: false, error: 'interactionId is required and must be a string' },
        { status: 400 }
      );
    }

    // Start consumer if not already running
    try {
      await startTranscriptConsumer();
    } catch (err: any) {
      // Consumer might already be running, that's okay
      if (!err.message?.includes('already running')) {
        console.warn('[transcripts/subscribe] Consumer start warning:', err.message);
      }
    }

    // Subscribe to this specific interaction
    await subscribeToTranscripts(interactionId);

    return Response.json({
      ok: true,
      message: `Subscribed to transcripts for interaction ${interactionId}`,
      interactionId,
    });
  } catch (error: any) {
    console.error('[transcripts/subscribe] Error:', error);
    return Response.json(
      { ok: false, error: error.message || 'Failed to subscribe to transcripts' },
      { status: 500 }
    );
  }
}

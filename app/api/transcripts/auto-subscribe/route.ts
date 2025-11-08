/**
 * Auto-Subscribe to Transcripts API
 * 
 * This endpoint automatically subscribes to transcript streams when a call starts.
 * It discovers transcript.* streams from Redis and subscribes to them.
 * 
 * POST /api/transcripts/auto-subscribe
 * Body: { interactionId?: string } (optional - if provided, subscribes to specific one)
 */

import { NextResponse } from 'next/server';
import { subscribeToTranscripts, getTranscriptConsumer } from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { interactionId } = body;

    const consumer = getTranscriptConsumer();
    
    // If interactionId provided, subscribe to it
    if (interactionId) {
      await subscribeToTranscripts(interactionId);
      return NextResponse.json({
        ok: true,
        interactionId,
        message: 'Subscribed to transcripts',
      });
    }

    // Otherwise, trigger stream discovery
    // This will auto-discover and subscribe to all transcript.* streams
    const consumerInternal = consumer as any;
    if (consumerInternal.discoverAndSubscribeToNewStreams) {
      await consumerInternal.discoverAndSubscribeToNewStreams();
    }

    const status = consumer.getStatus();
    return NextResponse.json({
      ok: true,
      message: 'Auto-subscription triggered',
      status,
    });
  } catch (error: any) {
    console.error('[transcripts/auto-subscribe] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


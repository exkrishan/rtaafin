/**
 * Transcript Subscription API
 * 
 * POST /api/transcripts/subscribe
 * Subscribe to transcripts for a specific interaction/call
 * 
 * Body: { interactionId: string, callId?: string }
 */

import { NextResponse } from 'next/server';
import { subscribeToTranscripts } from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { interactionId, callId } = body;

    if (!interactionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: interactionId' },
        { status: 400 }
      );
    }

    console.info('[transcripts/subscribe] Subscribing to transcripts', {
      interactionId,
      callId: callId || interactionId,
    });

    await subscribeToTranscripts(interactionId);

    return NextResponse.json({
      ok: true,
      interactionId,
      message: 'Subscribed to transcripts',
    });
  } catch (error: any) {
    console.error('[transcripts/subscribe] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


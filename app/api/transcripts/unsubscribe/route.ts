/**
 * Transcript Unsubscription API
 * 
 * POST /api/transcripts/unsubscribe
 * Unsubscribe from transcripts for a specific interaction/call
 * 
 * Body: { interactionId: string }
 */

import { NextResponse } from 'next/server';
import { unsubscribeFromTranscripts } from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { interactionId } = body;

    if (!interactionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: interactionId' },
        { status: 400 }
      );
    }

    console.info('[transcripts/unsubscribe] Unsubscribing from transcripts', {
      interactionId,
    });

    await unsubscribeFromTranscripts(interactionId);

    return NextResponse.json({
      ok: true,
      interactionId,
      message: 'Unsubscribed from transcripts',
    });
  } catch (error: any) {
    console.error('[transcripts/unsubscribe] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}

 * Transcript Unsubscription API
 * 
 * POST /api/transcripts/unsubscribe
 * Unsubscribe from transcripts for a specific interaction/call
 * 
 * Body: { interactionId: string }
 */

import { NextResponse } from 'next/server';
import { unsubscribeFromTranscripts } from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { interactionId } = body;

    if (!interactionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: interactionId' },
        { status: 400 }
      );
    }

    console.info('[transcripts/unsubscribe] Unsubscribing from transcripts', {
      interactionId,
    });

    await unsubscribeFromTranscripts(interactionId);

    return NextResponse.json({
      ok: true,
      interactionId,
      message: 'Unsubscribed from transcripts',
    });
  } catch (error: any) {
    console.error('[transcripts/unsubscribe] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


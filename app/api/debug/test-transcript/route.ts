/**
 * Debug endpoint to test transcript broadcasting
 * POST /api/debug/test-transcript
 */

import { NextResponse } from 'next/server';
import { broadcastEvent } from '@/lib/realtime';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { callId, text, seq } = body;

    if (!callId || !text) {
      return NextResponse.json(
        { ok: false, error: 'callId and text are required' },
        { status: 400 }
      );
    }

    console.log('[debug/test-transcript] Broadcasting test transcript', {
      callId,
      seq: seq || 1,
      textLength: text.length,
    });

    // Broadcast the transcript
    broadcastEvent({
      type: 'transcript_line',
      callId,
      seq: seq || 1,
      ts: new Date().toISOString(),
      text,
    });

    return NextResponse.json({
      ok: true,
      message: 'Test transcript broadcasted',
      callId,
      seq: seq || 1,
    });
  } catch (err: any) {
    console.error('[debug/test-transcript] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}


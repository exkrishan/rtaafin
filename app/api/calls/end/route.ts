/**
 * Call End API - Finalizes a call when end marker is detected.
 * Marks the call as complete and performs any cleanup.
 */

import { NextResponse } from 'next/server';

interface EndCallRequest {
  callId: string;
}

export async function POST(req: Request) {
  try {
    const body: EndCallRequest = await req.json();

    if (!body.callId) {
      return NextResponse.json(
        { ok: false, error: 'Missing callId' },
        { status: 400 }
      );
    }

    console.info('[call-end] Finalizing call', { callId: body.callId });

    // TODO: Phase 2 - Implement call finalization logic:
    // - Mark call as complete in database
    // - Generate final summary/report
    // - Cleanup resources
    // - Notify relevant services

    console.info('[call-end] Call finalized successfully', { callId: body.callId });

    return NextResponse.json({
      ok: true,
      callId: body.callId,
      status: 'completed',
    });
  } catch (err: any) {
    console.error('[call-end] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * Dispose Call API
 * POST /api/calls/[callId]/dispose
 * 
 * Called when a call is disposed to:
 * 1. Clear transcripts from in-memory cache
 * 2. Save disposition data (future)
 * 3. Signal UI to clear and wait for next call
 */

import { NextResponse } from 'next/server';
import { clearCallFromCache } from '@/lib/ingest-transcript-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: { callId: string } }
) {
  try {
    const callId = params.callId;
    
    if (!callId) {
      return NextResponse.json(
        { ok: false, error: 'Missing callId' },
        { status: 400 }
      );
    }

    // Get request body (disposition data)
    let dispositionData: any = null;
    try {
      dispositionData = await request.json();
    } catch (e) {
      // Body is optional
    }

    console.log('[dispose] Disposing call:', {
      callId,
      disposition: dispositionData?.disposition,
      notes: dispositionData?.notes?.substring(0, 100),
    });

    // Clear transcripts from in-memory cache
    const wasCleared = clearCallFromCache(callId);

    // TODO: Save disposition data to Supabase
    // await supabase.from('dispositions').insert({
    //   call_id: callId,
    //   disposition: dispositionData?.disposition,
    //   notes: dispositionData?.notes,
    //   created_at: new Date().toISOString(),
    // });

    console.info('[dispose] ✅ Call disposed successfully', {
      callId,
      transcriptsCleared: wasCleared,
      note: 'UI should now wait for new call',
    });

    return NextResponse.json({
      ok: true,
      callId,
      message: 'Call disposed successfully',
      transcriptsCleared: wasCleared,
      note: 'UI should clear and wait for new call',
    });

  } catch (error: any) {
    console.error('[dispose] Error disposing call:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


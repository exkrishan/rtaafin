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
  { params }: { params: Promise<{ callId: string }> }
) {
  try {
    // Next.js 15+: params is now async and must be awaited
    const { callId } = await params;
    
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

    // Clear intents from Supabase (prevent old intents from appearing)
    try {
      const { error: intentDeleteError } = await (await import('@/lib/supabase')).supabase
        .from('intents')
        .delete()
        .eq('call_id', callId);
      
      if (intentDeleteError) {
        console.error('[dispose] Error deleting intents (non-critical):', intentDeleteError);
      } else {
        console.info('[dispose] ✅ Cleared intents from database', { callId });
      }
    } catch (intentErr) {
      console.error('[dispose] Failed to clear intents (non-critical):', intentErr);
    }

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
      intentsCleared: true,
      note: 'UI should now wait for new call with no old data',
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


/**
 * Ingest Check API - Checks if a chunk has already been processed.
 * Used by orchestrator for server-side deduplication.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');
    const seqParam = url.searchParams.get('seq');

    if (!callId || !seqParam) {
      return NextResponse.json(
        { ok: false, error: 'Missing callId or seq parameter' },
        { status: 400 }
      );
    }

    const seq = parseInt(seqParam, 10);
    if (isNaN(seq)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid seq parameter' },
        { status: 400 }
      );
    }

    // Check if chunk exists in database
    try {
      const { data, error } = await supabase
        .from('ingest_events')
        .select('seq')
        .eq('call_id', callId)
        .eq('seq', seq)
        .limit(1);

      if (error) {
        console.error('[ingest-check] Supabase error:', error);
        return NextResponse.json({ ok: true, seen: false });
      }

      const seen = data && data.length > 0;
      return NextResponse.json({ ok: true, seen });
    } catch (supabaseErr) {
      console.error('[ingest-check] Error:', supabaseErr);
      // If we can't check, assume not seen to allow processing
      return NextResponse.json({ ok: true, seen: false });
    }
  } catch (err: any) {
    console.error('[ingest-check] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}

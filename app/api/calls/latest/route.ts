/**
 * Get Latest Call API
 * GET /api/calls/latest
 * 
 * Returns the most recent call that has transcripts.
 * This enables automated discovery of new calls without manual callId entry.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    // Query for the most recent call_id with transcripts
    const { data, error } = await (supabase as any)
      .from('ingest_events')
      .select('call_id, created_at, seq')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[calls/latest] Error fetching latest call:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch latest call' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No calls found' },
        { status: 404 }
      );
    }

    const latestCall = data[0];
    
    // Get transcript count for this call
    const { data: countData, error: countError } = await (supabase as any)
      .from('ingest_events')
      .select('seq', { count: 'exact' })
      .eq('call_id', latestCall.call_id);
    
    const transcriptCount = countData?.length || 0;

    console.info('[calls/latest] Found latest call', {
      callId: latestCall.call_id,
      transcriptCount,
      latestActivity: latestCall.created_at,
    });

    return NextResponse.json({
      ok: true,
      callId: latestCall.call_id,
      transcriptCount,
      latestActivity: latestCall.created_at,
      viewUrl: `/live?callId=${encodeURIComponent(latestCall.call_id)}`,
    });
  } catch (error: any) {
    console.error('[calls/latest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


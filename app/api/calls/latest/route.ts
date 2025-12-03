/**
 * Get Latest Call API
 * GET /api/calls/latest
 * 
 * Returns the most recent call that has transcripts (from in-memory cache).
 * This enables automated discovery of new calls without manual callId entry.
 * 
 * OPTIMIZATION: Uses in-memory cache instead of Supabase for instant access.
 */

import { NextResponse } from 'next/server';
import { getLatestCallIdFromCache } from '@/lib/ingest-transcript-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    // OPTIMIZATION: Find latest call from in-memory cache
    // This is instant and doesn't require DB query
    const latestCall = getLatestCallIdFromCache();
    
    if (!latestCall) {
      console.info('[calls/latest] ⚡ No calls in cache yet');
      return NextResponse.json({
        ok: false,
        error: 'No calls found',
      }, { status: 404 });
    }
    
    console.info('[calls/latest] ⚡ Found latest call from cache', {
      callId: latestCall.callId,
      transcriptCount: latestCall.transcriptCount,
      latestActivity: latestCall.latestActivity,
      note: 'Instant access from in-memory cache',
    });

    return NextResponse.json({
      ok: true,
      callId: latestCall.callId,
      transcriptCount: latestCall.transcriptCount,
      latestActivity: latestCall.latestActivity,
      viewUrl: `/live?callId=${encodeURIComponent(latestCall.callId)}`,
    });
    
  } catch (error: any) {
    console.error('[calls/latest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


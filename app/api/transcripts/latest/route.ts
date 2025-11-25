/**
 * Get Latest Transcripts API
 * GET /api/transcripts/latest?callId=...
 * 
 * Returns the latest transcripts for a callId from the database.
 * Used as a polling fallback when SSE connection fails.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface TranscriptUtterance {
  id: string;
  text: string;
  speaker: 'agent' | 'customer';
  timestamp: string;
  seq?: number;
  confidence?: number;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');

    if (!callId) {
      return NextResponse.json(
        { ok: false, error: 'Missing callId parameter' },
        { status: 400 }
      );
    }

    // Fetch all transcript chunks from Supabase
    const { data: transcriptData, error: transcriptError } = await supabase
      .from('ingest_events')
      .select('seq, text, ts, created_at')
      .eq('call_id', callId)
      .order('seq', { ascending: true });

    if (transcriptError) {
      console.error('[transcripts/latest] Failed to fetch transcripts', {
        error: transcriptError.message,
        callId,
      });
      return NextResponse.json(
        { ok: false, error: transcriptError.message },
        { status: 500 }
      );
    }

    if (!transcriptData || !Array.isArray(transcriptData) || transcriptData.length === 0) {
      return NextResponse.json({
        ok: true,
        callId,
        transcripts: [],
        count: 0,
      });
    }

    // Convert database format to TranscriptUtterance format
    const transcripts: TranscriptUtterance[] = transcriptData
      .filter((event: any) => event.text && event.text.trim().length > 0)
      .map((event: any, index: number) => {
        // Determine speaker (alternate for demo, or use actual speaker detection if available)
        const speaker: 'agent' | 'customer' = index % 2 === 0 ? 'customer' : 'agent';
        
        return {
          id: `${callId}-${event.seq}`,
          text: event.text.trim(),
          speaker,
          timestamp: event.ts || event.created_at || new Date().toISOString(),
          seq: event.seq,
        };
      });

    console.info('[transcripts/latest] ✅ Fetched transcripts', {
      callId,
      count: transcripts.length,
    });

    return NextResponse.json({
      ok: true,
      callId,
      transcripts,
      count: transcripts.length,
    });
  } catch (error: any) {
    console.error('[transcripts/latest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


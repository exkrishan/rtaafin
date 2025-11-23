/**
 * Get Complete Transcript API
 * Fetches all transcript chunks for a call from Supabase
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface TranscriptChunk {
  seq: number;
  text: string;
  ts: string;
  created_at: string;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ interactionId: string }> }
) {
  try {
    const { interactionId } = await params;

    if (!interactionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing interactionId' },
        { status: 400 }
      );
    }

    console.info('[get-transcript] Fetching transcript', { interactionId });

    // Fetch all transcript chunks from Supabase
    const { data: transcriptData, error: transcriptError } = await (supabase as any)
      .from('ingest_events')
      .select('seq, text, ts, created_at')
      .eq('call_id', interactionId)
      .order('seq', { ascending: true });

    if (transcriptError) {
      console.error('[get-transcript] Failed to fetch transcript', {
        error: transcriptError.message,
        interactionId,
      });
      return NextResponse.json(
        { ok: false, error: transcriptError.message },
        { status: 500 }
      );
    }

    if (!transcriptData || !Array.isArray(transcriptData)) {
      return NextResponse.json({
        ok: true,
        interactionId,
        chunks: [],
        fullTranscript: '',
        chunkCount: 0,
      });
    }

    // Filter out empty transcripts and combine
    const chunks: TranscriptChunk[] = transcriptData
      .filter((event: any) => event.text && event.text.trim().length > 0)
      .map((event: any) => ({
        seq: event.seq,
        text: event.text.trim(),
        ts: event.ts,
        created_at: event.created_at,
      }));

    const fullTranscript = chunks.map((chunk) => chunk.text).join(' ');

    console.info('[get-transcript] ✅ Fetched transcript', {
      interactionId,
      chunkCount: chunks.length,
      totalLength: fullTranscript.length,
    });

    return NextResponse.json({
      ok: true,
      interactionId,
      chunks,
      fullTranscript,
      chunkCount: chunks.length,
    });
  } catch (error: any) {
    console.error('[get-transcript] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


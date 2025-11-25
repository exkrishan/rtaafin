/**
 * Ingest Transcript API - Receives transcript chunks from the orchestrator.
 * Validates, logs, stores chunks, detects intent, and fetches KB articles.
 */

import { NextResponse } from 'next/server';
import { ingestTranscriptCore } from '@/lib/ingest-transcript-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface IngestRequest {
  callId: string;
  seq: number;
  ts: string;
  text: string;
}

export async function POST(req: Request) {
  try {
    const body: IngestRequest = await req.json();

    // Validate required fields
    if (!body.callId || body.seq === undefined || !body.ts || !body.text) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: callId, seq, ts, text' },
        { status: 400 }
      );
    }

    // Extract tenantId from header or default to 'default'
    const tenantId = req.headers.get('x-tenant-id') || 'default';

    console.info('[ingest-transcript] Received HTTP request', {
      callId: body.callId,
      seq: body.seq,
      ts: body.ts,
      textLength: body.text.length,
      textPreview: body.text.substring(0, 50),
      tenantId,
      timestamp: new Date().toISOString(),
    });

    // Call the core function
    const result = await ingestTranscriptCore({
      callId: body.callId,
      seq: body.seq,
      ts: body.ts,
      text: body.text,
      tenantId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Unknown error' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      intent: result.intent,
      confidence: result.confidence,
      articles: result.articles,
    });
  } catch (err: any) {
    console.error('[ingest-transcript] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}

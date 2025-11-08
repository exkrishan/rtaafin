/**
 * Transcript Consumer Status API
 * 
 * GET /api/transcripts/status
 * Get status of the transcript consumer
 */

import { NextResponse } from 'next/server';
import { getTranscriptConsumerStatus } from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const status = getTranscriptConsumerStatus();
    return NextResponse.json({
      ok: true,
      ...status,
    });
  } catch (error: any) {
    console.error('[transcripts/status] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}

 * Transcript Consumer Status API
 * 
 * GET /api/transcripts/status
 * Get status of the transcript consumer
 */

import { NextResponse } from 'next/server';
import { getTranscriptConsumerStatus } from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const status = getTranscriptConsumerStatus();
    return NextResponse.json({
      ok: true,
      ...status,
    });
  } catch (error: any) {
    console.error('[transcripts/status] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


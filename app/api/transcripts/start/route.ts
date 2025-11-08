/**
 * Start Transcript Consumer API
 * 
 * POST /api/transcripts/start
 * Manually start the transcript consumer (if not auto-started)
 */

import { NextResponse } from 'next/server';
import { startTranscriptConsumer, getTranscriptConsumerStatus } from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    console.info('[transcripts/start] Starting transcript consumer...');
    
    await startTranscriptConsumer();
    
    const status = getTranscriptConsumerStatus();
    
    return NextResponse.json({
      ok: true,
      message: 'Transcript consumer started',
      status,
    });
  } catch (error: any) {
    console.error('[transcripts/start] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}

 * Start Transcript Consumer API
 * 
 * POST /api/transcripts/start
 * Manually start the transcript consumer (if not auto-started)
 */

import { NextResponse } from 'next/server';
import { startTranscriptConsumer, getTranscriptConsumerStatus } from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    console.info('[transcripts/start] Starting transcript consumer...');
    
    await startTranscriptConsumer();
    
    const status = getTranscriptConsumerStatus();
    
    return NextResponse.json({
      ok: true,
      message: 'Transcript consumer started',
      status,
    });
  } catch (error: any) {
    console.error('[transcripts/start] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


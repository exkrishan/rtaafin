/**
 * Get Latest Transcripts API
 * GET /api/transcripts/latest?callId=...
 * 
 * Returns the latest transcripts for a callId from the database.
 * Used as a polling fallback when SSE connection fails.
 */

import { NextResponse } from 'next/server';
import Redis from 'ioredis';

// Initialize Redis client
const redis = new Redis(process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379');

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

    // POC: Fetch all transcripts from Redis List
    const listKey = `transcripts:${callId}`;
    const rawTranscripts = await redis.lrange(listKey, 0, -1);

    // Parse and map transcripts
    const transcripts: TranscriptUtterance[] = rawTranscripts.map((item, index) => {
      try {
        const t = JSON.parse(item);
        return {
          id: `${callId}-${t.seq}`,
          text: t.text,
          speaker: index % 2 === 0 ? 'customer' : 'agent', // Alternate speaker for now
          timestamp: new Date(t.timestamp_ms).toISOString(),
          seq: t.seq,
          confidence: t.confidence
        };
      } catch (e) {
        console.error('[transcripts/latest] Error parsing transcript item:', e);
        return null;
      }
    }).filter(Boolean) as TranscriptUtterance[];

    console.info('[transcripts/latest] ✅ Fetched transcripts from Redis', {
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


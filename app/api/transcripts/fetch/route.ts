import { NextResponse } from 'next/server';
import { createPubSubAdapterFromEnv } from '@/lib/pubsub';

// This endpoint is for testing - fetches recent messages from Redis
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const interactionId = searchParams.get('interactionId');

    if (!interactionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing interactionId parameter' },
        { status: 400 }
      );
    }

    // For now, return empty - in production, you'd query Redis Streams
    // This is just a placeholder for the test UI
    return NextResponse.json({
      ok: true,
      transcripts: [],
      message: 'Transcript fetching from Redis Streams not yet implemented. Use SSE subscription instead.',
    });
  } catch (error: any) {
    console.error('[API] Failed to fetch transcripts:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}

import { createPubSubAdapterFromEnv } from '@/lib/pubsub';

// This endpoint is for testing - fetches recent messages from Redis
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const interactionId = searchParams.get('interactionId');

    if (!interactionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing interactionId parameter' },
        { status: 400 }
      );
    }

    // For now, return empty - in production, you'd query Redis Streams
    // This is just a placeholder for the test UI
    return NextResponse.json({
      ok: true,
      transcripts: [],
      message: 'Transcript fetching from Redis Streams not yet implemented. Use SSE subscription instead.',
    });
  } catch (error: any) {
    console.error('[API] Failed to fetch transcripts:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}


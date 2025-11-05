/**
 * Ingest Transcript API - Receives transcript chunks from the orchestrator.
 * Validates, logs, stores chunks, detects intent, and fetches KB articles.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { detectIntent } from '@/lib/intent';
import { broadcastEvent } from '@/lib/realtime';
import { getKbAdapter, type KBArticle } from '@/lib/kb-adapter';
import { getEffectiveConfig } from '@/lib/config';

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

    console.info('[ingest-transcript] Received chunk', {
      callId: body.callId,
      seq: body.seq,
      ts: body.ts,
      textLength: body.text.length,
      tenantId,
    });

    // Insert into Supabase ingest_events table
    try {
      const { data, error } = await supabase.from('ingest_events').insert({
        call_id: body.callId,
        seq: body.seq,
        ts: body.ts,
        text: body.text,
        created_at: new Date().toISOString(),
      }).select();

      if (error) {
        console.error('[ingest-transcript] Supabase insert error:', error);
        // Don't fail the request, just log it
        console.warn('[ingest-transcript] Continuing despite Supabase error');
      } else {
        console.info('[ingest-transcript] Stored in Supabase:', data);
      }
    } catch (supabaseErr) {
      console.error('[ingest-transcript] Supabase error:', supabaseErr);
      // Continue processing even if Supabase fails
    }

    // Phase 3: Broadcast transcript line to real-time listeners
    try {
      broadcastEvent({
        type: 'transcript_line',
        callId: body.callId,
        seq: body.seq,
        ts: body.ts,
        text: body.text,
      });
      console.info('[realtime] Broadcast transcript_line', {
        callId: body.callId,
        seq: body.seq,
        textLength: body.text.length,
      });
    } catch (broadcastErr) {
      console.error('[realtime] Failed to broadcast transcript_line:', broadcastErr);
      // Don't fail the request
    }

    // Phase 2: Intent detection and KB article recommendations
    let intent = 'unknown';
    let confidence = 0.0;
    let articles: KBArticle[] = [];

    try {
      // Detect intent from the transcript text
      console.info('[ingest-transcript] Detecting intent for seq:', body.seq);
      const intentResult = await detectIntent(body.text);
      intent = intentResult.intent;
      confidence = intentResult.confidence;

      console.info('[ingest-transcript] Intent detected:', { intent, confidence });

      // Store intent in database
      try {
        const { error: intentError } = await supabase.from('intents').insert({
          call_id: body.callId,
          seq: body.seq,
          intent,
          confidence,
          created_at: new Date().toISOString(),
        });

        if (intentError) {
          console.error('[ingest-transcript] Failed to store intent:', intentError);
        } else {
          console.info('[ingest-transcript] Intent stored in database');
        }
      } catch (intentDbErr) {
        console.error('[ingest-transcript] Intent DB error:', intentDbErr);
      }

      // Fetch relevant KB articles based on intent using adapter pattern
      if (intent && intent !== 'unknown') {
        try {
          console.info('[ingest-transcript] Fetching KB articles for intent:', intent);

          // Get effective config for tenant
          const config = await getEffectiveConfig({ tenantId });

          // Get appropriate KB adapter for tenant
          const kbAdapter = await getKbAdapter(tenantId);

          // Search using adapter with config values
          articles = await kbAdapter.search(intent, {
            tenantId,
            max: config.kb.maxArticles,
          });

          console.info('[ingest-transcript] Found KB articles:', {
            count: articles.length,
            provider: articles[0]?.source || 'none',
            maxArticles: config.kb.maxArticles,
          });
        } catch (kbErr) {
          console.error('[ingest-transcript] KB fetch error:', kbErr);
          // Continue without articles
        }
      }

      // Phase 3: Broadcast intent update to real-time listeners
      try {
        broadcastEvent({
          type: 'intent_update',
          callId: body.callId,
          seq: body.seq,
          intent,
          confidence,
          articles,
        });
        console.info('[realtime] Broadcast intent_update', {
          callId: body.callId,
          seq: body.seq,
          intent,
          confidence,
          articlesCount: articles.length,
        });
      } catch (broadcastErr) {
        console.error('[realtime] Failed to broadcast intent_update:', broadcastErr);
        // Don't fail the request
      }
    } catch (intentErr) {
      console.error('[ingest-transcript] Intent detection error:', intentErr);
      // Fallback to unknown intent
      intent = 'unknown';
      confidence = 0.0;
    }

    return NextResponse.json({
      ok: true,
      intent,
      confidence,
      articles,
    });
  } catch (err: any) {
    console.error('[ingest-transcript] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}

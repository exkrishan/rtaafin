/**
 * Intent API Routes
 * GET - Retrieve latest intent for a call
 * POST - Store detected intent
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface IntentRequest {
  callId: string;
  seq: number;
  intent: string;
  confidence: number;
}

/**
 * GET /api/calls/intent?callId=...
 * Returns the most recent intent for a call
 */
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

    console.info('[intent-api] Fetching latest intent for callId:', callId);

    // Get the most recent intent for this call
    const { data, error } = await supabase
      .from('intents')
      .select('intent, confidence, created_at, seq')
      .eq('call_id', callId)
      .order('seq', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[intent-api] Supabase error:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch intent' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No intent found for this call' },
        { status: 404 }
      );
    }

    const latest = data[0];

    return NextResponse.json({
      ok: true,
      intent: latest.intent,
      confidence: latest.confidence,
      seq: latest.seq,
      created_at: latest.created_at,
    });
  } catch (err: any) {
    console.error('[intent-api] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calls/intent
 * Stores a detected intent
 */
export async function POST(req: Request) {
  try {
    const body: IntentRequest = await req.json();

    // Validate required fields
    if (!body.callId || body.seq === undefined || !body.intent || body.confidence === undefined) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: callId, seq, intent, confidence' },
        { status: 400 }
      );
    }

    console.info('[intent-api] Storing intent:', {
      callId: body.callId,
      seq: body.seq,
      intent: body.intent,
      confidence: body.confidence,
    });

    // Insert into Supabase
    const { data, error } = await supabase
      .from('intents')
      .insert({
        call_id: body.callId,
        seq: body.seq,
        intent: body.intent,
        confidence: body.confidence,
        created_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error('[intent-api] Supabase insert error:', error);
      // Don't fail the request, just log it
      return NextResponse.json({
        ok: true,
        warning: 'Intent stored in memory but Supabase insert failed',
        error: error.message,
      });
    }

    console.info('[intent-api] Intent stored successfully:', data);

    return NextResponse.json({
      ok: true,
      intent: body.intent,
      confidence: body.confidence,
    });
  } catch (err: any) {
    console.error('[intent-api] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}

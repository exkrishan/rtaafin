/**
 * Debug Intent API - Quick diagnostic endpoint to test LLM connectivity
 * GET /api/debug/intent?text=...
 */

import { NextResponse } from 'next/server';
import { detectIntent } from '@/lib/intent';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const text = url.searchParams.get('text');

    if (!text) {
      return NextResponse.json(
        { ok: false, error: 'Missing text parameter' },
        { status: 400 }
      );
    }

    console.info('[debug-intent] Testing intent detection for:', text.substring(0, 50) + '...');

    const result = await detectIntent(text);

    console.info('[debug-intent] Result:', result);

    return NextResponse.json({
      ok: true,
      intent: result.intent,
      confidence: result.confidence,
      llm_configured: !!process.env.LLM_API_KEY,
    });
  } catch (err: any) {
    console.error('[debug-intent] Error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calls/summary
 *
 * curl -X POST http://localhost:3000/api/calls/summary \
 *   -H "Content-Type: application/json" \
 *   -d '{"callId":"test-call-123","tenantId":"default"}'
 */

import { NextResponse } from 'next/server';
import { generateCallSummary } from '@/lib/summary';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const callId = String(body?.callId || '').trim();
    const tenantId =
      typeof body?.tenantId === 'string' ? body.tenantId.trim() || undefined : undefined;

    if (!callId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'callId is required',
        },
        { status: 400 }
      );
    }

    const result = await generateCallSummary(callId, tenantId);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          callId,
          tenantId: tenantId ?? null,
          error: result.error ?? 'Failed to generate call summary',
          summary: result.summary,
          usedFallback: result.usedFallback,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      callId,
      tenantId: tenantId ?? null,
      summary: result.summary,
      dispositions: result.mappedDispositions,
      usedFallback: result.usedFallback,
    });
  } catch (err: any) {
    console.error('[api][calls][summary] Unexpected error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? 'Unexpected error generating summary',
      },
      { status: 500 }
    );
  }
}

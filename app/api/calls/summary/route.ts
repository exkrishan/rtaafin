/**
 * POST /api/calls/summary
 *
 * curl -X POST http://localhost:3000/api/calls/summary \
 *   -H "Content-Type: application/json" \
 *   -d '{"callId":"test-call-123","tenantId":"default"}'
 */

import { NextResponse } from 'next/server';
import { generateCallSummary } from '@/lib/summary';
import { emitTelemetry } from '@/lib/telemetry';

async function safeTelemetry(event: string, payload: Record<string, any>): Promise<void> {
  try {
    await emitTelemetry(event, payload);
  } catch (err) {
    console.error(`[api][calls][summary] Telemetry failure for ${event}`, err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const callId = String(body?.callId || '').trim();
    const tenantId =
      typeof body?.tenantId === 'string' ? body.tenantId.trim() || undefined : undefined;
    const source = typeof body?.source === 'string' ? body.source : undefined;

    if (!callId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'callId is required',
        },
        { status: 400 }
      );
    }

    if (source === 'auto-disposition-modal') {
      await safeTelemetry('disposition_retry', {
        call_id: callId,
        tenant_id: tenantId,
        source,
      });
    }

    const result = await generateCallSummary(callId, tenantId);

    if (!result.ok) {
      if (source === 'auto-disposition-modal') {
        await safeTelemetry('disposition_retry_result', {
          call_id: callId,
          tenant_id: tenantId,
          source,
          success: false,
          error: result.error ?? 'summary_failed',
        });
      }

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

    if (source === 'auto-disposition-modal') {
      await safeTelemetry('disposition_retry_result', {
        call_id: callId,
        tenant_id: tenantId,
        source,
        success: true,
        usedFallback: result.usedFallback,
      });
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

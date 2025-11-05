/**
 * POST /api/calls/auto_notes
 *
 * Upsert auto-generated call notes and dispositions
 *
 * Body:
 * {
 *   "callId": string,
 *   "tenantId": string (optional),
 *   "author": string,
 *   "notes": string,
 *   "dispositions": [{ code: string, title: string, score: number }],
 *   "confidence": number,
 *   "raw_llm_output": string | null
 * }
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { emitTelemetry } from '@/lib/telemetry';

const RAW_OUTPUT_LIMIT = 16000;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const callId = String(body?.callId || '').trim();
    const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() || 'default' : 'default';
    const author = String(body?.author || 'agent-ui').trim();
    const notes = String(body?.notes || '').trim();
    const dispositions = Array.isArray(body?.dispositions) ? body.dispositions : [];
    const subDisposition = typeof body?.subDisposition === 'string' ? body.subDisposition.trim() : null;
    const confidence = typeof body?.confidence === 'number' ? Math.max(0, Math.min(1, body.confidence)) : 0;
    const rawLlmOutput = body?.raw_llm_output ? truncate(String(body.raw_llm_output), RAW_OUTPUT_LIMIT) : null;

    if (!callId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'callId is required',
        },
        { status: 400 }
      );
    }

    // Validate dispositions array
    const validatedDispositions = dispositions
      .filter((d: any) => d && typeof d.code === 'string' && typeof d.title === 'string')
      .map((d: any) => ({
        code: String(d.code).trim(),
        title: String(d.title).trim(),
        score: typeof d.score === 'number' ? Math.max(0, Math.min(1, d.score)) : 0,
      }));

    // Get primary disposition code for telemetry
    const primaryDispositionCode = validatedDispositions.length > 0 ? validatedDispositions[0].code : null;

    // Prepare payload for upsert
    // Note: The schema may vary. We'll try to upsert with the fields we have.
    // If tenant_id and call_id have a unique constraint, use that; otherwise use call_id only.
    const payload: any = {
      call_id: callId,
      tenant_id: tenantId,
      author,
      notes,
      dispositions: validatedDispositions,
      sub_disposition: subDisposition || null,
      confidence,
      raw_llm_output: rawLlmOutput,
      updated_at: new Date().toISOString(),
    };

    // Attempt upsert with ON CONFLICT on (tenant_id, call_id) or just call_id
    // Supabase will handle the conflict resolution based on the actual constraint
    let upsertResult;
    try {
      // Try with tenant_id + call_id conflict first
      const { data, error } = await supabase
        .from('auto_notes')
        .upsert(payload, {
          onConflict: 'call_id',
          // If unique constraint is on (tenant_id, call_id), we need to handle it differently
          // For now, use call_id as the conflict target
        })
        .select('id, call_id, updated_at')
        .single();

      if (error) {
        // If that fails, try without specifying conflict (Supabase will use primary key or unique constraint)
        console.warn('[api][calls][auto_notes] First upsert attempt failed, retrying', error);
        const { data: retryData, error: retryError } = await supabase
          .from('auto_notes')
          .upsert(payload)
          .select('id, call_id, updated_at')
          .single();

        if (retryError) {
          throw retryError;
        }
        upsertResult = retryData;
      } else {
        upsertResult = data;
      }
    } catch (dbError: any) {
      console.error('[api][calls][auto_notes] Database error', dbError);
      return NextResponse.json(
        {
          ok: false,
          error: dbError?.message || 'Failed to save auto notes',
        },
        { status: 500 }
      );
    }

    // Emit telemetry
    try {
      await emitTelemetry('disposition_saved', {
        call_id: callId,
        tenant_id: tenantId,
        disposition_code: primaryDispositionCode,
        method: 'ui',
        confidence,
        dispositions_count: validatedDispositions.length,
      });
    } catch (telemetryError) {
      // Telemetry failure shouldn't fail the request
      console.warn('[api][calls][auto_notes] Telemetry failed', telemetryError);
    }

    return NextResponse.json({
      ok: true,
      id: upsertResult?.id,
      callId: upsertResult?.call_id || callId,
      updated_at: upsertResult?.updated_at || new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[api][calls][auto_notes] Unexpected error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Unexpected error saving auto notes',
      },
      { status: 500 }
    );
  }
}


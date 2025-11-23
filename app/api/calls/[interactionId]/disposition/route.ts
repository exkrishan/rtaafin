/**
 * Save Disposition API
 * Saves selected disposition and sub-disposition for a call
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface SaveDispositionRequest {
  disposition: string;
  subDisposition?: string;
  notes?: string;
  agentId?: string;
}

export async function POST(
  req: Request,
  { params }: { params: { interactionId: string } }
) {
  try {
    const { interactionId } = params;
    const body: SaveDispositionRequest = await req.json();

    if (!interactionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing interactionId' },
        { status: 400 }
      );
    }

    if (!body.disposition) {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: disposition' },
        { status: 400 }
      );
    }

    console.info('[save-disposition] Saving disposition', {
      interactionId,
      disposition: body.disposition,
      subDisposition: body.subDisposition,
      agentId: body.agentId,
    });

    // Save disposition to database
    // Note: Adjust table name and schema based on your database structure
    try {
      const { data, error } = await (supabase as any)
        .from('call_dispositions')
        .upsert({
          call_id: interactionId,
          interaction_id: interactionId,
          disposition: body.disposition,
          sub_disposition: body.subDisposition || null,
          notes: body.notes || null,
          agent_id: body.agentId || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'call_id',
        })
        .select();

      if (error) {
        console.error('[save-disposition] Failed to save disposition', {
          error: error.message,
          interactionId,
        });
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      console.info('[save-disposition] ✅ Disposition saved', {
        interactionId,
        disposition: body.disposition,
        data,
      });

      return NextResponse.json({
        ok: true,
        interactionId,
        disposition: body.disposition,
        subDisposition: body.subDisposition,
        saved: true,
      });
    } catch (error: any) {
      console.error('[save-disposition] Error saving disposition', {
        error: error.message,
        interactionId,
      });
      return NextResponse.json(
        { ok: false, error: error.message || 'Internal server error' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[save-disposition] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


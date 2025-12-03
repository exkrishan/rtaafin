/**
 * Save Disposition API
 * POST /api/calls/[callId]/disposition
 * 
 * Saves the selected disposition, sub-disposition, and notes for a call.
 * Stores in call_dispositions table in Supabase.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SaveDispositionRequest {
  disposition: string;
  subDisposition?: string;
  notes?: string;
  agentId?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  try {
    // Next.js 15+: params is now async and must be awaited
    const { callId } = await params;
    
    if (!callId) {
      return NextResponse.json(
        { ok: false, error: 'Missing callId' },
        { status: 400 }
      );
    }

    // Parse request body
    let body: SaveDispositionRequest;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    if (!body.disposition) {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: disposition' },
        { status: 400 }
      );
    }

    console.info('[disposition] Saving disposition', {
      callId,
      disposition: body.disposition,
      subDisposition: body.subDisposition,
      agentId: body.agentId,
      notesLength: body.notes?.length || 0,
    });

    // Prepare payload for database
    const now = new Date().toISOString();
    const payload: any = {
      call_id: callId,
      interaction_id: callId, // Use callId as interactionId for compatibility
      disposition: body.disposition,
      sub_disposition: body.subDisposition || null,
      notes: body.notes || null,
      agent_id: body.agentId || null,
      created_at: now,
      updated_at: now,
    };

    // Save to call_dispositions table
    // Use upsert with onConflict to handle updates
    try {
      const { data, error } = await (supabase as any)
        .from('call_dispositions')
        .upsert(payload, {
          onConflict: 'call_id', // Update if call_id already exists
        })
        .select('call_id, disposition, sub_disposition, created_at, updated_at')
        .single();

      if (error) {
        console.error('[disposition] Failed to save disposition', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          callId,
        });

        // If table doesn't exist, provide helpful error message
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return NextResponse.json(
            {
              ok: false,
              error: 'call_dispositions table does not exist. Please run migration to create it.',
              hint: 'CREATE TABLE call_dispositions (call_id TEXT PRIMARY KEY, interaction_id TEXT, disposition TEXT, sub_disposition TEXT, notes TEXT, agent_id TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ);',
            },
            { status: 500 }
          );
        }

        return NextResponse.json(
          { ok: false, error: error.message || 'Failed to save disposition' },
          { status: 500 }
        );
      }

      console.info('[disposition] ✅ Disposition saved successfully', {
        callId,
        disposition: body.disposition,
        subDisposition: body.subDisposition,
        savedAt: data?.updated_at || now,
      });

      return NextResponse.json({
        ok: true,
        callId,
        disposition: body.disposition,
        subDisposition: body.subDisposition,
        notes: body.notes,
        saved: true,
        savedAt: data?.updated_at || now,
      });
    } catch (dbError: any) {
      console.error('[disposition] Database error', {
        error: dbError.message,
        stack: dbError.stack,
        callId,
      });

      return NextResponse.json(
        { ok: false, error: dbError.message || 'Database error' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[disposition] Unexpected error:', {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


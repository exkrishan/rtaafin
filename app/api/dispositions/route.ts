/**
 * GET /api/dispositions
 *
 * Fetch all dispositions from disposition_taxonomy table
 *
 * Query params:
 * - tenantId: optional tenant filter (if taxonomy supports multi-tenant)
 *
 * Returns:
 * {
 *   ok: true,
 *   dispositions: [{ code: string, title: string, tags: string[] }]
 * }
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId');

    // Fetch all dispositions from taxonomy table
    const { data, error } = await supabase
      .from('disposition_taxonomy')
      .select('code, title, tags')
      .order('title', { ascending: true });

    if (error) {
      console.error('[api][dispositions] Database error:', error);
      return NextResponse.json(
        {
          ok: false,
          error: error.message || 'Failed to fetch dispositions',
        },
        { status: 500 }
      );
    }

    // Transform data to ensure consistent format
    const dispositions = (data || []).map((item) => ({
      code: String(item.code || '').trim(),
      title: String(item.title || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t).trim()) : [],
    }));

    return NextResponse.json({
      ok: true,
      dispositions,
      count: dispositions.length,
    });
  } catch (err: any) {
    console.error('[api][dispositions] Unexpected error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

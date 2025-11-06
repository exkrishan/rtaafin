/**
 * GET /api/sub-dispositions
 *
 * Fetch sub-dispositions for a given parent disposition from dispositions_master table
 *
 * Query params:
 * - dispositionCode: filter by parent disposition code (required for hierarchical lookup)
 * - dispositionId: filter by parent disposition ID (alternative to code)
 *
 * Returns:
 * {
 *   ok: true,
 *   subDispositions: [{ id: number, code: string, label: string, category: string }]
 * }
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dispositionCode = url.searchParams.get('dispositionCode');
    const dispositionId = url.searchParams.get('dispositionId');

    let parentId: number | null = null;

    // If dispositionCode is provided, find the parent disposition ID
    if (dispositionCode) {
      const { data: parentData, error: parentError } = await supabase
        .from('dispositions_master')
        .select('id')
        .eq('code', dispositionCode.trim())
        .is('parent_disposition_id', null) // Only get parent dispositions
        .single();

      if (parentError) {
        console.warn('[api][sub-dispositions] Parent lookup error:', parentError);
        // If parent not found, return empty array
        return NextResponse.json({
          ok: true,
          subDispositions: [],
          count: 0,
        });
      }

      if (parentData) {
        parentId = Number(parentData.id);
      }
    } else if (dispositionId) {
      parentId = Number(dispositionId);
    } else {
      // No filter provided - return empty array
      return NextResponse.json({
        ok: true,
        subDispositions: [],
        count: 0,
      });
    }

    if (!parentId) {
      return NextResponse.json({
        ok: true,
        subDispositions: [],
        count: 0,
      });
    }

    // Fetch all sub-dispositions (children) for this parent
    const { data, error } = await supabase
      .from('dispositions_master')
      .select('id, code, label, category')
      .eq('parent_disposition_id', parentId)
      .order('id', { ascending: true });

    if (error) {
      console.error('[api][sub-dispositions] Database error:', error);
      return NextResponse.json(
        {
          ok: false,
          error: error.message || 'Failed to fetch sub-dispositions',
        },
        { status: 500 }
      );
    }

    // Transform data to ensure consistent format
    const subDispositions = (data || []).map((item) => ({
      id: Number(item.id) || null,
      code: String(item.code || '').trim(),
      title: String(item.label || '').trim(), // For backward compatibility
      label: String(item.label || '').trim(),
      category: String(item.category || '').trim(),
    }));

    return NextResponse.json({
      ok: true,
      subDispositions,
      count: subDispositions.length,
    });
  } catch (err: any) {
    console.error('[api][sub-dispositions] Unexpected error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

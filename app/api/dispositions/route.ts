/**
 * GET /api/dispositions
 *
 * Fetch all parent dispositions from disposition_taxonomy
 * Supports both old schema (code, title, tags) and new hierarchical schema
 *
 * Query params:
 * - tenantId: optional tenant filter (if taxonomy supports multi-tenant)
 *
 * Returns:
 * {
 *   ok: true,
 *   dispositions: [{ 
 *     id: number, 
 *     code: string, 
 *     title: string, 
 *     category: string,
 *     sub_dispositions: [{ id: number, code: string, label: string }] 
 *   }]
 * }
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  try {
    // Safely parse URL
    let url: URL;
    try {
      url = new URL(req.url);
    } catch (urlErr: any) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request URL' },
        { status: 400 }
      );
    }
    
    const tenantId = url.searchParams.get('tenantId');

    // Try old schema first (code, title, tags) - backward compatibility
    let data: any = null;
    let useOldSchema = false;

    // Try old schema query - wrap in try-catch to handle fetch exceptions
    let oldResult: any = null;
    try {
      oldResult = await (supabase as any)
        .from('disposition_taxonomy')
        .select('code, title, tags')
        .order('title', { ascending: true });
    } catch (fetchErr: any) {
      // Fetch exception - Supabase client threw an error
      console.warn('[api][dispositions] Old schema fetch exception:', fetchErr.message);
      oldResult = { error: { message: fetchErr.message }, data: null };
    }
    
    if (oldResult && !oldResult.error && oldResult.data && oldResult.data.length > 0) {
      // Old schema worked
      useOldSchema = true;
      data = oldResult.data;
    } else {
      // Old schema failed - try new schema
      if (oldResult?.error) {
        console.warn('[api][dispositions] Old schema error:', oldResult.error.message);
      }
      
      let newResult: any = null;
      try {
          newResult = await (supabase as any)
            .from('disposition_taxonomy')
            .select('parent_id, parent_code, parent_label, parent_category, sub_dispositions')
            .order('parent_id', { ascending: true });
      } catch (fetchErr: any) {
        console.warn('[api][dispositions] New schema fetch exception:', fetchErr.message);
        newResult = { error: { message: fetchErr.message }, data: null };
      }
      
      if (newResult && !newResult.error && newResult.data && newResult.data.length > 0) {
        // New schema worked
        data = newResult.data;
      } else {
        // Both failed - try dispositions_master table
        if (newResult?.error) {
          console.warn('[api][dispositions] New schema also failed:', newResult.error.message);
        }
        
        let masterResult: any = null;
        try {
            masterResult = await (supabase as any)
              .from('dispositions_master')
              .select('id, code, label, category')
              .is('parent_disposition_id', null)
              .order('id', { ascending: true });
        } catch (fetchErr: any) {
          console.error('[api][dispositions] Master table fetch exception:', fetchErr.message);
          return NextResponse.json(
            {
              ok: false,
              error: `All queries failed. Last error: ${fetchErr.message}`,
            },
            { status: 500 }
          );
        }
        
        if (!masterResult || masterResult.error) {
          return NextResponse.json(
            {
              ok: false,
              error: `Failed to fetch dispositions: ${masterResult?.error?.message || 'Unknown error'}`,
            },
            { status: 500 }
          );
        }

        // Transform dispositions_master data
        const dispositions = (masterResult.data || []).map((item: any) => ({
          id: Number(item.id) || null,
          code: String(item.code || '').trim(),
          title: String(item.label || '').trim(),
          label: String(item.label || '').trim(),
          category: String(item.category || '').trim(),
          sub_dispositions: [],
        }));
        
        return NextResponse.json({
          ok: true,
          dispositions,
          count: dispositions.length,
          warning: 'Using dispositions_master table (disposition_taxonomy not available)',
        });
      }
    }

    // Transform data based on schema version
    if (!data || data.length === 0) {
      return NextResponse.json({
        ok: true,
        dispositions: [],
        count: 0,
        warning: 'No dispositions found',
      });
    }

    let dispositions: any[];
    
    if (useOldSchema) {
      // Old schema: code, title, tags
      dispositions = data.map((item: any) => ({
        id: null,
        code: String(item.code || '').trim(),
        title: String(item.title || '').trim(),
        label: String(item.title || '').trim(),
        category: '',
        tags: Array.isArray(item.tags) ? item.tags.map((t: any) => String(t).trim()) : [],
        sub_dispositions: [],
      }));
    } else {
      // New schema: parent_id, parent_code, parent_label, etc.
      dispositions = data.map((item: any) => ({
        id: Number(item.parent_id) || null,
        code: String(item.parent_code || '').trim(),
        title: String(item.parent_label || '').trim(),
        label: String(item.parent_label || '').trim(),
        category: String(item.parent_category || '').trim(),
        sub_dispositions: Array.isArray(item.sub_dispositions) 
          ? item.sub_dispositions.map((sub: any) => ({
              id: Number(sub.id) || null,
              code: String(sub.code || '').trim(),
              label: String(sub.label || '').trim(),
            }))
          : [],
      }));
    }

    return NextResponse.json({
      ok: true,
      dispositions,
      count: dispositions.length,
    });
  } catch (err: any) {
    console.error('[api][dispositions] Unexpected error:', err);
    console.error('[api][dispositions] Error stack:', err?.stack);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

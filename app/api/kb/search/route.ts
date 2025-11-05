/**
 * GET /api/kb/search
 *
 * Knowledge base search endpoint
 * Proxies to kb-adapter for multi-tenant KB provider support
 *
 * Query params:
 * - q: Search query string (required, can be empty for default suggestions)
 * - tenantId: Tenant identifier (optional, defaults to 'default')
 * - limit: Max results (optional, defaults to 10)
 */

import { NextResponse } from 'next/server';
import { getKbAdapter } from '@/lib/kb-adapter';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('q') || '';
    const tenantId = url.searchParams.get('tenantId') || 'default';
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid limit parameter. Must be between 1 and 100.',
        },
        { status: 400 }
      );
    }

    // Get adapter for tenant
    const adapter = await getKbAdapter(tenantId);

    // Search KB
    const articles = await adapter.search(query, {
      max: limit,
      tenantId,
    });

    // Normalize results to minimal format expected by client
    const results = articles.map((article) => ({
      id: article.id,
      code: article.id, // Use id as code if code not available
      title: article.title,
      snippet: article.snippet || '',
      url: article.url,
      tags: article.tags || [],
      score: article.confidence,
    }));

    return NextResponse.json({
      ok: true,
      results,
    });
  } catch (err: any) {
    console.error('[api][kb][search] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Failed to search knowledge base',
      },
      { status: 500 }
    );
  }
}

/**
 * Unified KB Search API
 * Uses adapter pattern to support multiple KB providers (DB, Knowmax, Zendesk)
 * Routes to appropriate provider based on tenant configuration
 */

import { NextResponse } from 'next/server';
import { getKbAdapter } from '@/lib/kb-adapter';
import { getEffectiveConfig } from '@/lib/config';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = (url.searchParams.get('query') || '').trim();

    // Read tenantId from query param, header, or default
    const tenantId =
      url.searchParams.get('tenantId') ||
      req.headers.get('x-tenant-id') ||
      'default';

    // Get effective config for tenant
    const config = await getEffectiveConfig({ tenantId });

    // Use max from query param or config default
    const maxResults = parseInt(
      url.searchParams.get('max') || String(config.kb.maxArticles),
      10
    );

    console.info('[api][kb-search] Request received', {
      tenant: tenantId,
      query: query || '(empty)',
      max: maxResults,
      configMax: config.kb.maxArticles,
    });

    // Get appropriate adapter for tenant
    const adapter = await getKbAdapter(tenantId);

    // If no query, return empty results (or implement default behavior)
    if (!query) {
      console.info('[api][kb-search] No query provided, returning empty results');
      return NextResponse.json({
        ok: true,
        tenantId,
        results: [],
        message: 'No query provided',
      });
    }

    // Search using adapter with config values
    const articles = await adapter.search(query, {
      tenantId,
      max: maxResults,
    });

    console.info('[api][kb-search] Search completed', {
      tenant: tenantId,
      found: articles.length,
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      query,
      results: articles,
    });
  } catch (err: any) {
    console.error('[api][kb-search] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}




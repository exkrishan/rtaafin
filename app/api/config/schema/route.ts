/**
 * Configuration Schema API
 * Returns schema metadata for UI rendering
 */

import { NextResponse } from 'next/server';
import { getConfigSchema } from '@/lib/config';

/**
 * GET /api/config/schema
 * Get configuration schema for UI
 */
export async function GET(req: Request) {
  try {
    const schema = getConfigSchema();

    return NextResponse.json({
      ok: true,
      schema,
    });
  } catch (err: any) {
    console.error('[config-api] schema error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

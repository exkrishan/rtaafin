/**
 * Effective Configuration API
 * Returns merged configuration based on hierarchy
 */

import { NextResponse } from 'next/server';
import { getEffectiveConfig } from '@/lib/config';

/**
 * GET /api/config/effective
 * Get effective merged configuration
 *
 * Query params:
 * - tenantId: tenant identifier
 * - campaignId: campaign identifier (optional)
 * - agentId: agent identifier (optional)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId') || undefined;
    const campaignId = url.searchParams.get('campaignId') || undefined;
    const agentId = url.searchParams.get('agentId') || undefined;

    const config = await getEffectiveConfig({
      tenantId,
      campaignId,
      agentId,
    });

    return NextResponse.json({
      ok: true,
      config,
      context: {
        tenantId,
        campaignId,
        agentId,
      },
    });
  } catch (err: any) {
    console.error('[config-api] effective error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

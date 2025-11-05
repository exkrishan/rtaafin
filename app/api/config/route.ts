/**
 * Configuration API
 * Endpoints for managing multi-scope configuration
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  getConfigByScope,
  upsertConfig,
  getEffectiveConfig,
  getConfigSchema,
  type ConfigScope,
  type Config,
} from '@/lib/config';
import { emit } from '@/lib/telemetry';

/**
 * Validate admin key from request headers
 */
function validateAdminKey(req: Request): boolean {
  const adminKey = req.headers.get('x-admin-key');
  const expectedKey = process.env.ADMIN_KEY;

  if (!expectedKey) {
    console.warn('[config-api] ADMIN_KEY not set in environment');
    return false;
  }

  return adminKey === expectedKey;
}

/**
 * GET /api/config
 * List all configs or get a specific config by scope
 *
 * Query params:
 * - scope: global | tenant | campaign | agent
 * - scopeId: identifier for the scope (not needed for global)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') as ConfigScope | null;
    const scopeId = url.searchParams.get('scopeId');

    // If scope is provided, fetch single config
    if (scope) {
      const config = await getConfigByScope(scope, scopeId || undefined);

      if (!config) {
        return NextResponse.json(
          { ok: false, error: 'Config not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        config,
      });
    }

    // Otherwise, list all configs
    const { data, error } = await supabase
      .from('configs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[config-api] Error listing configs:', error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      configs: data || [],
    });
  } catch (err: any) {
    console.error('[config-api] GET error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/config
 * Create or update a config
 *
 * Requires x-admin-key header
 * Body: { scope, scopeId, config, actor? }
 */
export async function PUT(req: Request) {
  try {
    // Validate admin key
    if (!validateAdminKey(req)) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { scope, scopeId, config, actor } = body;

    // Validate required fields
    if (!scope) {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: scope' },
        { status: 400 }
      );
    }

    if (scope !== 'global' && !scopeId) {
      return NextResponse.json(
        { ok: false, error: 'scopeId required for non-global configs' },
        { status: 400 }
      );
    }

    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Invalid config: must be an object' },
        { status: 400 }
      );
    }

    // Upsert config
    const result = await upsertConfig(
      scope,
      scope === 'global' ? null : scopeId,
      config,
      actor
    );

    // Emit telemetry
    await emit('config_updated', {
      tenant_id: scope === 'tenant' ? scopeId : undefined,
      metadata: {
        scope,
        scopeId: scopeId || null,
        version: result.version,
        actor: actor || 'unknown',
        changedKeys: Object.keys(config),
      },
    });

    console.info('[config-api] Config updated', {
      scope,
      scopeId,
      version: result.version,
      actor,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      version: result.version,
      updated_at: result.updated_at,
    });
  } catch (err: any) {
    console.error('[config-api] PUT error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

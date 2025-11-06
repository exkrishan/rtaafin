/**
 * Multi-scope Configuration System
 * Provides hierarchical config merging: global -> tenant -> campaign -> agent
 */

import merge from 'lodash/merge';
import { supabase } from '@/lib/supabase';
import { emit } from '@/lib/telemetry';

/**
 * Configuration type covering all system settings
 */
export interface Config {
  kb: {
    provider: 'db' | 'knowmax' | 'zendesk' | 'custom';
    maxArticles: number;
    timeoutMs: number;
    minConfidence: number;
  };
  llm: {
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  };
  autoNotes: {
    enabled: boolean;
    model: string;
    promptVersion: string;
    timeoutMs?: number;
  };
  disposition: {
    enabled: boolean;
    categories: string[];
  };
  telemetry: {
    enabled: boolean;
    sampleRate: number;
  };
  ui: {
    theme: 'light' | 'dark' | 'auto';
    showConfidence: boolean;
    autoScroll: boolean;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = {
  kb: {
    provider: 'db',
    maxArticles: 10,
    timeoutMs: 5000,
    minConfidence: 0.5,
  },
  llm: {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 500,
    timeoutMs: 10000,
  },
  autoNotes: {
    enabled: true,
    model: 'gpt-4o-mini',
    promptVersion: 'v1',
  },
  disposition: {
    enabled: false,
    categories: ['resolved', 'escalated', 'callback_required'],
  },
  telemetry: {
    enabled: true,
    sampleRate: 1.0,
  },
  ui: {
    theme: 'auto',
    showConfidence: true,
    autoScroll: true,
  },
};

/**
 * Configuration scope types
 */
export type ConfigScope = 'global' | 'tenant' | 'campaign' | 'agent';

/**
 * Database config row
 */
export interface ConfigRow {
  id: string;
  scope: ConfigScope;
  scope_id: string | null;
  config: Partial<Config>;
  version: number;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

/**
 * Simple LRU cache with TTL
 */
class ConfigCache {
  private cache: Map<string, { value: Config; expiry: number }> = new Map();
  private ttlMs: number = 5000; // 5 seconds

  get(key: string): Config | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: Config): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const configCache = new ConfigCache();

/**
 * Fetch a single config by scope and scopeId
 *
 * @param scope - Config scope (global, tenant, campaign, agent)
 * @param scopeId - Scope identifier (null for global)
 * @returns Config row or null
 */
export async function getConfigByScope(
  scope: ConfigScope,
  scopeId?: string
): Promise<ConfigRow | null> {
  try {
    let query = supabase
      .from('configs')
      .select('*')
      .eq('scope', scope);

    if (scope === 'global') {
      query = query.is('scope_id', null);
    } else if (scopeId) {
      query = query.eq('scope_id', scopeId);
    } else {
      return null;
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - not an error
        return null;
      }
      console.error('[config] Error fetching config:', error);
      return null;
    }

    return data as ConfigRow;
  } catch (err) {
    console.error('[config] Unexpected error in getConfigByScope:', err);
    return null;
  }
}

/**
 * Insert or update a config
 *
 * @param scope - Config scope
 * @param scopeId - Scope identifier (null for global)
 * @param config - Partial config to store
 * @param actor - Who is making the change
 * @returns Updated config row
 */
export async function upsertConfig(
  scope: ConfigScope,
  scopeId: string | null,
  config: Partial<Config>,
  actor?: string
): Promise<ConfigRow> {
  try {
    // Check if config exists
    const existing = await getConfigByScope(scope, scopeId || undefined);

    const now = new Date().toISOString();
    const newVersion = existing ? existing.version + 1 : 1;

    const payload = {
      scope,
      scope_id: scopeId,
      config,
      version: newVersion,
      updated_by: actor || 'system',
      updated_at: now,
    };

    let result;

    if (existing) {
      // Update
      const { data, error } = await (supabase as any)
        .from('configs')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert
      const { data, error } = await (supabase as any)
        .from('configs')
        .insert({ ...payload, created_at: now })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Clear cache on update
    configCache.clear();

    console.info('[config] Config upserted', {
      scope,
      scopeId,
      version: newVersion,
      actor,
    });

    return result as ConfigRow;
  } catch (err: any) {
    console.error('[config] Error upserting config:', err);
    throw new Error(`Failed to upsert config: ${err.message}`);
  }
}

/**
 * Get effective configuration by merging scopes
 * Hierarchy: DEFAULT -> global -> tenant -> campaign -> agent
 *
 * @param params - Scope identifiers
 * @returns Merged configuration
 */
export async function getEffectiveConfig(params: {
  tenantId?: string;
  campaignId?: string;
  agentId?: string;
}): Promise<Config> {
  const { tenantId, campaignId, agentId } = params;
  const startTime = Date.now();

  // Check cache
  const cacheKey = `${tenantId || ''}|${campaignId || ''}|${agentId || ''}`;
  const cached = configCache.get(cacheKey);
  if (cached) {
    console.info('[config] Cache hit', { cacheKey });
    return cached;
  }

  try {
    const resolvedScopes: string[] = [];

    // Start with default config
    let effectiveConfig: Config = merge({}, DEFAULT_CONFIG);

    // Fetch global config
    const globalConfig = await getConfigByScope('global');
    if (globalConfig) {
      effectiveConfig = merge(effectiveConfig, globalConfig.config);
      resolvedScopes.push('global');
    }

    // Fetch tenant config
    if (tenantId) {
      const tenantConfig = await getConfigByScope('tenant', tenantId);
      if (tenantConfig) {
        effectiveConfig = merge(effectiveConfig, tenantConfig.config);
        resolvedScopes.push('tenant');
      }
    }

    // Fetch campaign config
    if (campaignId) {
      const campaignConfig = await getConfigByScope('campaign', campaignId);
      if (campaignConfig) {
        effectiveConfig = merge(effectiveConfig, campaignConfig.config);
        resolvedScopes.push('campaign');
      }
    }

    // Fetch agent config
    if (agentId) {
      const agentConfig = await getConfigByScope('agent', agentId);
      if (agentConfig) {
        effectiveConfig = merge(effectiveConfig, agentConfig.config);
        resolvedScopes.push('agent');
      }
    }

    const latencyMs = Date.now() - startTime;

    // Cache result
    configCache.set(cacheKey, effectiveConfig);

    // Emit telemetry
    await emit('config_fetch', {
      tenant_id: tenantId,
      campaign_id: campaignId,
      agent_id: agentId,
      latency_ms: latencyMs,
      metadata: {
        resolvedScopes,
        cacheHit: false,
      },
    });

    console.info('[config] Effective config resolved', {
      tenantId,
      campaignId,
      agentId,
      resolvedScopes,
      latencyMs: `${latencyMs}ms`,
    });

    return effectiveConfig;
  } catch (err) {
    console.error('[config] Error getting effective config:', err);
    // Return defaults on error
    return merge({}, DEFAULT_CONFIG);
  }
}

/**
 * Get configuration schema for UI
 * Returns field metadata for form rendering
 */
export function getConfigSchema() {
  return {
    kb: {
      type: 'object',
      label: 'Knowledge Base',
      properties: {
        provider: {
          type: 'select',
          label: 'Provider',
          options: ['db', 'knowmax', 'zendesk', 'custom'],
          default: 'db',
        },
        maxArticles: {
          type: 'number',
          label: 'Max Articles',
          min: 1,
          max: 20,
          default: 10,
        },
        timeoutMs: {
          type: 'number',
          label: 'Timeout (ms)',
          min: 1000,
          max: 30000,
          default: 5000,
        },
        minConfidence: {
          type: 'number',
          label: 'Min Confidence',
          min: 0,
          max: 1,
          step: 0.1,
          default: 0.5,
        },
      },
    },
    llm: {
      type: 'object',
      label: 'LLM Settings',
      properties: {
        model: {
          type: 'select',
          label: 'Model',
          options: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
          default: 'gpt-4o-mini',
        },
        temperature: {
          type: 'number',
          label: 'Temperature',
          min: 0,
          max: 2,
          step: 0.1,
          default: 0.7,
        },
        maxTokens: {
          type: 'number',
          label: 'Max Tokens',
          min: 100,
          max: 2000,
          default: 500,
        },
        timeoutMs: {
          type: 'number',
          label: 'Timeout (ms)',
          min: 1000,
          max: 60000,
          default: 10000,
        },
      },
    },
    autoNotes: {
      type: 'object',
      label: 'Auto Notes',
      properties: {
        enabled: {
          type: 'boolean',
          label: 'Enabled',
          default: true,
        },
        model: {
          type: 'select',
          label: 'Model',
          options: ['gpt-4o', 'gpt-4o-mini'],
          default: 'gpt-4o-mini',
        },
        promptVersion: {
          type: 'text',
          label: 'Prompt Version',
          default: 'v1',
        },
      },
    },
    disposition: {
      type: 'object',
      label: 'Disposition',
      properties: {
        enabled: {
          type: 'boolean',
          label: 'Enabled',
          default: false,
        },
        categories: {
          type: 'array',
          label: 'Categories',
          default: ['resolved', 'escalated', 'callback_required'],
        },
      },
    },
    telemetry: {
      type: 'object',
      label: 'Telemetry',
      properties: {
        enabled: {
          type: 'boolean',
          label: 'Enabled',
          default: true,
        },
        sampleRate: {
          type: 'number',
          label: 'Sample Rate',
          min: 0,
          max: 1,
          step: 0.1,
          default: 1.0,
        },
      },
    },
    ui: {
      type: 'object',
      label: 'UI Settings',
      properties: {
        theme: {
          type: 'select',
          label: 'Theme',
          options: ['light', 'dark', 'auto'],
          default: 'auto',
        },
        showConfidence: {
          type: 'boolean',
          label: 'Show Confidence',
          default: true,
        },
        autoScroll: {
          type: 'boolean',
          label: 'Auto Scroll',
          default: true,
        },
      },
    },
  };
}

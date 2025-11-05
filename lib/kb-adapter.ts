/**
 * KB Adapter Factory & Interface
 * Unified knowledge base access layer supporting multiple providers
 * (Supabase DB, Knowmax, Zendesk, etc.)
 */

import { supabase } from '@/lib/supabase';
import dbAdapter from './adapters/dbAdapter';
import knowmaxAdapter from './adapters/knowmaxAdapter';
import noopAdapter from './adapters/noopAdapter';

/**
 * Normalized KB article representation
 */
export type KBArticle = {
  id: string;
  title: string;
  snippet: string;
  url?: string;
  tags?: string[];
  source: string;         // Provider identifier (db, knowmax, etc.)
  confidence?: number;    // Relevance score (0.0-1.0)
  raw?: any;             // Original provider response
};

/**
 * KB search options
 */
export type KBSearchOpts = {
  max?: number;           // Max results to return
  language?: string;      // Language code (en, es, etc.)
  tenantId?: string;      // Tenant identifier
  context?: string[];     // Additional context for semantic search
  sessionId?: string;     // Session tracking
};

/**
 * KB Adapter Interface
 * All KB providers must implement this interface
 */
export interface KBAdapter {
  /**
   * Search for KB articles matching query
   *
   * @param query - Search query string
   * @param opts - Search options
   * @returns Array of matching articles
   */
  search(query: string, opts?: KBSearchOpts): Promise<KBArticle[]>;

  /**
   * Fetch article by ID (optional)
   *
   * @param id - Article identifier
   * @returns Article or null if not found
   */
  fetchById?(id: string): Promise<KBArticle | null>;

  /**
   * Initialize adapter with configuration (optional)
   *
   * @param config - Provider-specific configuration
   */
  init?(config?: any): Promise<void>;
}

/**
 * Get KB adapter for a given tenant
 * Reads configuration from kb_configs table and returns appropriate adapter
 *
 * @param tenantId - Tenant identifier (defaults to 'default')
 * @returns Configured KB adapter instance
 */
export async function getKbAdapter(tenantId: string = 'default'): Promise<KBAdapter> {
  console.info('[kb-adapter] Getting adapter for tenant:', tenantId);

  try {
    // Query kb_configs for tenant configuration
    const { data, error } = await supabase
      .from('kb_configs')
      .select('provider, config')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      console.info('[kb-adapter] No config found for tenant, using default dbAdapter', {
        tenantId,
        error: error?.message,
      });
      return dbAdapter;
    }

    const { provider, config } = data;

    console.info('[kb-adapter] Found config', {
      tenant: tenantId,
      provider,
    });

    // Switch on provider type and return appropriate adapter
    switch (provider) {
      case 'db':
        return dbAdapter;

      case 'knowmax':
        // Initialize Knowmax adapter with config
        await knowmaxAdapter.init?.(config);
        return knowmaxAdapter;

      case 'zendesk':
        // TODO: Implement Zendesk adapter
        console.warn('[kb-adapter] Zendesk adapter not implemented, falling back to noop');
        return noopAdapter;

      case 'custom':
        // TODO: Implement custom adapter loader
        console.warn('[kb-adapter] Custom adapter not implemented, falling back to noop');
        return noopAdapter;

      default:
        console.warn('[kb-adapter] Unknown provider, falling back to noop', { provider });
        return noopAdapter;
    }
  } catch (err) {
    console.error('[kb-adapter] Error fetching config, falling back to dbAdapter', err);
    return dbAdapter;
  }
}

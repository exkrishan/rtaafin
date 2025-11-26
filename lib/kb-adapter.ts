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

// CRITICAL FIX: Cache for KB adapters (per tenant) to prevent repeated DB queries
interface CachedAdapter {
  adapter: KBAdapter;
  cachedAt: number;
  errorLogged: boolean;
}

const adapterCache = new Map<string, CachedAdapter>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL
const MAX_CACHE_SIZE = 100; // Prevent unbounded cache growth

/**
 * Get KB adapter for a given tenant
 * CRITICAL FIX: Added caching and graceful error handling for missing kb_configs table
 * 
 * @param tenantId - Tenant identifier (defaults to 'default')
 * @returns Configured KB adapter instance
 */
export async function getKbAdapter(tenantId: string = 'default'): Promise<KBAdapter> {
  // CRITICAL FIX: Check cache first to avoid repeated DB queries
  const cached = adapterCache.get(tenantId);
  if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
    return cached.adapter;
  }

  // CRITICAL FIX: Prevent cache from growing unbounded
  if (adapterCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (FIFO)
    const oldestKey = adapterCache.keys().next().value;
    if (oldestKey) {
      adapterCache.delete(oldestKey);
    }
  }

  try {
    // Query kb_configs for tenant configuration
    // CRITICAL FIX: Handle missing table gracefully (kb_configs doesn't exist in production)
    const { data, error } = await supabase
      .from('kb_configs')
      .select('provider, config')
      .eq('tenant_id', tenantId)
      .single();

    let adapter: KBAdapter;

    if (error) {
      // CRITICAL FIX: Detect missing table error and handle gracefully
      const isTableMissing = 
        error.message?.includes('Could not find the table') ||
        error.message?.includes('relation') ||
        error.message?.includes('does not exist') ||
        error.code === 'PGRST116' || // No rows returned
        error.code === '42P01'; // PostgreSQL: relation does not exist

      if (isTableMissing) {
        // Table doesn't exist - silently fall back to dbAdapter
        // CRITICAL FIX: Only log once per tenant, not on every call
        if (!cached?.errorLogged) {
          console.info('[kb-adapter] kb_configs table not found, using default dbAdapter', {
            tenantId,
            suggestion: 'Table kb_configs is optional. Using dbAdapter which queries kb_articles directly.',
          });
        }
        adapter = dbAdapter;
        // Cache with error flag to prevent repeated logs
        adapterCache.set(tenantId, { 
          adapter, 
          cachedAt: Date.now(),
          errorLogged: true,
        });
        return adapter;
      }

      // Other errors (network, permission, etc.) - log once
      if (!cached?.errorLogged) {
        console.info('[kb-adapter] No config found for tenant, using default dbAdapter', {
          tenantId,
          error: error?.message,
        });
      }
      adapter = dbAdapter;
    } else if (!data) {
      // No config row found - use default
      if (!cached?.errorLogged) {
        console.info('[kb-adapter] No config found for tenant, using default dbAdapter', {
          tenantId,
        });
      }
      adapter = dbAdapter;
    } else {
      // Config found - use configured adapter
      const { provider, config } = data;

      console.info('[kb-adapter] Found config', {
        tenant: tenantId,
        provider,
      });

      // Switch on provider type and return appropriate adapter
      switch (provider) {
        case 'db':
          adapter = dbAdapter;
          break;

        case 'knowmax':
          // Initialize Knowmax adapter with config
          await knowmaxAdapter.init?.(config);
          adapter = knowmaxAdapter;
          break;

        case 'zendesk':
          // TODO: Implement Zendesk adapter
          console.warn('[kb-adapter] Zendesk adapter not implemented, falling back to noop');
          adapter = noopAdapter;
          break;

        case 'custom':
          // TODO: Implement custom adapter loader
          console.warn('[kb-adapter] Custom adapter not implemented, falling back to noop');
          adapter = noopAdapter;
          break;

        default:
          console.warn('[kb-adapter] Unknown provider, falling back to noop', { provider });
          adapter = noopAdapter;
      }
    }

    // CRITICAL FIX: Cache the adapter to prevent repeated queries
    adapterCache.set(tenantId, { 
      adapter, 
      cachedAt: Date.now(),
      errorLogged: false,
    });
    return adapter;
  } catch (err: any) {
    // CRITICAL FIX: Handle unexpected errors gracefully
    const isTableMissing = 
      err?.message?.includes('Could not find the table') ||
      err?.message?.includes('relation') ||
      err?.code === '42P01';

    if (isTableMissing) {
      // Table missing - use cached adapter or default
      const adapter = cached?.adapter || dbAdapter;
      adapterCache.set(tenantId, { 
        adapter, 
        cachedAt: Date.now(),
        errorLogged: true,
      });
      return adapter;
    }

    // Other errors - log once
    if (!cached?.errorLogged) {
      console.error('[kb-adapter] Error fetching config, falling back to dbAdapter', {
        tenantId,
        error: err?.message || String(err),
      });
    }
    
    // Return cached adapter if available, otherwise dbAdapter
    const adapter = cached?.adapter || dbAdapter;
    adapterCache.set(tenantId, { 
      adapter, 
      cachedAt: Date.now(),
      errorLogged: true,
    });
    return adapter;
  }
}

/**
 * Clear adapter cache (for testing or manual cache invalidation)
 */
export function clearKbAdapterCache(): void {
  adapterCache.clear();
}

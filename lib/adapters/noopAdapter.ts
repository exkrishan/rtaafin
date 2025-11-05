/**
 * Noop KB Adapter
 * Fallback adapter that returns empty results
 * Used when no KB provider is configured or as a safe default
 */

import type { KBAdapter, KBArticle, KBSearchOpts } from '../kb-adapter';

/**
 * No-op adapter implementation
 * Always returns empty array and logs fallback usage
 */
const noopAdapter: KBAdapter = {
  /**
   * Search implementation that returns no results
   */
  async search(query: string, opts?: KBSearchOpts): Promise<KBArticle[]> {
    console.warn('[kb-adapter][noop] Fallback adapter used - no KB provider configured', {
      query,
      tenant: opts?.tenantId || 'unknown',
    });
    return [];
  },

  /**
   * Fetch by ID - always returns null
   */
  async fetchById(id: string): Promise<KBArticle | null> {
    console.warn('[kb-adapter][noop] Fallback adapter - fetchById returns null', { id });
    return null;
  },

  /**
   * Initialization (no-op)
   */
  async init(config?: any): Promise<void> {
    console.info('[kb-adapter][noop] Initialized (no KB provider)');
  },
};

export default noopAdapter;

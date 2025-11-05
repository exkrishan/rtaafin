/**
 * Database KB Adapter
 * Queries kb_articles table in Supabase for knowledge base content
 */

import { supabase } from '@/lib/supabase';
import type { KBAdapter, KBArticle, KBSearchOpts } from '../kb-adapter';
import { emitKBSearch } from '../telemetry';

/**
 * Database adapter implementation
 * Uses Supabase kb_articles table as KB source
 */
const dbAdapter: KBAdapter = {
  /**
   * Search kb_articles table using full-text search
   *
   * @param query - Search query
   * @param opts - Search options
   * @returns Array of matching articles
   */
  async search(query: string, opts?: KBSearchOpts): Promise<KBArticle[]> {
    const startTime = Date.now();
    const tenantId = opts?.tenantId || 'default';
    const maxResults = opts?.max || 10;

    console.info('[kb-adapter][db] Search started', {
      tenant: tenantId,
      query,
      max: maxResults,
    });

    try {
      // Build search query
      // Search in title, snippet, and tags using ILIKE for pattern matching
      let queryBuilder = supabase
        .from('kb_articles')
        .select('id, title, snippet, url, tags')
        .limit(maxResults);

      // Full-text search across title and snippet
      // Use OR conditions for flexible matching
      queryBuilder = queryBuilder.or(
        `title.ilike.%${query}%,snippet.ilike.%${query}%,tags.cs.{${query}}`
      );

      const { data, error } = await queryBuilder;

      const latencyMs = Date.now() - startTime;

      if (error) {
        console.error('[kb-adapter][db] Query error', error);
        await emitKBSearch(tenantId, 'db', latencyMs, 0, error.message);
        return [];
      }

      // Normalize results to KBArticle format
      const articles: KBArticle[] = (data || []).map((row) => ({
        id: row.id,
        title: row.title,
        snippet: row.snippet,
        url: row.url || undefined,
        tags: row.tags || [],
        source: 'db',
        confidence: 1.0, // DB results assumed high quality
        raw: row,
      }));

      console.info('[kb-adapter][db] Search completed', {
        latency: `${latencyMs}ms`,
        found: articles.length,
      });

      // Emit telemetry
      await emitKBSearch(tenantId, 'db', latencyMs, articles.length);

      return articles;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      console.error('[kb-adapter][db] Unexpected error', err);
      await emitKBSearch(tenantId, 'db', latencyMs, 0, err.message);
      return [];
    }
  },

  /**
   * Fetch article by ID
   *
   * @param id - Article UUID
   * @returns Article or null
   */
  async fetchById(id: string): Promise<KBArticle | null> {
    const startTime = Date.now();

    try {
      const { data, error } = await supabase
        .from('kb_articles')
        .select('id, title, snippet, url, tags')
        .eq('id', id)
        .single();

      const latencyMs = Date.now() - startTime;

      if (error || !data) {
        console.warn('[kb-adapter][db] Article not found', { id, latencyMs: `${latencyMs}ms` });
        return null;
      }

      return {
        id: data.id,
        title: data.title,
        snippet: data.snippet,
        url: data.url || undefined,
        tags: data.tags || [],
        source: 'db',
        confidence: 1.0,
        raw: data,
      };
    } catch (err) {
      console.error('[kb-adapter][db] fetchById error', err);
      return null;
    }
  },

  /**
   * Initialize (no-op for DB adapter)
   */
  async init(config?: any): Promise<void> {
    console.info('[kb-adapter][db] Initialized');
  },
};

export default dbAdapter;

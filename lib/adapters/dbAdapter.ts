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

      // Normalize query: replace underscores with spaces for better matching
      // e.g., "credit_card_fraud" -> "credit card fraud"
      const normalizedQuery = query.replace(/_/g, ' ').trim();
      
      // Split query into words for better matching
      const words = normalizedQuery.split(/\s+/).filter(w => w.length > 2);
      
      // Build OR conditions for each word
      // Match if any word appears in title, snippet, or tags
      const orConditions: string[] = [];
      
      // Full phrase match
      orConditions.push(`title.ilike.%${normalizedQuery}%`);
      orConditions.push(`snippet.ilike.%${normalizedQuery}%`);
      
      // Individual word matches
      words.forEach(word => {
        orConditions.push(`title.ilike.%${word}%`);
        orConditions.push(`snippet.ilike.%${word}%`);
      });
      
      // Tags exact match (for array contains)
      orConditions.push(`tags.cs.{${normalizedQuery}}`);
      words.forEach(word => {
        orConditions.push(`tags.cs.{${word}}`);
      });
      
      queryBuilder = queryBuilder.or(orConditions.join(','));

      const { data, error } = await (queryBuilder as any);

      const latencyMs = Date.now() - startTime;

      if (error) {
        console.error('[kb-adapter][db] Query error', error);
        await emitKBSearch(tenantId, 'db', latencyMs, 0, error.message);
        return [];
      }

      // Normalize results to KBArticle format with relevance scoring
      const normalizedQueryLower = normalizedQuery.toLowerCase();
      const queryWords = normalizedQueryLower.split(/\s+/).filter(w => w.length > 2);
      
      const articles: KBArticle[] = ((data || []) as any[]).map((row: any) => {
        // Calculate relevance score based on match quality
        let score = 0.5; // Base score
        
        const titleLower = (row.title || '').toLowerCase();
        const snippetLower = (row.snippet || '').toLowerCase();
        const tagsLower = (row.tags || []).join(' ').toLowerCase();
        
        // Full phrase match in title = highest score
        if (titleLower.includes(normalizedQueryLower)) {
          score = 0.95;
        }
        // Full phrase match in snippet = high score
        else if (snippetLower.includes(normalizedQueryLower)) {
          score = 0.85;
        }
        // All words match in title = very high score
        else if (queryWords.every(word => titleLower.includes(word))) {
          score = 0.9;
        }
        // All words match in snippet = high score
        else if (queryWords.every(word => snippetLower.includes(word) || titleLower.includes(word))) {
          score = 0.8;
        }
        // Some words match = medium score
        else {
          const matchedWords = queryWords.filter(word => 
            titleLower.includes(word) || snippetLower.includes(word) || tagsLower.includes(word)
          ).length;
          score = 0.5 + (matchedWords / queryWords.length) * 0.3; // 0.5-0.8 range
        }
        
        // Boost if tags match
        if (row.tags && Array.isArray(row.tags)) {
          const tagMatch = row.tags.some((tag: any) => 
            normalizedQueryLower.includes(String(tag).toLowerCase()) || String(tag).toLowerCase().includes(normalizedQueryLower)
          );
          if (tagMatch) score = Math.min(1.0, score + 0.1);
        }
        
        return {
          id: row.id,
          title: row.title,
          snippet: row.snippet,
          url: row.url || undefined,
          tags: row.tags || [],
          source: 'db',
          confidence: Math.round(score * 100) / 100, // Round to 2 decimals
          raw: row,
        };
      }).sort((a, b) => (b.confidence || 0) - (a.confidence || 0)); // Sort by confidence descending

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
      const { data, error } = await (supabase as any)
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

/**
 * Knowmax KB Adapter
 * Integrates with Knowmax API for external knowledge base content
 * Reference: Knowmax OpenAPI spec (knowmax-openapi-spec.json)
 */

import type { KBAdapter, KBArticle, KBSearchOpts } from '../kb-adapter';
import { emitKBSearch } from '../telemetry';

/**
 * Knowmax adapter configuration
 */
interface KnowmaxConfig {
  baseUrl: string;
  apiKey: string;
  // Add other config fields as needed (e.g., organizationId, workspace)
}

/**
 * Knowmax API response structure
 * TODO: Update these types based on actual Knowmax OpenAPI spec
 */
interface KnowmaxSearchResponse {
  results?: Array<{
    id: string;
    title: string;
    content?: string;
    summary?: string;
    url?: string;
    tags?: string[];
    score?: number;
  }>;
  // Add pagination fields if needed
  total?: number;
  page?: number;
}

/**
 * Knowmax adapter implementation
 * Uses external Knowmax API as KB source
 */
class KnowmaxAdapter implements KBAdapter {
  private config: KnowmaxConfig | null = null;

  /**
   * Initialize adapter with Knowmax configuration
   *
   * @param config - Knowmax API configuration (baseUrl, apiKey, etc.)
   */
  async init(config?: any): Promise<void> {
    if (!config || !config.baseUrl || !config.apiKey) {
      console.warn('[kb-adapter][knowmax] Missing required config (baseUrl, apiKey)');
      return;
    }

    this.config = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    };

    console.info('[kb-adapter][knowmax] Initialized', {
      baseUrl: this.config.baseUrl,
    });
  }

  /**
   * Search Knowmax API for KB articles
   *
   * @param query - Search query
   * @param opts - Search options
   * @returns Array of matching articles
   */
  async search(query: string, opts?: KBSearchOpts): Promise<KBArticle[]> {
    const startTime = Date.now();
    const tenantId = opts?.tenantId || 'default';
    const maxResults = opts?.max || 10;

    console.info('[kb-adapter][knowmax] Search started', {
      tenant: tenantId,
      query,
      max: maxResults,
    });

    // Check if adapter is initialized
    if (!this.config) {
      console.error('[kb-adapter][knowmax] Adapter not initialized');
      await emitKBSearch(tenantId, 'knowmax', Date.now() - startTime, 0, 'not_initialized');
      return [];
    }

    try {
      // Build Knowmax API request
      // TODO: Update endpoint path based on actual Knowmax API spec
      const endpoint = `${this.config.baseUrl}/api/search`;

      // TODO: Adjust query params based on actual Knowmax API spec
      const url = new URL(endpoint);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', maxResults.toString());
      if (opts?.language) {
        url.searchParams.set('language', opts.language);
      }

      // Create abort controller for 5s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      console.info('[kb-adapter][knowmax] Calling API', { url: url.toString() });

      // Make API request with timeout
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          // TODO: Add any other required headers per Knowmax spec
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        console.error('[kb-adapter][knowmax] API error', {
          status: response.status,
          error: errorText,
        });
        await emitKBSearch(
          tenantId,
          'knowmax',
          Date.now() - startTime,
          0,
          `http_${response.status}`
        );
        return [];
      }

      const data: KnowmaxSearchResponse = await response.json();
      const latencyMs = Date.now() - startTime;

      // Map Knowmax response to KBArticle format
      // TODO: Adjust field mappings based on actual Knowmax response structure
      const articles: KBArticle[] = (data.results || []).map((result) => ({
        id: result.id,
        title: result.title,
        // Use summary if available, otherwise truncate content
        snippet: result.summary || result.content?.substring(0, 200) || '',
        url: result.url,
        tags: result.tags || [],
        source: 'knowmax',
        // Map Knowmax score (0-100?) to confidence (0.0-1.0)
        confidence: result.score ? result.score / 100 : 0.8,
        raw: result,
      }));

      console.info('[kb-adapter][knowmax] Search completed', {
        latency: `${latencyMs}ms`,
        found: articles.length,
      });

      // Emit telemetry
      await emitKBSearch(tenantId, 'knowmax', latencyMs, articles.length);

      return articles;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;

      // Check if error is due to timeout
      if (err.name === 'AbortError') {
        console.error('[kb-adapter][knowmax] Request timeout (5s)', { query });
        await emitKBSearch(tenantId, 'knowmax', latencyMs, 0, 'timeout');
      } else {
        console.error('[kb-adapter][knowmax] Unexpected error', err);
        await emitKBSearch(tenantId, 'knowmax', latencyMs, 0, err.message);
      }

      return [];
    }
  }

  /**
   * Fetch article by ID from Knowmax
   * TODO: Implement if Knowmax supports direct article retrieval
   *
   * @param id - Article identifier
   * @returns Article or null
   */
  async fetchById(id: string): Promise<KBArticle | null> {
    if (!this.config) {
      console.warn('[kb-adapter][knowmax] Adapter not initialized');
      return null;
    }

    const startTime = Date.now();

    try {
      // TODO: Update endpoint path based on actual Knowmax API spec
      const endpoint = `${this.config.baseUrl}/api/articles/${id}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn('[kb-adapter][knowmax] Article not found', {
          id,
          status: response.status,
          latencyMs: `${Date.now() - startTime}ms`,
        });
        return null;
      }

      const data = await response.json();

      // TODO: Map response fields based on actual Knowmax article structure
      return {
        id: data.id,
        title: data.title,
        snippet: data.summary || data.content?.substring(0, 200) || '',
        url: data.url,
        tags: data.tags || [],
        source: 'knowmax',
        confidence: 1.0,
        raw: data,
      };
    } catch (err) {
      console.error('[kb-adapter][knowmax] fetchById error', err);
      return null;
    }
  }
}

// Export singleton instance
const knowmaxAdapter = new KnowmaxAdapter();
export default knowmaxAdapter;

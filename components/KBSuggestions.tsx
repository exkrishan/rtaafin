'use client';

import { useEffect, useState, useCallback } from 'react';
import IconButton from './IconButton';
import Chip from './Chip';
import { useToast } from './Toast';

export interface KBArticle {
  code?: string;
  title: string;
  url?: string;
  snippet?: string;
  tags?: string[];
  score?: number;
  id?: string;
}

export interface KBSuggestionsProps {
  callId?: string;
  tenantId?: string;
  initialSuggestions?: KBArticle[];
  onSelectArticle?: (article: KBArticle) => void;
}

export default function KBSuggestions({
  callId,
  tenantId,
  initialSuggestions,
  onSelectArticle,
}: KBSuggestionsProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<KBArticle[]>(initialSuggestions || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [likedArticles, setLikedArticles] = useState<Set<string>>(new Set());
  const { showToast, ToastComponent } = useToast();

  // Listen to SSE events for intent-based KB articles
  useEffect(() => {
    if (!callId) return;

    const url = `/api/events/stream?callId=${encodeURIComponent(callId)}`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener('intent_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[KBSuggestions] Received intent_update', data);
        if (data.articles && Array.isArray(data.articles) && data.articles.length > 0) {
          setResults((prev) => {
            // Merge new articles, avoiding duplicates by id/code
            const existingIds = new Set(prev.map(a => a.id || a.code || a.title));
            const newArticles = data.articles.filter((a: KBArticle) => 
              !existingIds.has(a.id || a.code || a.title || '')
            );
            return [...prev, ...newArticles];
          });
        }
      } catch (err) {
        console.error('[KBSuggestions] Failed to parse intent_update', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [callId]);

  // Debounced search
  useEffect(() => {
    if (query.length === 0 && initialSuggestions) {
      setResults(initialSuggestions);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Initial load: fetch default suggestions if no initialSuggestions provided
  useEffect(() => {
    if (!initialSuggestions || initialSuggestions.length === 0) {
      performSearch('');
    }
  }, []);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim() && initialSuggestions && initialSuggestions.length > 0) {
      setResults(initialSuggestions);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: searchQuery || '',
      });
      if (tenantId) {
        params.append('tenantId', tenantId);
      }

      const response = await fetch(`/api/kb/search?${params.toString()}`, {
        method: 'GET',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Search failed');
      }

      const payload = await response.json();
      if (payload.ok && Array.isArray(payload.results)) {
        setResults(payload.results);
      } else {
        setResults([]);
      }
    } catch (err: any) {
      console.error('[KBSuggestions] Search error', err);
      setError(err?.message || 'Failed to search knowledge base');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = useCallback(async (url: string, articleTitle: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      showToast('Copied link');
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      console.error('[KBSuggestions] Copy failed', err);
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopiedUrl(url);
        showToast('Copied link');
        setTimeout(() => setCopiedUrl(null), 2000);
      } catch (fallbackErr) {
        console.error('[KBSuggestions] Fallback copy failed', fallbackErr);
      }
      document.body.removeChild(textarea);
    }
  }, [showToast]);

  const handleFeedback = useCallback(async (article: KBArticle, action: 'like' | 'dislike') => {
    const articleId = article.id || article.code || article.title;
    
    if (action === 'like') {
      setLikedArticles((prev) => new Set(prev).add(articleId));
      showToast('Good Response');
    }
    
    try {
      await fetch('/api/kb/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          tenantId,
          articleId,
          articleTitle: article.title,
          action,
        }),
      }).catch(() => {
        // Ignore 404 or errors - feedback is optional
      });
    } catch (err) {
      // Ignore feedback errors
      console.warn('[KBSuggestions] Feedback failed', err);
    }
  }, [callId, tenantId, showToast]);

  const handleOpen = useCallback((url: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  return (
    <>
      <div className="w-full bg-white rounded-xl card-shadow p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Agent Assist</h2>
            <p className="text-sm text-gray-500">AI Powered Suggestions</p>
          </div>
          <button className="text-gray-400 hover:text-gray-600" aria-label="Collapse/Expand">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>

        {/* Search Box */}
        <div className="relative">
          <label htmlFor="kb-search" className="sr-only">
            Search knowledge base
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="kb-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full pl-10 pr-3 py-2 rounded-md border border-[#EEF2F6] text-sm focus:border-[#4B60E7] focus:outline-none focus:ring-2 focus:ring-[#4B60E7]/20"
            aria-label="Search knowledge base"
          />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#4B60E7]" />
            <span className="ml-2 text-sm text-gray-500">Searching...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && results.length === 0 && (
          <div className="text-center py-8 text-sm text-gray-500">
            Looking for suggestions
          </div>
        )}

        {/* Suggestion Cards */}
        {!loading && results.length > 0 && (
          <div className="space-y-3">
            {results.map((article, idx) => {
              const articleId = article.id || article.code || article.title;
              const isLiked = likedArticles.has(articleId);
              const relevance = article.score !== undefined 
                ? Math.round(article.score * 100) 
                : 90; // Default relevance if not provided

              return (
                <div
                  key={articleId || `article-${idx}`}
                  className="rounded-lg border border-[#EEF2F6] bg-white p-3 transition-all hover:border-gray-300 hover:shadow-sm"
                >
                  {/* Card Header: Title + Relevance Pill */}
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="flex-1 font-semibold text-sm text-gray-900 pr-2">
                      {article.title}
                    </h3>
                    <Chip 
                      label={`${relevance}% Relevant`} 
                      variant="relevance" 
                    />
                  </div>

                  {/* Subtitle/Snippet */}
                  {article.snippet && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                      {article.snippet}
                    </p>
                  )}

                  {/* Actions Row */}
                  <div className="flex items-center justify-end gap-1">
                    <IconButton
                      icon={
                        <svg className="w-4 h-4" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isLiked ? 0 : 2} fill={isLiked ? 'currentColor' : 'none'} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017a2 2 0 01-1.691-.9L9 16.5l-2.555-3.4a2 2 0 01-.045-2.1l1.818-3.636A2 2 0 0110.232 6H14v4zm-2 0V6a2 2 0 012-2h2a2 2 0 012 2v4h-6z" />
                        </svg>
                      }
                      onClick={() => handleFeedback(article, 'like')}
                      label="Good Response"
                      variant={isLiked ? 'active' : 'default'}
                      ariaLabel={`Like ${article.title}`}
                    />
                    <IconButton
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17.196 7.19a2 2 0 00-2.348-2.348l-3.48.87a2 2 0 01-2.008-.608L9.196 3.1A2 2 0 005.904 3H4.108a2 2 0 00-.781.12l-1.5.6a2 2 0 00-.657 2.78l.112.194a2 2 0 001.781 1.101H10M14 9l-2 9m-2-9l2-9m6 9v5a2 2 0 01-2 2h-2.368a2 2 0 01-1.336-.536l-2.12-2.12a2 2 0 00-1.59-.694H14" />
                        </svg>
                      }
                      onClick={() => handleFeedback(article, 'dislike')}
                      label="Dislike"
                      variant="default"
                      ariaLabel={`Dislike ${article.title}`}
                    />
                    {article.url && (
                      <>
                        <IconButton
                          icon={
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          }
                          onClick={() => handleCopyUrl(article.url!, article.title)}
                          label="Copy link"
                          variant={copiedUrl === article.url ? 'active' : 'default'}
                          ariaLabel={`Copy article link for ${article.title}`}
                        />
                        <IconButton
                          icon={
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          }
                          onClick={() => handleOpen(article.url!)}
                          label="Open article"
                          variant="default"
                          ariaLabel={`Open ${article.title} in new tab`}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {ToastComponent}
    </>
  );
}

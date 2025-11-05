'use client';

import { useState, useCallback, useEffect } from 'react';
import { showToast } from './ToastContainer';

export interface KBArticle {
  id: string;
  title: string;
  snippet?: string;
  url?: string;
  relevance?: number;
}

export interface AgentAssistPanelProps {
  articles?: KBArticle[]; // Made optional since we'll fetch from SSE
  callId?: string; // Added to listen to SSE events
  onFeedback?: (id: string, liked: boolean) => void;
}

export default function AgentAssistPanel({
  articles: initialArticles = [],
  callId,
  onFeedback,
}: AgentAssistPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [articles, setArticles] = useState<KBArticle[]>(initialArticles);

  // Listen to SSE events for intent-based KB articles
  useEffect(() => {
    if (!callId) return;

    const url = `/api/events/stream?callId=${encodeURIComponent(callId)}`;
    const eventSource = new EventSource(url);

           eventSource.addEventListener('intent_update', (event) => {
             try {
               const data = JSON.parse(event.data);
               console.log('[AgentAssistPanel] Received intent_update', data);
               if (data.articles && Array.isArray(data.articles) && data.articles.length > 0) {
                 setArticles((prev) => {
                   // Merge new articles, avoiding duplicates by id/code/title
                   // New articles should appear at the TOP
                   const existingIds = new Set(prev.map(a => a.id || a.title || ''));
                   const newArticles = data.articles.filter((a: KBArticle) => 
                     !existingIds.has(a.id || a.title || '')
                   );
                   // Prepend new articles at the top
                   return [...newArticles, ...prev];
                 });
               }
             } catch (err) {
               console.error('[AgentAssistPanel] Failed to parse intent_update', err);
             }
           });

    eventSource.onerror = (err) => {
      console.error('[AgentAssistPanel] SSE error', err);
    };

    return () => {
      eventSource.close();
    };
  }, [callId]);

  // Update articles when initialArticles prop changes
  // Only update if we have articles (don't override articles from SSE)
  useEffect(() => {
    if (initialArticles.length > 0 && articles.length === 0) {
      // Only set initial articles if we have none (start with empty before intent detection)
      setArticles(initialArticles);
    }
  }, [initialArticles]);

  // Filter articles based on search query
  const filteredArticles = articles.filter((article) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      article.title.toLowerCase().includes(query) ||
      article.snippet?.toLowerCase().includes(query)
    );
  });

  // Handle copy link
  const handleCopyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      showToast('Copied link', 'success');
      setTimeout(() => {
        setCopiedUrl(null);
      }, 2000);
    } catch (err) {
      console.error('[AgentAssistPanel] Failed to copy link', err);
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopiedUrl(url);
        showToast('Copied link', 'success');
        setTimeout(() => {
          setCopiedUrl(null);
        }, 2000);
      } catch (fallbackErr) {
        console.error('[AgentAssistPanel] Fallback copy failed', fallbackErr);
        showToast('Failed to copy link', 'error');
      }
      document.body.removeChild(textarea);
    }
  }, []);

  // Handle open article
  const handleOpen = useCallback((url: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  // Handle feedback
  const handleFeedback = useCallback(
    (articleId: string, liked: boolean) => {
      if (onFeedback) {
        onFeedback(articleId, liked);
      }
    },
    [onFeedback]
  );

  // Get relevance pill color
  const getRelevanceColor = (relevance?: number) => {
    if (relevance === undefined) return 'bg-blue-100 text-blue-700';
    // Relevance is 0-1, so 0.8 = 80%
    return relevance >= 0.8
      ? 'bg-success/20 text-success'
      : 'bg-blue-100 text-blue-700';
  };

  // Format relevance percentage
  const formatRelevance = (relevance?: number) => {
    if (relevance === undefined) return 'N/A';
    // Relevance is already 0-1, convert to percentage
    return `${Math.round(relevance * 100)}% Relevant`;
  };

  return (
    <>
      <div className="card">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            AI Powered Suggestions
          </h2>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Collapse panel"
            role="button"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-full pl-10 pr-3 h-9 rounded-md border border-border-soft bg-panel-bg text-sm text-gray-900 placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            aria-label="Search knowledge base articles"
          />
        </div>

        {/* Articles List */}
        <div className="space-y-3">
          {filteredArticles.length === 0 ? (
            <div className="text-center py-8 text-sm text-text-muted">
              {searchQuery ? 'No articles found' : 'Looking for suggestions'}
            </div>
          ) : (
            filteredArticles.map((article) => (
              <div
                key={article.id}
                className="border border-border-soft p-3 rounded-lg mb-3 focus-within:ring-2 focus-within:ring-brand/20 focus-within:outline-none"
                tabIndex={0}
                role="article"
                aria-label={`Article: ${article.title}`}
              >
                {/* Title and Confidence Score */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 pr-2">
                    <h3 className="font-semibold text-[14px] text-gray-900">
                      {article.title}
                    </h3>
                    {article.relevance !== undefined && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-[11px] text-text-muted">
                          Confidence:
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-pill text-xs font-semibold ${getRelevanceColor(
                            article.relevance
                          )}`}
                          aria-label={`Confidence: ${formatRelevance(article.relevance)}`}
                        >
                          {formatRelevance(article.relevance)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Snippet */}
                {article.snippet && (
                  <p className="text-[13px] text-text-muted line-clamp-2 mb-3">
                    {article.snippet}
                  </p>
                )}

                {/* Actions Row */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleFeedback(article.id, true)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-600 hover:bg-green-50 hover:text-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20"
                    aria-label={`Like article: ${article.title}`}
                    role="button"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFeedback(article.id, false)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20"
                    aria-label={`Dislike article: ${article.title}`}
                    role="button"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      style={{ transform: 'rotate(180deg)' }}
                    >
                      <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
                    </svg>
                  </button>
                  {article.url && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleCopyLink(article.url!)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-600 hover:bg-blue-50 hover:text-brand transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20"
                        aria-label={`Copy link for article: ${article.title}`}
                        role="button"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpen(article.url!)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-600 hover:bg-blue-50 hover:text-brand transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20"
                        aria-label={`Open article: ${article.title}`}
                        role="button"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </>
  );
}


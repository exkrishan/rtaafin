'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import CustomerDetailsHeader, { Customer } from './CustomerDetailsHeader';
import { showToast } from './ToastContainer';

// Re-export Customer type for convenience
export type { Customer } from './CustomerDetailsHeader';

export interface KBArticle {
  id: string;
  title: string;
  snippet?: string;
  url?: string;
  confidence?: number;
  relevance?: number;
  intent?: string; // Intent detection basis (e.g., "credit_card_block", "account_balance")
  intentConfidence?: number; // Confidence of the intent detection
}

export interface TranscriptUtterance {
  utterance_id: string;
  speaker: 'agent' | 'customer';
  text: string;
  confidence: number;
  timestamp: string;
  isPartial?: boolean;
  isAiTriggered?: boolean;
}

export interface DispositionData {
  dispositionId: string;
  dispositionTitle: string;
  confidence: number;
  subDispositions?: Array<{ id: string; title: string }>;
  autoNotes: string;
}

export interface AgentAssistPanelV2Props {
  agentId: string;
  tenantId: string;
  interactionId: string;
  customer: Customer | null;
  callDuration?: string;
  isCallActive?: boolean;
  onTranscriptEvent?: (event: TranscriptUtterance) => void;
  triggerKBSearch?: (query: string, context: { interactionId: string; recentUtterance?: string }) => Promise<KBArticle[]>;
  fetchDispositionSummary?: (interactionId: string) => Promise<DispositionData>;
  emitTelemetry?: (eventName: string, payload: Record<string, any>) => void;
  onOpenCRM?: () => void;
  onOpenCaseHistory?: () => void;
}

export default function AgentAssistPanelV2({
  agentId,
  tenantId,
  interactionId,
  customer,
  callDuration = '00:00',
  isCallActive = false,
  onTranscriptEvent,
  triggerKBSearch,
  fetchDispositionSummary,
  emitTelemetry,
  onOpenCRM,
  onOpenCaseHistory,
}: AgentAssistPanelV2Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [kbSuggestionsOpen, setKbSuggestionsOpen] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [utterances, setUtterances] = useState<TranscriptUtterance[]>([]);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [dispositionData, setDispositionData] = useState<DispositionData | null>(null);
  const [isLoadingDisposition, setIsLoadingDisposition] = useState(false);
  const [dispositionNotes, setDispositionNotes] = useState('');
  const [selectedDisposition, setSelectedDisposition] = useState<string>('');
  const [selectedSubDispositions, setSelectedSubDispositions] = useState<string[]>([]);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'slow' | 'error'>('healthy');
  const [healthLatency, setHealthLatency] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState(true);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const [manualScroll, setManualScroll] = useState(false);

  // Persist collapse state in sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('aa_panel_collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem('aa_panel_collapsed', String(isCollapsed));
  }, [isCollapsed]);

  // Auto-expand on call start
  useEffect(() => {
    if (isCallActive && isCollapsed) {
      setIsCollapsed(false);
      emitTelemetry?.('agent_assist_panel_opened', {
        tenant_id: tenantId,
        agent_id: agentId,
        interaction_id: interactionId,
        timestamp: new Date().toISOString(),
      });
    }
  }, [isCallActive, isCollapsed, tenantId, agentId, interactionId, emitTelemetry]);

  // Listen to SSE for transcript and KB updates
  useEffect(() => {
    if (!interactionId || isCollapsed) return;

    const url = `/api/events/stream?callId=${encodeURIComponent(interactionId)}`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      setWsConnected(true);
      setHealthStatus('healthy');
    };

    eventSource.onerror = () => {
      setWsConnected(false);
      setHealthStatus('error');
    };

    eventSource.addEventListener('transcript_line', (event) => {
      try {
        const data = JSON.parse(event.data);
        // Skip system messages
        if (data.text && (data.text.includes('Connected to realtime stream') || data.text.includes('clientId:') || data.callId === 'system')) {
          return;
        }
        
        if (data.callId === interactionId && data.text) {
          // Determine speaker from text prefix (Agent: or Customer:)
          let speaker: 'agent' | 'customer' = 'customer';
          let text = data.text;
          
          // Check for speaker prefix in text (case-insensitive)
          if (text.match(/^Agent:\s*/i)) {
            speaker = 'agent';
            text = text.replace(/^Agent:\s*/i, '').trim();
          } else if (text.match(/^Customer:\s*/i)) {
            speaker = 'customer';
            text = text.replace(/^Customer:\s*/i, '').trim();
          } else if (data.speaker) {
            // Fallback to data.speaker if provided
            speaker = data.speaker.toLowerCase() === 'agent' ? 'agent' : 'customer';
            text = text.trim();
          }
          
          // Only add if we have actual text content
          if (!text || text.length === 0) {
            return;
          }
          
          const utterance: TranscriptUtterance = {
            utterance_id: data.seq?.toString() || `${Date.now()}-${Math.random()}`,
            speaker,
            text: text,
            confidence: data.confidence || 0.95,
            timestamp: data.ts || new Date().toISOString(),
            isPartial: false,
          };
          
          setUtterances(prev => {
            // Check for duplicates by seq or utterance_id
            const exists = prev.some(u => 
              u.utterance_id === utterance.utterance_id || 
              (data.seq && u.utterance_id === data.seq.toString())
            );
            if (exists) {
              console.log('[AgentAssistPanel] Skipping duplicate utterance', utterance.utterance_id);
              return prev;
            }
            return [...prev, utterance];
          });
          onTranscriptEvent?.(utterance);
          emitTelemetry?.('transcript_generated', {
            interaction_id: interactionId,
            utterance_id: utterance.utterance_id,
            speaker: utterance.speaker,
            confidence: utterance.confidence,
            timestamp: utterance.timestamp,
            latency_ms: 2000, // Simulated
          });
        }
      } catch (err) {
        console.error('[AgentAssistPanel] Failed to parse transcript_line', err);
      }
    });

    eventSource.addEventListener('intent_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.articles && Array.isArray(data.articles)) {
          // Attach intent information to articles
          const articlesWithIntent = data.articles.map((article: KBArticle) => ({
            ...article,
            intent: data.intent || article.intent, // Use intent from event or article
            intentConfidence: data.confidence || article.intentConfidence, // Use confidence from event or article
          }));
          
          setKbArticles(prev => {
            const existingIds = new Set(prev.map(a => a.id));
            const newArticles = articlesWithIntent.filter((a: KBArticle) => !existingIds.has(a.id));
            return [...newArticles, ...prev];
          });
          
          articlesWithIntent.forEach((article: KBArticle) => {
            emitTelemetry?.('kb_suggestion_shown', {
              interaction_id: interactionId,
              article_id: article.id,
              confidence: article.confidence || article.relevance || 0,
              intent: article.intent,
              intentConfidence: article.intentConfidence,
              rank: 0,
              latency_ms: 1500,
            });
          });
        }
      } catch (err) {
        console.error('[AgentAssistPanel] Failed to parse intent_update', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [interactionId, isCollapsed, onTranscriptEvent, emitTelemetry, tenantId, agentId]);

  // Auto-scroll transcript
  useEffect(() => {
    if (!manualScroll && transcriptEndRef.current && transcriptContainerRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [utterances, manualScroll]);

  // Handle manual scroll
  const handleTranscriptScroll = useCallback(() => {
    if (!transcriptContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = transcriptContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setManualScroll(!isNearBottom);
  }, []);

  // Manual KB search
  const handleManualSearch = useCallback(async () => {
    if (!manualSearchQuery.trim() || !triggerKBSearch) return;
    
    setIsSearching(true);
    const recentUtterance = utterances[utterances.length - 1]?.text;
    
    try {
      const results = await triggerKBSearch(manualSearchQuery, {
        interactionId,
        recentUtterance,
      });
      setKbArticles(results);
      emitTelemetry?.('manual_kb_search_triggered', {
        interaction_id: interactionId,
        query: manualSearchQuery,
        results_count: results.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[AgentAssistPanel] KB search failed', err);
      showToast('KB search failed', 'error');
    } finally {
      setIsSearching(false);
    }
  }, [manualSearchQuery, triggerKBSearch, interactionId, utterances, emitTelemetry]);

  // Trigger KB search from transcript icon
  const handleTriggerKBSearch = useCallback(async (text: string) => {
    if (!triggerKBSearch) return;
    
    setIsSearching(true);
    try {
      const results = await triggerKBSearch(text, { interactionId });
      setKbArticles(results);
      emitTelemetry?.('manual_kb_search_triggered', {
        interaction_id: interactionId,
        query: text,
        results_count: results.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[AgentAssistPanel] KB search failed', err);
    } finally {
      setIsSearching(false);
    }
  }, [triggerKBSearch, interactionId, emitTelemetry]);

  // Fetch disposition on call end
  useEffect(() => {
    if (!isCallActive && utterances.length > 0 && !dispositionData && fetchDispositionSummary) {
      setIsLoadingDisposition(true);
      const startTime = Date.now();
      
      fetchDispositionSummary(interactionId)
        .then(data => {
          const latency = Date.now() - startTime;
          setDispositionData(data);
          setDispositionNotes(data.autoNotes);
          setSelectedDisposition(data.dispositionId);
          setHealthLatency(latency);
          setHealthStatus(latency > 2500 ? 'slow' : 'healthy');
          
          emitTelemetry?.('disposition_recommendation_generated', {
            interaction_id: interactionId,
            disposition_id: data.dispositionId,
            confidence: data.confidence,
            latency_ms: latency,
          });
        })
        .catch(err => {
          console.error('[AgentAssistPanel] Failed to fetch disposition', err);
          setHealthStatus('error');
        })
        .finally(() => {
          setIsLoadingDisposition(false);
        });
    }
  }, [isCallActive, utterances, dispositionData, fetchDispositionSummary, interactionId, emitTelemetry]);

  // Handle feedback
  const handleFeedback = useCallback((articleId: string, liked: boolean) => {
    emitTelemetry?.('kb_suggestion_feedback_given', {
      interaction_id: interactionId,
      article_id: articleId,
      feedback: liked ? 'positive' : 'negative',
      agent_id: agentId,
      timestamp: new Date().toISOString(),
    });
    showToast(liked ? 'Feedback recorded' : 'Feedback recorded', 'success');
  }, [interactionId, agentId, emitTelemetry]);

  // Copy snippet
  const handleCopySnippet = useCallback(async (snippet: string) => {
    try {
      await navigator.clipboard.writeText(snippet);
      showToast('Copied to clipboard', 'success');
    } catch (err) {
      console.error('[AgentAssistPanel] Copy failed', err);
    }
  }, []);

  // Save disposition
  const handleSaveDisposition = useCallback(() => {
    emitTelemetry?.('disposition_notes_generated', {
      interaction_id: interactionId,
      notes: dispositionNotes,
      timestamp: new Date().toISOString(),
    });
    emitTelemetry?.('disposition_saved_to_crm', {
      interaction_id: interactionId,
      saved_by: agentId,
      crm_id: 'crm-placeholder',
      timestamp: new Date().toISOString(),
    });
    showToast('Disposition saved', 'success');
  }, [interactionId, agentId, dispositionNotes, emitTelemetry]);

  if (isCollapsed) {
    return (
      <div className="fixed right-0 top-0 h-full w-12 bg-white border-l border-gray-200 flex flex-col items-center py-4 z-50">
        <button
          onClick={() => {
            setIsCollapsed(false);
            emitTelemetry?.('agent_assist_panel_opened', {
              tenant_id: tenantId,
              agent_id: agentId,
              interaction_id: interactionId,
              timestamp: new Date().toISOString(),
            });
          }}
          className="p-2 hover:bg-gray-100 rounded transition-colors"
          aria-label="Expand Agent Assist panel"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-gray-100 text-gray-700';
    if (confidence >= 0.8) return 'bg-green-100 text-green-700';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const formatConfidence = (confidence?: number) => {
    if (!confidence) return 'N/A';
    return `${Math.round(confidence * 100)}%`;
  };

  return (
    <div className="fixed right-0 top-0 h-full w-[360px] bg-white border-l border-gray-200 flex flex-col z-50 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Agent Assist</h2>
          <div className="relative group">
            <div className={`w-2 h-2 rounded-full ${
              healthStatus === 'healthy' ? 'bg-green-500' :
              healthStatus === 'slow' ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              {healthStatus === 'healthy' ? `Latency: ${healthLatency}ms` :
               healthStatus === 'slow' ? `Slow: ${healthLatency}ms (p95: 2500ms)` :
               'Disconnected'}
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            setIsCollapsed(true);
            emitTelemetry?.('agent_assist_panel_closed', {
              tenant_id: tenantId,
              agent_id: agentId,
              interaction_id: interactionId,
              timestamp: new Date().toISOString(),
            });
          }}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
          aria-label="Collapse Agent Assist panel"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>


      {/* WebSocket Status Banner */}
      {!wsConnected && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-xs text-yellow-800">Stream disconnected</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-yellow-800 underline hover:text-yellow-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content Area - Flex container for 70/30 split */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Post-Call Disposition View */}
        {!isCallActive && (isLoadingDisposition || dispositionData) ? (
          <div className="p-4 space-y-4">
            {isLoadingDisposition ? (
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="text-sm text-gray-600 mt-4">Generating recommendation...</div>
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
                >
                  Retry
                </button>
              </div>
            ) : dispositionData ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Recommended Disposition
                  </label>
                  <select
                    value={selectedDisposition}
                    onChange={(e) => setSelectedDisposition(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={dispositionData.dispositionId}>
                      {dispositionData.dispositionTitle} ({formatConfidence(dispositionData.confidence)})
                    </option>
                  </select>
                </div>

                {dispositionData.subDispositions && dispositionData.subDispositions.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Sub-Dispositions
                    </label>
                    <div className="space-y-2">
                      {dispositionData.subDispositions.map(sub => (
                        <label key={sub.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedSubDispositions.includes(sub.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSubDispositions([...selectedSubDispositions, sub.id]);
                              } else {
                                setSelectedSubDispositions(selectedSubDispositions.filter(id => id !== sub.id));
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-900">{sub.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Notes <span className="text-gray-500 text-xs">(AI-generated, editable)</span>
                  </label>
                  <textarea
                    value={dispositionNotes}
                    onChange={(e) => setDispositionNotes(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Auto-generated notes..."
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveDisposition}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
                  >
                    Save & Sync
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Manual KB Search - Always Visible */}
            <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                  placeholder="Search KB..."
                  className="w-full pl-8 pr-8 h-9 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  aria-label="Manual knowledge base search"
                />
                <svg
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {isSearching && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* KB Suggestions Section - 70% of remaining space */}
            <div className="flex flex-col flex-[0.7] border-b border-gray-200 min-h-0">
              <div className="px-4 py-2.5 border-b border-gray-200 flex-shrink-0">
                <span className="text-sm font-semibold text-gray-900">Knowledge Base Suggestions</span>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
                {kbArticles.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">
                    {isSearching ? 'Searching...' : 'Looking for suggestions'}
                  </div>
                ) : (
                  kbArticles.map((article) => {
                      const confidence = article.confidence || article.relevance || 0;
                      const isLowConfidence = confidence < 0.7;
                      
                      return (
                        <div
                          key={article.id}
                          className={`p-3 border rounded-md ${
                            isLowConfidence ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200'
                          }`}
                          title={isLowConfidence ? 'Low confidence suggestion' : ''}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-sm font-semibold text-gray-900 flex-1 pr-2">{article.title}</h4>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {article.intent && (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded" title={`Intent: ${article.intent}`}>
                                  {article.intent.replace(/_/g, ' ')}
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getConfidenceColor(confidence)}`}>
                                {formatConfidence(confidence)}
                              </span>
                            </div>
                          </div>
                          {article.snippet && (
                            <p className="text-xs text-gray-600 mb-3 line-clamp-2 leading-relaxed">{article.snippet}</p>
                          )}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleFeedback(article.id, true)}
                              className="p-1.5 hover:bg-green-50 rounded transition-colors"
                              aria-label={`Like: ${article.title}`}
                            >
                              <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => handleFeedback(article.id, false)}
                              className="p-1.5 hover:bg-red-50 rounded transition-colors"
                              aria-label={`Dislike: ${article.title}`}
                            >
                              <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(180deg)' }}>
                                <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
                              </svg>
                            </button>
                            {article.snippet && (
                              <button
                                onClick={() => handleCopySnippet(article.snippet!)}
                                className="p-1.5 hover:bg-blue-50 rounded transition-colors"
                                aria-label={`Copy snippet: ${article.title}`}
                              >
                                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            )}
                            {article.url && (
                              <button
                                onClick={() => window.open(article.url, '_blank')}
                                className="p-1.5 hover:bg-blue-50 rounded transition-colors"
                                aria-label={`Open: ${article.title}`}
                              >
                                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Transcripts Section - 30% of remaining space */}
            <div className="flex flex-col flex-[0.3] min-h-0">
              <div className="px-4 py-2.5 border-b border-gray-200 flex-shrink-0">
                <span className="text-sm font-semibold text-gray-900">Transcripts</span>
              </div>
              <div
                ref={transcriptContainerRef}
                onScroll={handleTranscriptScroll}
                className="flex-1 overflow-y-auto px-4 pb-4 space-y-2"
                role="log"
                aria-label="Call transcript"
              >
                {utterances.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500">Waiting for transcript...</div>
                ) : (
                  utterances.map((utterance) => {
                    // Filter out system messages
                    if (utterance.text.includes('Connected to realtime stream') || utterance.text.includes('clientId:')) {
                      return null;
                    }
                    
                    return (
                      <div
                        key={utterance.utterance_id}
                        className={`p-2.5 rounded-md text-sm ${
                          utterance.speaker === 'agent'
                            ? 'bg-blue-50 ml-4 text-gray-900'
                            : 'bg-green-50 mr-4 text-gray-900'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-gray-600">
                            {utterance.speaker === 'agent' ? 'Agent' : 'Customer'}
                          </span>
                          <div className="flex items-center gap-2">
                            {utterance.speaker === 'customer' && (
                              <button
                                onClick={() => handleTriggerKBSearch(utterance.text)}
                                className="p-1 hover:bg-yellow-100 rounded transition-colors"
                                aria-label="Trigger KB search for this utterance"
                                title="Search KB for this"
                              >
                                <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z"/>
                                </svg>
                              </button>
                            )}
                            <span className="text-xs text-gray-500">
                              {new Date(utterance.timestamp).toLocaleTimeString()}
                            </span>
                            {utterance.confidence < 0.7 && (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                                Low
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-900 leading-relaxed">{utterance.text}</p>
                      </div>
                    );
                  })
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

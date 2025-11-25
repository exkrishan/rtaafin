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
  onConnectionStateChange?: (connected: boolean, readyState?: number) => void;
  useSse?: boolean; // If false, skip SSE connection (for demo mode)
  directTranscripts?: TranscriptUtterance[]; // Direct transcript updates (for demo mode)
  onKbArticlesUpdate?: (articles: KBArticle[], intent?: string, confidence?: number) => void; // Callback for KB articles from API
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
  onConnectionStateChange,
  useSse = true,
  directTranscripts,
  onKbArticlesUpdate,
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
  const [allDispositions, setAllDispositions] = useState<Array<{ id: number | string; code: string; title: string; label?: string }>>([]);
  const [allSubDispositions, setAllSubDispositions] = useState<Array<{ id: number | string; code: string; title: string; label?: string }>>([]);
  const [isLoadingSubDispositions, setIsLoadingSubDispositions] = useState(false);
  const lastFetchedDispositionIdRef = useRef<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'slow' | 'error'>('healthy');
  const [healthLatency, setHealthLatency] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState(false); // Start as false, only set to true when connection is actually established
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const [manualScroll, setManualScroll] = useState(false);
  const [kbHeight, setKbHeight] = useState(70); // Percentage of available height for KB (default 70%)
  const [isDragging, setIsDragging] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);

  // CRITICAL FIX: Use refs for callbacks to prevent SSE useEffect from re-running unnecessarily
  // This prevents connection churn (multiple connections being created/destroyed)
  const onTranscriptEventRef = useRef(onTranscriptEvent);
  const emitTelemetryRef = useRef(emitTelemetry);
  const onConnectionStateChangeRef = useRef(onConnectionStateChange);

  // Update refs whenever callbacks change (without triggering SSE reconnection)
  useEffect(() => {
    onTranscriptEventRef.current = onTranscriptEvent;
    emitTelemetryRef.current = emitTelemetry;
    onConnectionStateChangeRef.current = onConnectionStateChange;
  });

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

  // Update utterances from direct transcripts (demo mode)
  useEffect(() => {
    if (directTranscripts && directTranscripts.length > 0) {
      console.log('[AgentAssistPanel] 📥 Updating from direct transcripts', {
        count: directTranscripts.length,
        interactionId,
      });
      setUtterances(directTranscripts);
      // Mark as connected for demo mode
      setWsConnected(true);
      setHealthStatus('healthy');
      onConnectionStateChange?.(true, 1); // Simulate OPEN state
    }
  }, [directTranscripts, interactionId, onConnectionStateChange]);

  // Handle KB articles updates from API (demo mode, when SSE is disabled)
  useEffect(() => {
    if (onKbArticlesUpdate) {
      // Store the callback so it can be called from outside
      (window as any).__updateKbArticles = (articles: KBArticle[], intent?: string, confidence?: number) => {
        console.log('[AgentAssistPanel] 📚 Updating KB articles from API', {
          articlesCount: articles.length,
          intent,
          confidence,
        });
        
        // Attach intent information to articles
        const articlesWithIntent = articles.map((article: KBArticle) => ({
          ...article,
          intent: intent || article.intent,
          intentConfidence: confidence || article.intentConfidence,
          timestamp: Date.now(),
        }));
        
        setKbArticles(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const newArticles = articlesWithIntent
            .filter((a: KBArticle) => !existingIds.has(a.id))
            .map((a: KBArticle) => ({
              ...a,
              timestamp: Date.now(),
            }));
          // Sort by timestamp (newest first), then merge with existing
          const allArticles = [...newArticles, ...prev];
          return allArticles.sort((a, b) => {
            const aTime = (a as any).timestamp || 0;
            const bTime = (b as any).timestamp || 0;
            return bTime - aTime; // Newest first
          });
        });
        
        onKbArticlesUpdate(articles, intent, confidence);
      };
      
      // Store callback to clear KB articles and utterances (for restart functionality)
      (window as any).__clearKbArticles = () => {
        console.log('[AgentAssistPanel] 🗑️ Clearing KB articles and utterances');
        setKbArticles([]);
        setUtterances([]);
      };
    }
    
    return () => {
      delete (window as any).__updateKbArticles;
      delete (window as any).__clearKbArticles;
    };
  }, [onKbArticlesUpdate]);

  // Listen to SSE for transcript and KB updates
  // Always listen when interactionId is available, even if collapsed (so data is ready when expanded)
  // Skip SSE if useSse is false (demo mode)
  useEffect(() => {
    if (!useSse) {
      console.log('[AgentAssistPanel] SSE disabled (demo mode)');
      return;
    }
    
    if (!interactionId) {
      console.log('[AgentAssistPanel] SSE not starting - no interactionId');
      return;
    }

    // Store eventSource in a ref to prevent recreation on every render
    let eventSource: EventSource | null = null;

    // Task 1.1: Enhanced logging for SSE connection callId
    console.log('[AgentAssistPanel] Starting SSE connection', { 
      interactionId, 
      isCollapsed,
      timestamp: new Date().toISOString()
    });
    console.log('[DEBUG] SSE connection established with callId:', interactionId, {
      callIdType: typeof interactionId,
      callIdLength: interactionId?.length || 0,
      isEmpty: !interactionId || interactionId.trim().length === 0,
      isDefault: interactionId === 'test-call-123',
      timestamp: new Date().toISOString(),
    });
    const url = `/api/events/stream?callId=${encodeURIComponent(interactionId)}`;
    console.log('[DEBUG] SSE URL:', url);
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      // Clear any pending error timeout since connection is now open
      if ((eventSource as any)._errorTimeout) {
        clearTimeout((eventSource as any)._errorTimeout);
        delete (eventSource as any)._errorTimeout;
      }
      
      // Only set connected to true when connection is actually OPEN
      if (eventSource.readyState === EventSource.OPEN) {
        console.log('[AgentAssistPanel] ✅ SSE connection opened', {
          interactionId,
          readyState: eventSource.readyState, // Should be 1 (OPEN)
          timestamp: new Date().toISOString()
        });
        setWsConnected(true);
        setHealthStatus('healthy');
        onConnectionStateChangeRef.current?.(true, eventSource.readyState);
      }
    };

    eventSource.onerror = (err) => {
      const readyState = eventSource.readyState;
      // EventSource readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
      console.log('[AgentAssistPanel] SSE connection error event', {
        interactionId,
        readyState,
        readyStateName: readyState === 0 ? 'CONNECTING' : readyState === 1 ? 'OPEN' : 'CLOSED',
        error: err,
        timestamp: new Date().toISOString()
      });

      // Only show disconnected if connection is actually closed AND it's been closed for a while
      // EventSource fires onerror during initial connection attempts, which is normal
      if (readyState === EventSource.CLOSED) {
        // Don't immediately show error - EventSource might be retrying
        // Only show error if it stays closed for more than 3 seconds
        const errorTimeout = setTimeout(() => {
          // Double-check it's still closed after delay
          if (eventSource.readyState === EventSource.CLOSED) {
            console.error('[AgentAssistPanel] ❌ SSE connection closed (persistent)', {
              interactionId,
              readyState,
              timestamp: new Date().toISOString()
            });
            setWsConnected(false);
            setHealthStatus('error');
            onConnectionStateChangeRef.current?.(false, readyState);
          }
        }, 3000); // Wait 3 seconds before showing error
        
        // Store timeout to clear if connection recovers
        (eventSource as any)._errorTimeout = errorTimeout;
      } else {
        // Clear any pending error timeout
        if ((eventSource as any)._errorTimeout) {
          clearTimeout((eventSource as any)._errorTimeout);
          delete (eventSource as any)._errorTimeout;
        }
        // Still connecting (0) or open (1) - EventSource will auto-retry
        // Don't show error yet, just log for debugging
        console.warn('[AgentAssistPanel] ⚠️ SSE connection issue (auto-retrying)', {
          interactionId,
          readyState,
          readyStateName: readyState === 0 ? 'CONNECTING' : 'OPEN',
          note: 'EventSource will automatically retry connection'
        });
        // Keep wsConnected as true if it was already open, or don't change it if connecting
        if (readyState === EventSource.OPEN) {
          // Connection is actually open, keep connected
          setWsConnected(true);
          setHealthStatus('healthy');
        }
      }
    };

    eventSource.addEventListener('transcript_line', (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventCallId = data.callId || data.interaction_id || data.interactionId;
        
        console.log('[AgentAssistPanel] 📥 Received transcript_line event', {
          eventCallId,
          expectedCallId: interactionId,
          matches: eventCallId === interactionId || !eventCallId,
          hasText: !!data.text,
          text: data.text?.substring(0, 50),
          seq: data.seq,
          speaker: data.speaker || 'not provided',
          timestamp: new Date().toISOString(),
        });
        
        // Skip system messages
        if (data.text && (data.text.includes('Connected to realtime stream') || data.text.includes('clientId:') || data.callId === 'system')) {
          console.log('[AgentAssistPanel] Skipping system message');
          return;
        }
        
        // Fix 1.3: Enhanced callId matching with fallbacks
        // Match callId - must match exactly or be missing (assume it's for this interaction)
        let callIdMatches = !eventCallId || eventCallId === interactionId;
        
        // Fix 1.3: Fallback matching - try case-insensitive and trimmed comparison
        if (!callIdMatches && eventCallId && interactionId) {
          const normalizedEventCallId = String(eventCallId).trim().toLowerCase();
          const normalizedInteractionId = String(interactionId).trim().toLowerCase();
          callIdMatches = normalizedEventCallId === normalizedInteractionId;
          
          if (callIdMatches) {
            console.log('[AgentAssistPanel] ✅ CallId matched after normalization', {
              eventCallId,
              interactionId,
              normalizedEventCallId,
              normalizedInteractionId,
            });
          }
        }
        
        // Fix 1.3: Additional fallback - check if eventCallId contains interactionId or vice versa
        if (!callIdMatches && eventCallId && interactionId) {
          const eventCallIdStr = String(eventCallId).trim();
          const interactionIdStr = String(interactionId).trim();
          if (eventCallIdStr.includes(interactionIdStr) || interactionIdStr.includes(eventCallIdStr)) {
            console.warn('[AgentAssistPanel] ⚠️ CallId partial match detected - using fallback matching', {
              eventCallId: eventCallIdStr,
              interactionId: interactionIdStr,
              note: 'This is a fallback match - exact match preferred',
            });
            callIdMatches = true; // Allow partial match as fallback
          }
        }
        
        if (!callIdMatches) {
          console.warn('[AgentAssistPanel] ⚠️ CallId mismatch - skipping transcript', {
            eventCallId,
            expectedCallId: interactionId,
            eventCallIdType: typeof eventCallId,
            interactionIdType: typeof interactionId,
            suggestion: 'Check if UI is connected with the correct callId. Update interactionId prop or wait for auto-discovery.',
          });
          return;
        }
        
        if (callIdMatches && data.text && data.text.trim().length > 0) {
          // Determine speaker from data.speaker field or text prefix
          let speaker: 'agent' | 'customer' = 'customer'; // Default
          let text = data.text;
          
          // Priority 1: Use data.speaker if provided
          if (data.speaker) {
            speaker = data.speaker.toLowerCase() === 'agent' ? 'agent' : 'customer';
            text = text.trim();
          } 
          // Priority 2: Check for speaker prefix in text (case-insensitive)
          else if (text.match(/^Agent:\s*/i)) {
            speaker = 'agent';
            text = text.replace(/^Agent:\s*/i, '').trim();
          } else if (text.match(/^Customer:\s*/i)) {
            speaker = 'customer';
            text = text.replace(/^Customer:\s*/i, '').trim();
          } else {
            // Default to customer if no speaker info
            speaker = 'customer';
            text = text.trim();
          }
          
          // Only add if we have actual text content
          if (!text || text.length === 0) {
            console.log('[AgentAssistPanel] Skipping empty text after processing');
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
          
          console.log('[AgentAssistPanel] ✅ Adding utterance', {
            utterance_id: utterance.utterance_id,
            speaker: utterance.speaker,
            textLength: utterance.text.length,
            textPreview: utterance.text.substring(0, 50),
            timestamp: new Date().toISOString(),
          });
          
          setUtterances(prev => {
            // Check for duplicates by seq or utterance_id
            const exists = prev.some(u => 
              u.utterance_id === utterance.utterance_id || 
              (data.seq && u.utterance_id === data.seq.toString())
            );
            if (exists) {
              console.log('[AgentAssistPanel] ⏭️ Skipping duplicate utterance', {
                utterance_id: utterance.utterance_id,
                seq: data.seq
              });
              return prev;
            }
            console.log('[AgentAssistPanel] ✅ Adding new utterance', {
              utterance_id: utterance.utterance_id,
              totalCount: prev.length + 1,
              speaker: utterance.speaker
            });
            return [...prev, utterance];
          });
          onTranscriptEventRef.current?.(utterance);
          emitTelemetryRef.current?.('transcript_generated', {
            interaction_id: interactionId,
            utterance_id: utterance.utterance_id,
            speaker: utterance.speaker,
            confidence: utterance.confidence,
            timestamp: utterance.timestamp,
            latency_ms: 2000, // Simulated
          });
        } else {
          console.log('[AgentAssistPanel] Skipping transcript_line', {
            reason: !callIdMatches ? 'callId mismatch' : !data.text ? 'no text' : 'unknown',
            eventCallId: data.callId,
            expectedCallId: interactionId,
            hasText: !!data.text,
          });
        }
      } catch (err) {
        console.error('[AgentAssistPanel] Failed to parse transcript_line', err, event.data);
      }
    });

    // Handle call_end event - trigger disposition generation
    eventSource.addEventListener('call_end', async (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventCallId = data.callId || data.interaction_id || data.interactionId;
        
        console.log('[AgentAssistPanel] 📞 Call ended event received', {
          eventCallId,
          expectedCallId: interactionId,
          matches: eventCallId === interactionId || !eventCallId,
        });

        // Only process if callId matches
        if (!eventCallId || eventCallId === interactionId) {
          // Trigger disposition generation via API
          try {
            const response = await fetch(`/api/calls/end`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                interactionId: interactionId || eventCallId,
              }),
            });

            if (response.ok) {
              const result = await response.json();
              console.log('[AgentAssistPanel] ✅ Disposition generated', {
                interactionId,
                hasDisposition: !!result.disposition,
              });

              // If disposition was generated, set disposition data directly
              if (result.disposition) {
                // Convert disposition result to DispositionData format
                const firstDisposition = result.disposition.suggestedDispositions?.[0];
                const dispositionData: DispositionData = {
                  dispositionId: firstDisposition?.mappedId?.toString() || firstDisposition?.mappedCode || 'unknown',
                  dispositionTitle: firstDisposition?.mappedTitle || firstDisposition?.originalLabel || 'Unknown',
                  confidence: firstDisposition?.confidence || firstDisposition?.score || 0,
                  subDispositions: firstDisposition?.subDisposition ? [
                    {
                      id: firstDisposition?.subDispositionId?.toString() || '1',
                      title: firstDisposition?.subDisposition || 'Unknown',
                    }
                  ] : undefined,
                  autoNotes: [
                    result.disposition.issue,
                    result.disposition.resolution,
                    result.disposition.nextSteps,
                  ].filter(Boolean).join('\n\n'),
                };

                // Set disposition data to trigger modal
                setDispositionData(dispositionData);
                setDispositionNotes(dispositionData.autoNotes);
                setSelectedDisposition(dispositionData.dispositionId);
                
                console.log('[AgentAssistPanel] ✅ Set disposition data from call_end event', {
                  interactionId,
                  dispositionId: dispositionData.dispositionId,
                  dispositionTitle: dispositionData.dispositionTitle,
                });
              }
            } else {
              console.error('[AgentAssistPanel] Failed to generate disposition', {
                status: response.status,
                interactionId,
              });
            }
          } catch (error: any) {
            console.error('[AgentAssistPanel] Error generating disposition', {
              error: error.message,
              interactionId,
            });
          }
        }
      } catch (err) {
        console.error('[AgentAssistPanel] Failed to parse call_end event', err, event.data);
      }
    });

    eventSource.addEventListener('intent_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventCallId = data.callId || data.interaction_id || data.interactionId;
        
        // CRITICAL FIX: Check callId match before processing (same as transcript_line)
        const callIdMatches = !eventCallId || eventCallId === interactionId;
        
        if (!callIdMatches) {
          console.warn('[AgentAssistPanel] ⚠️ Intent update callId mismatch - skipping', {
            eventCallId,
            expectedCallId: interactionId,
            intent: data.intent,
            articlesCount: data.articles?.length || 0,
            suggestion: 'Check if UI is connected with the correct callId. Update interactionId prop or wait for auto-discovery.',
          });
          return;
        }
        
        console.log('[AgentAssistPanel] 📥 Received intent_update event', {
          eventCallId,
          expectedCallId: interactionId,
          matches: callIdMatches,
          intent: data.intent,
          confidence: data.confidence,
          articlesCount: data.articles?.length || 0,
          timestamp: new Date().toISOString(),
        });
        
        if (callIdMatches && data.articles && Array.isArray(data.articles)) {
          // Attach intent information to articles
          const articlesWithIntent = data.articles.map((article: KBArticle) => ({
            ...article,
            intent: data.intent || article.intent, // Use intent from event or article
            intentConfidence: data.confidence || article.intentConfidence, // Use confidence from event or article
          }));
          
          setKbArticles(prev => {
            const existingIds = new Set(prev.map(a => a.id));
            const newArticles = articlesWithIntent
              .filter((a: KBArticle) => !existingIds.has(a.id))
              .map((a: KBArticle) => ({
                ...a,
                timestamp: Date.now(), // Add timestamp for sorting
              }));
            // Sort by timestamp (newest first), then merge with existing
            const allArticles = [...newArticles, ...prev];
            return allArticles.sort((a, b) => {
              const aTime = (a as any).timestamp || 0;
              const bTime = (b as any).timestamp || 0;
              return bTime - aTime; // Newest first
            });
          });
          
          articlesWithIntent.forEach((article: KBArticle) => {
            emitTelemetryRef.current?.('kb_suggestion_shown', {
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
      console.log('[AgentAssistPanel] Closing SSE connection', { 
        interactionId,
        readyState: eventSource.readyState,
        timestamp: new Date().toISOString()
      });
      eventSource.close();
      setWsConnected(false);
      onConnectionStateChangeRef.current?.(false, EventSource.CLOSED);
    };
  }, [interactionId, useSse]); // CRITICAL FIX: Only depend on interactionId and useSse to prevent connection churn

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

  // Handle divider drag
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dividerRef.current?.parentElement) return;
      
      const container = dividerRef.current.parentElement;
      const containerRect = container.getBoundingClientRect();
      const y = e.clientY - containerRect.top;
      const containerHeight = containerRect.height;
      
      // Calculate percentage (with min/max constraints)
      const percentage = Math.max(20, Math.min(80, (y / containerHeight) * 100));
      setKbHeight(percentage);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

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
      // Add timestamp and sort by latest
      const resultsWithTimestamp = results.map((r: KBArticle) => ({
        ...r,
        timestamp: Date.now(),
      }));
      setKbArticles(resultsWithTimestamp.sort((a: any, b: any) => {
        const aTime = a.timestamp || 0;
        const bTime = b.timestamp || 0;
        return bTime - aTime; // Newest first
      }));
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
      // Add timestamp and sort by latest
      const resultsWithTimestamp = results.map((r: KBArticle) => ({
        ...r,
        timestamp: Date.now(),
      }));
      setKbArticles(resultsWithTimestamp.sort((a: any, b: any) => {
        const aTime = a.timestamp || 0;
        const bTime = b.timestamp || 0;
        return bTime - aTime; // Newest first
      }));
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
      
      console.log('[AgentAssistPanel] 📝 Fetching disposition summary', {
        interactionId,
        utterancesCount: utterances.length,
        timestamp: new Date().toISOString(),
      });
      
      fetchDispositionSummary(interactionId)
        .then(data => {
          const latency = Date.now() - startTime;
          
          // Log the received data, especially notes
          console.log('[AgentAssistPanel] ✅ Received disposition data', {
            interactionId,
            dispositionId: data.dispositionId,
            dispositionTitle: data.dispositionTitle,
            confidence: data.confidence,
            hasAutoNotes: !!data.autoNotes,
            autoNotesLength: data.autoNotes?.length || 0,
            autoNotesPreview: data.autoNotes?.substring(0, 100) || 'N/A',
            latency_ms: latency,
            timestamp: new Date().toISOString(),
          });
          
          // Ensure notes are set, with fallback for empty/undefined
          const notes = data.autoNotes || '';
          console.log('[AgentAssistPanel] 📝 Setting disposition notes', {
            notesLength: notes.length,
            notesPreview: notes.substring(0, 100),
            isEmpty: !notes || notes.trim().length === 0,
          });
          
          setDispositionData(data);
          setDispositionNotes(notes);
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
          console.error('[AgentAssistPanel] ❌ Failed to fetch disposition', {
            interactionId,
            error: err,
            message: err?.message || String(err),
            timestamp: new Date().toISOString(),
          });
          setHealthStatus('error');
        })
        .finally(() => {
          setIsLoadingDisposition(false);
        });
    }
  }, [isCallActive, utterances, dispositionData, fetchDispositionSummary, interactionId, emitTelemetry]);

  // Function to fetch sub-dispositions for a given disposition
  const fetchSubDispositions = useCallback(async (dispositionId: string) => {
    if (!dispositionId) {
      setAllSubDispositions([]);
      lastFetchedDispositionIdRef.current = null;
      return;
    }
    
    // Avoid fetching if we already have data for this disposition
    if (lastFetchedDispositionIdRef.current === dispositionId) {
      console.log('[AgentAssistPanel] ⏭️ Skipping fetch - already fetched sub-dispositions for', { dispositionId });
      return;
    }
    
    setIsLoadingSubDispositions(true);
    lastFetchedDispositionIdRef.current = dispositionId;
    
    try {
      console.log('[AgentAssistPanel] 📋 Fetching sub-dispositions for disposition', { dispositionId });
      
      // Try to get the disposition code from allDispositions
      const disposition = allDispositions.find(d => d.id.toString() === dispositionId);
      const dispositionCode = disposition?.code;
      
      let url = `/api/sub-dispositions?dispositionId=${dispositionId}`;
      if (dispositionCode) {
        url += `&dispositionCode=${encodeURIComponent(dispositionCode)}`;
      }
      
      const response = await fetch(url);
      const payload = await response.json();
      
      if (payload.ok && Array.isArray(payload.subDispositions)) {
        const subDispositions = payload.subDispositions.map((sd: any) => ({
          id: sd.id || sd.code,
          code: sd.code || '',
          title: sd.title || sd.label || '',
          label: sd.label || sd.title || '',
        }));
        console.log('[AgentAssistPanel] ✅ Loaded sub-dispositions', { 
          count: subDispositions.length,
          dispositionId 
        });
        // Always set the new sub-dispositions (don't preserve old ones to avoid flickering)
        setAllSubDispositions(subDispositions);
      } else {
        console.warn('[AgentAssistPanel] Failed to fetch sub-dispositions', payload);
        setAllSubDispositions([]);
      }
    } catch (err) {
      console.error('[AgentAssistPanel] Error fetching sub-dispositions', err);
      setAllSubDispositions([]);
    } finally {
      setIsLoadingSubDispositions(false);
    }
  }, [allDispositions]);

  // Fetch all dispositions when dispositionData is available
  useEffect(() => {
    if (dispositionData && allDispositions.length === 0) {
      const fetchAllDispositions = async () => {
        try {
          console.log('[AgentAssistPanel] 📋 Fetching all dispositions from API');
          const response = await fetch(`/api/dispositions?tenantId=${tenantId}`);
          const payload = await response.json();
          
          if (payload.ok && Array.isArray(payload.dispositions)) {
            const dispositions = payload.dispositions.map((d: any) => ({
              id: d.id || d.code,
              code: d.code || '',
              title: d.title || d.label || '',
              label: d.label || d.title || '',
            }));
            console.log('[AgentAssistPanel] ✅ Loaded all dispositions', { count: dispositions.length });
            setAllDispositions(dispositions);
            
            // Fetch sub-dispositions for the recommended disposition
            if (dispositionData.dispositionId) {
              // Reset the ref to allow fetching
              lastFetchedDispositionIdRef.current = null;
              await fetchSubDispositions(dispositionData.dispositionId);
            }
          } else {
            console.warn('[AgentAssistPanel] Failed to fetch all dispositions', payload);
          }
        } catch (err) {
          console.error('[AgentAssistPanel] Error fetching all dispositions', err);
        }
      };
      
      fetchAllDispositions();
    } else if (dispositionData && allDispositions.length > 0 && dispositionData.dispositionId) {
      // If we already have dispositions but haven't fetched sub-dispositions for this disposition yet
      if (lastFetchedDispositionIdRef.current !== dispositionData.dispositionId) {
        lastFetchedDispositionIdRef.current = null;
        fetchSubDispositions(dispositionData.dispositionId);
      }
    }
  }, [dispositionData?.dispositionId, tenantId, allDispositions.length, fetchSubDispositions]);

  // Pre-select recommended sub-disposition when it becomes available (only once)
  useEffect(() => {
    if (dispositionData?.subDispositions && 
        dispositionData.subDispositions.length > 0 && 
        allSubDispositions.length > 0 &&
        selectedSubDispositions.length === 0) {
      const recommendedSubId = dispositionData.subDispositions[0].id;
      const subExists = allSubDispositions.some(sd => sd.id.toString() === recommendedSubId);
      
      if (subExists) {
        console.log('[AgentAssistPanel] ✅ Pre-selecting recommended sub-disposition', { recommendedSubId });
        setSelectedSubDispositions([recommendedSubId]);
      }
    }
  }, [dispositionData?.subDispositions, allSubDispositions.length, selectedSubDispositions.length]);

  // Sync notes with dispositionData when it changes
  useEffect(() => {
    if (dispositionData && dispositionData.autoNotes) {
      // Only update if notes are different to avoid unnecessary re-renders
      if (dispositionNotes !== dispositionData.autoNotes) {
        console.log('[AgentAssistPanel] 🔄 Syncing notes from dispositionData', {
          currentNotesLength: dispositionNotes.length,
          newNotesLength: dispositionData.autoNotes.length,
          newNotesPreview: dispositionData.autoNotes.substring(0, 100),
        });
        setDispositionNotes(dispositionData.autoNotes);
      }
    }
  }, [dispositionData, dispositionNotes]);

  // Log when dispositionNotes state changes
  useEffect(() => {
    if (dispositionData) {
      console.log('[AgentAssistPanel] 📋 Disposition notes state updated', {
        notesLength: dispositionNotes.length,
        notesPreview: dispositionNotes.substring(0, 100),
        isEmpty: !dispositionNotes || dispositionNotes.trim().length === 0,
        hasDispositionData: !!dispositionData,
        dispositionDataHasNotes: !!dispositionData.autoNotes,
      });
    }
  }, [dispositionNotes, dispositionData]);

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
          aria-label="Expand Agent Copilot panel"
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
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <h2 className="text-sm font-semibold text-gray-900">Agent Copilot</h2>
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
          aria-label="Collapse Agent Copilot panel"
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
                    onChange={(e) => {
                      const newDispositionId = e.target.value;
                      setSelectedDisposition(newDispositionId);
                      // Clear current sub-disposition selection when disposition changes
                      setSelectedSubDispositions([]);
                      // Fetch sub-dispositions for the selected disposition
                      fetchSubDispositions(newDispositionId);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {allDispositions.length > 0 ? (
                      allDispositions.map((disp) => (
                        <option key={disp.id} value={disp.id.toString()}>
                          {disp.title || disp.label} {disp.id.toString() === dispositionData.dispositionId ? `(${formatConfidence(dispositionData.confidence)})` : ''}
                        </option>
                      ))
                    ) : (
                      <option value={dispositionData.dispositionId}>
                        {dispositionData.dispositionTitle} ({formatConfidence(dispositionData.confidence)})
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Sub-Disposition
                  </label>
                  <select
                    value={selectedSubDispositions[0] || ''}
                    onChange={(e) => {
                      const newSubDispositionId = e.target.value;
                      if (newSubDispositionId) {
                        setSelectedSubDispositions([newSubDispositionId]);
                      } else {
                        setSelectedSubDispositions([]);
                      }
                    }}
                    disabled={isLoadingSubDispositions || !selectedDisposition}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {isLoadingSubDispositions 
                        ? 'Loading sub-dispositions...' 
                        : allSubDispositions.length === 0 
                        ? 'No sub-dispositions available' 
                        : 'Select a sub-disposition'}
                    </option>
                    {allSubDispositions.map((sub) => {
                      const isRecommended = dispositionData.subDispositions?.some(
                        rec => rec.id === sub.id.toString()
                      );
                      return (
                        <option key={sub.id} value={sub.id.toString()}>
                          {sub.title || sub.label} {isRecommended ? '(Recommended)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Notes <span className="text-gray-500 text-xs">(AI-generated, editable)</span>
                  </label>
                  <textarea
                    value={dispositionNotes || ''}
                    onChange={(e) => {
                      console.log('[AgentAssistPanel] 📝 Notes changed by user', {
                        newLength: e.target.value.length,
                        preview: e.target.value.substring(0, 50),
                      });
                      setDispositionNotes(e.target.value);
                    }}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={dispositionNotes ? "Edit notes..." : "Auto-generated notes will appear here..."}
                  />
                  {!dispositionNotes || dispositionNotes.trim().length === 0 ? (
                    <p className="mt-1 text-xs text-gray-500 italic">
                      Notes are being generated. If they don't appear, try clicking Retry.
                    </p>
                  ) : null}
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
          <div className="flex flex-col h-full min-h-0">
            {/* Manual KB Search - Always Visible */}
            <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                  placeholder="Search KB..."
                  className="w-full pl-8 pr-8 h-9 rounded-md border border-gray-300 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  style={{ color: '#111827' }}
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

            {/* Container for KB and Transcripts with draggable divider */}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* KB Suggestions Section - Dynamic height based on drag */}
              <div 
                className="flex flex-col min-h-0 overflow-hidden"
                style={{ height: `${kbHeight}%` }}
              >
                <div className="px-4 py-2.5 border-b border-gray-200 flex-shrink-0">
                  <span className="text-sm font-semibold text-gray-900">Knowledge Base Suggestions</span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 min-h-0">
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
                              className="p-1.5 hover:bg-green-50 rounded transition-colors group"
                              aria-label={`Like: ${article.title}`}
                            >
                              <svg className="w-4 h-4 text-gray-600 group-hover:text-green-600 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => handleFeedback(article.id, false)}
                              className="p-1.5 hover:bg-red-50 rounded transition-colors group"
                              aria-label={`Dislike: ${article.title}`}
                            >
                              <svg className="w-4 h-4 text-gray-600 group-hover:text-red-600 transition-colors" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(180deg)' }}>
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

              {/* Draggable Divider */}
              <div
                ref={dividerRef}
                onMouseDown={handleDividerMouseDown}
                className={`flex-shrink-0 h-1 bg-gray-200 hover:bg-blue-400 cursor-row-resize transition-colors ${
                  isDragging ? 'bg-blue-500' : ''
                }`}
                style={{ userSelect: 'none' }}
                title="Drag to resize"
              >
                <div className="h-full w-full flex items-center justify-center">
                  <div className="w-12 h-0.5 bg-gray-400 rounded"></div>
                </div>
              </div>

              {/* Transcripts Section - Dynamic height based on drag */}
              <div 
                className="flex flex-col min-h-0 overflow-hidden"
                style={{ height: `${100 - kbHeight}%` }}
              >
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
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import AgentAssistPanelV2, { KBArticle, DispositionData } from '@/components/AgentAssistPanelV2';
import { Customer } from '@/components/CustomerDetailsHeader';
import CentralCallView from '@/components/CentralCallView';
import LeftSidebar from '@/components/LeftSidebar';
import LiveTranscriptPanel from '@/components/LiveTranscriptPanel';
import ToastContainer from '@/components/ToastContainer';
import { useRealtimeTranscript } from '@/hooks/useRealtimeTranscript';

// Mock customer data for live (would come from API in production)
const mockCustomer: Customer = {
  name: 'Manish Sharma',
  id: 'cust-789',
  masked_phone: '+91-XXXX-1234',
  account: 'MoneyAssure — Card Services',
  tags: ['Premium', 'Card'],
  email: 'manish.sharma@example.com',
  lastInteractions: [
    { date: '2025-10-29', summary: 'Payment issue resolved', caseId: 'CASE-1234' },
    { date: '2025-09-12', summary: 'KYC updated', caseId: 'CASE-5678' },
    { date: '2025-07-21', summary: 'Plan upgrade', caseId: 'CASE-9012' },
  ],
};

export default function LivePage() {
  const [callId, setCallId] = useState<string>('');
  const [tenantId] = useState('default');
  const [viewMode, setViewMode] = useState<'agent-assist' | 'disposition'>('agent-assist');
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [dispositionData, setDispositionData] = useState<{
    suggested: Suggestion[];
    autoNotes: string;
  } | null>(null);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);

  // Auto-discovery state (from test-agent-assist pattern)
  const [lastDiscoveredCallId, setLastDiscoveredCallId] = useState<string | null>(null);
  const [isAutoDiscovering, setIsAutoDiscovering] = useState(true);
  
  // Retry state for exponential backoff
  const discoveryRetryCountRef = useRef(0);
  const isDiscoveryPausedRef = useRef(false);
  const lastSuccessTimeRef = useRef<number>(Date.now());

  // CRITICAL: Read callId from URL parameter FIRST (before auto-discovery)
  // This ensures manual callId from URL takes precedence over auto-discovery
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCallId = params.get('callId');
    
    if (urlCallId && urlCallId.trim().length > 0) {
      const trimmedCallId = urlCallId.trim();
      console.log('[Live] 🎯 Using callId from URL parameter:', trimmedCallId);
      setCallId(trimmedCallId);
      setLastDiscoveredCallId(trimmedCallId);
      setIsAutoDiscovering(false); // Disable auto-discovery when URL param is set
    } else {
      console.log('[Live] No URL parameter provided, will use auto-discovery');
      setIsAutoDiscovering(true);
    }
  }, []); // Run once on mount only

  // Auto-discover active calls silently in background
  // Copied from test-agent-assist with exponential backoff
  useEffect(() => {
    const discoverActiveCalls = async () => {
      // Check if URL has callId parameter - don't override it
      const params = new URLSearchParams(window.location.search);
      const urlCallId = params.get('callId');
      const hasUrlCallId = urlCallId && urlCallId.trim().length > 0;
      
      // If URL has callId, skip auto-discovery (user explicitly set it)
      if (hasUrlCallId) {
        console.debug('[Live] URL parameter present, skipping auto-discovery');
        discoveryRetryCountRef.current = 0;
        isDiscoveryPausedRef.current = false;
        return;
      }

      // If discovery is paused due to repeated failures, skip
      if (isDiscoveryPausedRef.current) {
        return;
      }

      // Comprehensive error handling with exponential backoff
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch('/api/calls/active?limit=10', {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // Reset retry count on success
        discoveryRetryCountRef.current = 0;
        isDiscoveryPausedRef.current = false;
        lastSuccessTimeRef.current = Date.now();
        
        // Handle non-OK responses gracefully
        if (!response.ok) {
          if (response.status === 503) {
            console.debug('[Live] Service unavailable (503), skipping auto-discovery');
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check if response has content before parsing
        const text = await response.text();
        if (!text || text.trim().length === 0) {
          console.debug('[Live] Empty response from /api/calls/active');
          return;
        }
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          console.error('[Live] Failed to parse JSON response:', parseError);
          return;
        }
        
        if (data.ok && data.calls && data.calls.length > 0) {
          const mostRecentCall = data.calls[0];
          
          if (mostRecentCall && mostRecentCall.interactionId) {
            const interactionId = mostRecentCall.interactionId;
            
            // Use functional updates to avoid stale closures
            setLastDiscoveredCallId(currentLast => {
              if (interactionId !== currentLast) {
                console.log('[Live] 🎯 Auto-discovered call:', {
                  interactionId,
                  status: mostRecentCall.status,
                  lastActivity: new Date(mostRecentCall.lastActivity).toISOString(),
                });
                
                setCallId(prevCallId => {
                  if (prevCallId === interactionId) {
                    return prevCallId; // No change needed
                  }
                  console.log('[Live] ✅ CallId updated - SSE will reconnect with new callId:', interactionId);
                  return interactionId;
                });
                
                return interactionId;
              }
              return currentLast;
            });
          } else if (data.latestCall && data.latestCall.trim && data.latestCall.trim().length > 0) {
            setLastDiscoveredCallId(currentLast => {
              if (data.latestCall !== currentLast) {
                console.log('[Live] 🎯 Auto-discovered new call (via latestCall):', data.latestCall);
                setCallId(data.latestCall);
                return data.latestCall;
              }
              return currentLast;
            });
          }
        } else {
          console.debug('[Live] No active calls found, keeping current callId');
        }
      } catch (err: any) {
        // Handle timeout and network errors with exponential backoff
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          const newRetryCount = discoveryRetryCountRef.current + 1;
          discoveryRetryCountRef.current = newRetryCount;
          
          if (newRetryCount >= 3) {
            console.warn('[Live] Request timeout when fetching active calls (5s)', {
              retryCount: newRetryCount,
              note: newRetryCount >= 5 
                ? 'Auto-discovery paused temporarily. Will retry with backoff.' 
                : 'Auto-discovery will retry with backoff.',
            });
            
            // Pause discovery for 30 seconds after 5 consecutive failures
            if (newRetryCount >= 5) {
              isDiscoveryPausedRef.current = true;
              setTimeout(() => {
                isDiscoveryPausedRef.current = false;
                discoveryRetryCountRef.current = 0;
                console.debug('[Live] Auto-discovery resumed after pause');
              }, 30000);
            }
          } else {
            console.debug('[Live] Request timeout, retrying...', { retryCount: newRetryCount });
          }
        } else {
          console.error('[Live] Failed to discover active calls:', {
            error: err.message || String(err),
            errorName: err.name,
          });
        }
      }
    };

    // Initial discovery
    discoverActiveCalls();

    // Dynamic polling with exponential backoff
    let timeoutId: NodeJS.Timeout;
    
    const scheduleNextPoll = () => {
      const baseInterval = 5000; // 5 seconds base
      const retryCount = discoveryRetryCountRef.current;
      
      // Calculate backoff: 5s, 7.5s, 10s, 12.5s, 15s (max)
      const backoffMultiplier = retryCount === 0 ? 1 : Math.min(1 + retryCount * 0.5, 3);
      const pollInterval = baseInterval * backoffMultiplier;
      
      timeoutId = setTimeout(() => {
        discoverActiveCalls();
        scheduleNextPoll();
      }, pollInterval);
    };
    
    scheduleNextPoll();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []); // Empty dependency array - use functional updates

  // Subscribe to transcripts when callId changes
  useEffect(() => {
    if (!callId || callId.trim().length === 0) {
      return;
    }

    console.log('[Live] Subscribing to transcripts for:', callId);
    fetch('/api/transcripts/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId: callId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          console.info('[Live] ✅ Subscribed to transcripts', { interactionId: callId });
        } else {
          console.error('[Live] ❌ Failed to subscribe to transcripts', data);
        }
      })
      .catch(err => {
        console.error('[Live] ❌ Error subscribing to transcripts:', err);
      });
  }, [callId]);

  // CRITICAL: Single hook instance for all events (transcripts, call_end, intent_update)
  // This ensures only ONE EventSource connection
  const { 
    transcripts, 
    isConnected: transcriptConnected, 
    error: transcriptError 
  } = useRealtimeTranscript(
    callId || null,
    {
      autoReconnect: true,
      // Use refs pattern - callbacks won't cause reconnection loop
      onCallEnd: async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Live] 📞 Call ended event received', { callId });
          
          // Trigger disposition generation
          await disposeCall();
        } catch (err) {
          console.error('[Live] Failed to handle call_end event', err);
        }
      },
      onIntentUpdate: (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Live] 🎯 Intent update event received', { callId, intent: data.intent });
          
          // Update KB articles if provided
          if (data.articles && Array.isArray(data.articles) && data.articles.length > 0) {
            const articles: KBArticle[] = data.articles.map((article: any) => ({
              id: article.id || article.code || String(Math.random()),
              title: article.title || 'Untitled',
              snippet: article.snippet || '',
              url: article.url,
              confidence: article.score || article.confidence || 0.8,
              intent: data.intent,
              intentConfidence: data.confidence,
            }));
            
            // Update local state
            setKbArticles(prev => {
              const existingIds = new Set(prev.map(a => a.id));
              const newArticles = articles.filter(a => !existingIds.has(a.id));
              return [...newArticles, ...prev];
            });
            
            // Update AgentAssistPanelV2 via window function (when useSse=false)
            if (typeof window !== 'undefined' && (window as any).__updateKbArticles) {
              (window as any).__updateKbArticles(articles, data.intent, data.confidence);
            }
          }
        } catch (err) {
          console.error('[Live] Failed to parse intent_update event', err);
        }
      },
    }
  );

  const disposeCall = async () => {
    if (!callId) return;

    try {
      await fetch('/api/calls/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, tenantId }),
      });
    } catch (err) {
      console.error('[Live] Failed to send call_end', err);
    }

    try {
      const response = await fetch('/api/calls/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, tenantId }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error || 'Failed to generate summary');
      }

      const suggested: Suggestion[] =
        (payload.dispositions || []).map((item: any) => ({
          code: item.mappedCode || item.code || 'GENERAL_INQUIRY',
          title: item.mappedTitle || item.title || 'General Inquiry',
          score: typeof item.score === 'number' ? item.score : 0.5,
          id: typeof item.mappedId === 'number' ? item.mappedId : undefined,
          subDisposition: item.subDisposition || item.sub_disposition || undefined,
          subDispositionId: typeof item.subDispositionId === 'number' ? item.subDispositionId : undefined,
        }));

      const summary = payload.summary || {};
      const autoNotes = [
        summary.issue,
        summary.resolution,
        summary.next_steps,
      ]
        .filter((section: string | undefined) => section && section.trim().length > 0)
        .join('\n\n');

      const dispositionData = {
        suggested: suggested.length > 0 
          ? suggested 
          : [{ code: 'GENERAL_INQUIRY', title: 'General Inquiry', score: 0.1 }],
        autoNotes: autoNotes || 'No notes generated.',
      };

      setDispositionData(dispositionData);
      setViewMode('disposition');
      setDispositionOpen(true);
    } catch (err: any) {
      console.error('[Live] Failed to generate summary', err);
      alert('Failed to generate summary: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleClearCallId = () => {
    setCallId('');
    setLastDiscoveredCallId(null);
    setIsAutoDiscovering(true);
    // Clear URL parameter if present
    const url = new URL(window.location.href);
    url.searchParams.delete('callId');
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Call ID Input with Auto-Discovery Status */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <label htmlFor="callId" className="text-sm font-medium text-gray-700">
            Interaction ID:
          </label>
          <input
            id="callId"
            type="text"
            value={callId}
            onChange={(e) => {
              const newCallId = e.target.value;
              setCallId(newCallId);
              if (newCallId.trim().length > 0) {
                setIsAutoDiscovering(false);
              } else {
                setIsAutoDiscovering(true);
              }
            }}
            placeholder={isAutoDiscovering ? "Auto-discovering active calls..." : "Enter interaction ID manually"}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {callId && (
            <button
              onClick={handleClearCallId}
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300"
              title="Clear and resume auto-discovery"
            >
              Clear
            </button>
          )}
          <button
            onClick={disposeCall}
            disabled={!callId}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            📝 Dispose Call
          </button>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <p className="text-xs text-gray-500">
            {isAutoDiscovering 
              ? '🔄 Auto-discovering active calls...' 
              : callId 
                ? `✅ Connected to: ${callId}` 
                : 'Enter interaction ID manually or wait for auto-discovery'}
          </p>
          {lastDiscoveredCallId && (
            <span className="text-xs text-green-600">
              Last discovered: {lastDiscoveredCallId}
            </span>
          )}
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex h-[calc(100vh-120px)]">
        {/* Left Sidebar */}
        <LeftSidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col pr-[376px]">
          {/* Center Column: Unified Call View */}
          <div className="flex-1 overflow-y-auto p-6">
            <CentralCallView
              customer={callId ? mockCustomer : null}
              callDuration="00:00"
              callId={callId || undefined}
              isCallActive={!!callId}
              onMute={() => console.log('[Live] Mute clicked')}
              onHold={() => console.log('[Live] Hold clicked')}
              onTransfer={() => console.log('[Live] Transfer clicked')}
              onConference={() => console.log('[Live] Conference clicked')}
              onKeypad={() => console.log('[Live] Keypad clicked')}
              onRecord={() => console.log('[Live] Record clicked')}
              onComplete={() => console.log('[Live] Complete clicked')}
              onEndCall={() => console.log('[Live] End call clicked')}
              onOpenCRM={() => {
                console.log('[Live] Open CRM clicked');
                window.open(`https://crm.example.com/customer/${mockCustomer.id}`, '_blank');
              }}
              onOpenCaseHistory={() => {
                console.log('[Live] Open Case History clicked');
                window.open(`https://crm.example.com/cases/${mockCustomer.id}`, '_blank');
              }}
            />
          </div>
        </div>

        {/* Right Column: Transcript Panel + Agent Assist Panel V2 */}
        {callId && viewMode === 'agent-assist' && (
          <div className="fixed right-0 top-[120px] bottom-0 w-[376px] bg-white border-l border-gray-200 flex flex-col">
            {/* Transcript Panel - Receives transcripts from parent hook */}
            <div className="flex-1 overflow-y-auto p-4 border-b border-gray-200">
              <LiveTranscriptPanel 
                transcripts={transcripts}
                isConnected={transcriptConnected}
                error={transcriptError}
              />
            </div>

            {/* Agent Assist Panel V2 - KB Articles Only (useSse=false to prevent duplicate connections) */}
            <div className="flex-1 overflow-y-auto">
              <AgentAssistPanelV2
                agentId="agent-live-123"
                tenantId={tenantId}
                interactionId={callId}
                customer={mockCustomer}
                callDuration="00:00"
                isCallActive={true}
                useSse={false} // CRITICAL: Disable SSE to prevent duplicate connections
                directTranscripts={[]} // Disable transcript rendering (handled by LiveTranscriptPanel)
                triggerKBSearch={async (query, context) => {
                  console.log('[Live] KB search triggered:', { query, context });
                  try {
                    const response = await fetch(`/api/kb/search?q=${encodeURIComponent(query)}&tenantId=${tenantId}&limit=10`);
                    const payload = await response.json();
                    
                    if (payload.ok && Array.isArray(payload.results)) {
                      return payload.results.map((article: any) => ({
                        id: article.id || article.code,
                        title: article.title,
                        snippet: article.snippet || '',
                        confidence: article.score || 0.8,
                        url: article.url,
                      }));
                    }
                    
                    return [];
                  } catch (err) {
                    console.error('[Live] KB search failed', err);
                    return [];
                  }
                }}
                fetchDispositionSummary={async (interactionId) => {
                  console.log('[Live] Fetching disposition for:', interactionId);
                  try {
                    const response = await fetch(`/api/calls/summary`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ callId: interactionId, tenantId }),
                    });
                    const payload = await response.json();
                    return {
                      dispositionId: payload.dispositions?.[0]?.mappedId || 'disposition-1',
                      dispositionTitle: payload.dispositions?.[0]?.mappedTitle || 'General Inquiry',
                      confidence: payload.dispositions?.[0]?.score || 0.5,
                      subDispositions: payload.dispositions?.[0]?.subDisposition ? [{ id: 'sub-1', title: payload.dispositions[0].subDisposition }] : [],
                      autoNotes: payload.summary ? Object.values(payload.summary).filter(Boolean).join('\n\n') : 'No notes generated.',
                    };
                  } catch (err) {
                    console.error('[Live] Failed to fetch disposition', err);
                    throw err;
                  }
                }}
                emitTelemetry={(eventName, payload) => {
                  console.log('[Live] Telemetry:', eventName, payload);
                }}
                onOpenCRM={() => {
                  console.log('[Live] Open CRM clicked');
                  window.open(`https://crm.example.com/customer/${mockCustomer.id}`, '_blank');
                }}
                onOpenCaseHistory={() => {
                  console.log('[Live] Open Case History clicked');
                  window.open(`https://crm.example.com/cases/${mockCustomer.id}`, '_blank');
                }}
                onKbArticlesUpdate={(articles) => {
                  setKbArticles(articles);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Disposition Modal */}
      {dispositionData && (
        <AutoDispositionModal
          open={dispositionOpen}
          onClose={() => {
            setDispositionOpen(false);
            setViewMode('agent-assist');
          }}
          onBack={() => {
            setViewMode('agent-assist');
          }}
          callId={callId}
          tenantId={tenantId}
          suggested={dispositionData.suggested}
          autoNotes={dispositionData.autoNotes}
        />
      )}

      {/* Toast Container */}
      <ToastContainer />
    </div>
  );
}

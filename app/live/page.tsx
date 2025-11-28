'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import AgentAssistPanelV2, { KBArticle, DispositionData } from '@/components/AgentAssistPanelV2';
import { Customer } from '@/components/CustomerDetailsHeader';
import CentralCallView from '@/components/CentralCallView';
import LeftSidebar from '@/components/LeftSidebar';
import ToastContainer from '@/components/ToastContainer';

// Mock customer data for live (would come from API in production)
const mockCustomer: Customer = {
  name: 'Michael Thompson',
  id: 'cust-789',
  masked_phone: '+1 (713) 555-1298',
  account: 'Gexa Energy — Customer Care',
  tags: ['Residential', 'Fixed Rate'],
  email: 'michael.thompson@example.com',
  lastInteractions: [
    { date: '2025-10-29', summary: 'Payment arrangement set and bill updated', caseId: 'CASE-1234' },
    { date: '2025-09-12', summary: 'Account identity verified', caseId: 'CASE-5678' },
    { date: '2025-07-21', summary: 'Customer enrolled in a new fixed-rate plan', caseId: 'CASE-9012' },
  ],
};

// Inner component that uses useSearchParams (must be wrapped in Suspense)
function LivePageContent() {
  const searchParams = useSearchParams();
  // CRITICAL: Read callId from URL parameter immediately (synchronously) - matches simple UI pattern
  const urlCallId = searchParams.get('callId');
  const [callId, setCallId] = useState<string>(urlCallId || '');
  
  const [tenantId] = useState('default');
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [dispositionData, setDispositionData] = useState<{
    suggested: Suggestion[];
    autoNotes: string;
  } | null>(null);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);

  // Auto-discovery state (silent, always enabled)
  const [lastDiscoveredCallId, setLastDiscoveredCallId] = useState<string | null>(null);
  
  // Retry state for exponential backoff
  const discoveryRetryCountRef = useRef(0);
  const isDiscoveryPausedRef = useRef(false);
  const lastSuccessTimeRef = useRef<number>(Date.now());

  // Update callId when URL parameter changes (matches simple UI pattern)
  // If URL has callId, use it (for direct links). Otherwise, auto-discovery handles it.
  useEffect(() => {
    if (urlCallId && urlCallId !== callId) {
      console.log('[Live] Updating callId from URL parameter', { urlCallId, currentCallId: callId });
      setCallId(urlCallId);
      setLastDiscoveredCallId(urlCallId);
    }
  }, [urlCallId, callId]);

  // Auto-discover active calls silently in background
  // Enhanced to fallback to latest call with transcripts for automated API testing
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
        
        // AUTOMATED FIX: Try active calls first, then fallback to latest call with transcripts
        let response = await fetch('/api/calls/active?limit=10', {
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
                  console.log('[Live] ✅ CallId updated - SSE will reconnect immediately with new callId:', {
                    previousCallId: prevCallId || '(empty)',
                    newCallId: interactionId,
                    note: 'useRealtimeTranscript hook will detect the change and reconnect automatically',
                  });
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
                setCallId(prevCallId => {
                  // CRITICAL: Only update if callId actually changed to prevent UI reload
                  if (prevCallId === data.latestCall) {
                    console.debug('[Live] CallId unchanged, skipping update to prevent reload:', data.latestCall);
                    return prevCallId; // No change - prevents reconnection
                  }
                  return data.latestCall;
                });
                return data.latestCall;
              }
              return currentLast;
            });
          }
        } else {
          // AUTOMATED FIX: Fallback to latest call with transcripts
          // This enables automated testing - API sends transcript, UI auto-discovers it
          console.log('[Live] 📊 No active calls found - checking for latest call with transcripts...');
          
          try {
            const latestResponse = await fetch('/api/calls/latest');
            if (latestResponse.ok) {
              const latestData = await latestResponse.json();
              if (latestData.ok && latestData.callId) {
                console.log('[Live] ✅ Found latest call with transcripts:', {
                  callId: latestData.callId,
                  transcriptCount: latestData.transcriptCount,
                  latestActivity: latestData.latestActivity,
                });
                
                setLastDiscoveredCallId(currentLast => {
                  if (latestData.callId !== currentLast) {
                    setCallId(prevCallId => {
                      // CRITICAL: Only update if callId actually changed to prevent UI reload
                      if (prevCallId === latestData.callId) {
                        console.debug('[Live] CallId unchanged, skipping update to prevent reload:', latestData.callId);
                        return prevCallId; // No change - prevents reconnection
                      }
                      console.log('[Live] ✅ CallId updated to latest call:', {
                        previousCallId: prevCallId || '(empty)',
                        newCallId: latestData.callId,
                        note: 'Progressive updates will now flow for this call',
                      });
                      return latestData.callId;
                    });
                    return latestData.callId;
                  }
                  return currentLast;
                });
              } else {
                // No calls found at all - clear callId
                setCallId(prevCallId => {
                  if (prevCallId) {
                    console.log('[Live] 🛑 No calls found anywhere - clearing callId', {
                      previousCallId: prevCallId,
                    });
                    return '';
                  }
                  return prevCallId;
                });
                setLastDiscoveredCallId(null);
              }
            }
          } catch (latestErr) {
            console.debug('[Live] Could not fetch latest call:', latestErr);
            // Clear callId if we can't find any calls
            setCallId(prevCallId => {
              if (prevCallId) {
                console.log('[Live] 🛑 No active calls found - clearing callId', {
                  previousCallId: prevCallId,
                  note: 'This will stop transcript polling for the ended call',
                });
                return '';
              }
              return prevCallId;
            });
            setLastDiscoveredCallId(null);
          }
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
      const baseInterval = 2000; // 2 seconds base (fast auto-discovery for progressive updates)
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
      setDispositionOpen(true);
    } catch (err: any) {
      console.error('[Live] Failed to generate summary', err);
      alert('Failed to generate summary: ' + (err?.message || 'Unknown error'));
    }
  };

  // Auto-discovery is always enabled unless URL param is explicitly set
  // No manual clearing needed - auto-discovery handles everything

  // Handle KB search
  const handleKBSearch = async (query: string, context: { interactionId: string; recentUtterance?: string }): Promise<KBArticle[]> => {
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
      console.error('[Live] KB search API error:', err);
      return [];
    }
  };

  // Handle disposition summary fetch
  const handleDispositionSummary = async (interactionId: string): Promise<DispositionData> => {
    try {
      const response = await fetch('/api/calls/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: interactionId, tenantId }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error || 'Failed to generate summary');
      }

      const suggested = (payload.dispositions || []).map((item: any) => ({
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

      // Update disposition data for modal
      setDispositionData({
        suggested: suggested.length > 0 
          ? suggested 
          : [{ code: 'GENERAL_INQUIRY', title: 'General Inquiry', score: 0.1 }],
        autoNotes: autoNotes || 'No notes generated.',
      });

      return {
        dispositionId: suggested[0]?.id?.toString() || 'disposition-1',
        dispositionTitle: suggested[0]?.title || 'General Inquiry',
        confidence: suggested[0]?.score || 0.5,
        subDispositions: suggested[0]?.subDisposition ? [
          { id: suggested[0].subDispositionId?.toString() || 'sub-1', title: suggested[0].subDisposition }
        ] : [],
        autoNotes: autoNotes || 'No notes generated.',
      };
    } catch (err: any) {
      console.error('[Live] Failed to fetch disposition summary:', err);
      return {
        dispositionId: 'disposition-1',
        dispositionTitle: 'General Inquiry',
        confidence: 0.5,
        subDispositions: [],
        autoNotes: 'Failed to generate notes. Please try again.',
      };
    }
  };

  // Handle KB articles update
  const handleKbArticlesUpdate = (articles: KBArticle[], intent?: string, confidence?: number) => {
    console.log('[Live] KB articles update:', { articlesCount: articles.length, intent, confidence });
    setKbArticles(articles);
  };

  // Handle transcript events
  const handleTranscriptEvent = (event: any) => {
    console.log('[Live] Transcript event:', event);
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Main Layout - Matching test-agent-assist exactly */}
      <div className="flex h-screen">
        {/* Left Sidebar */}
        <LeftSidebar 
          isCallActive={!!callId}
          isPaused={false}
          callEnded={false}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col pr-[376px]">
          {/* Center Column: Unified Call View */}
          <div className="flex-1 overflow-y-auto p-6">
            <CentralCallView
              customer={mockCustomer}
              callDuration="00:00"
              callId={callId || undefined}
              isCallActive={!!callId}
              onMute={() => console.log('[Live] Mute clicked')}
              onHold={() => console.log('[Live] Hold clicked')}
              onTransfer={() => console.log('[Live] Transfer clicked')}
              onConference={() => console.log('[Live] Conference clicked')}
              onKeypad={() => console.log('[Live] Keypad clicked')}
              onRecord={() => console.log('[Live] Record clicked')}
              onComplete={() => {
                console.log('[Live] Complete clicked');
                // Trigger disposition summary fetch
                handleDispositionSummary(callId).then(() => {
                  setDispositionOpen(true);
                });
              }}
              onEndCall={async () => {
                if (!callId) {
                  console.warn('[Live] Cannot end call - no callId');
                  return;
                }
                
                console.log('[Live] End call clicked - generating disposition from current transcript', { callId });
                
                // Store callId in a variable to ensure it's available even if state changes
                const currentCallId = callId;
                
                try {
                  // Call /api/calls/end to mark call as ended
                  await fetch('/api/calls/end', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      interactionId: currentCallId,
                      tenantId,
                    }),
                  }).catch(err => {
                    console.warn('[Live] Failed to send call_end event (non-critical):', err);
                  });

                  // Call /api/calls/summary to generate disposition
                  console.log('[Live] Calling /api/calls/summary', { callId: currentCallId, tenantId });
                  const response = await fetch('/api/calls/summary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      callId: currentCallId, // Use stored callId
                      interactionId: currentCallId, // Also send as interactionId for compatibility
                      tenantId,
                    }),
                  });

                  const result = await response.json();

                  if (!response.ok || !result.ok) {
                    throw new Error(result?.error || 'Failed to generate summary');
                  }

                  // Convert disposition result to DispositionData format
                  const dispositions = result.dispositions || result.mappedDispositions || [];
                  const summary = result.summary || {};
                  
                  // Extract auto notes from summary
                  const autoNotes = [
                    summary.issue,
                    summary.resolution,
                    summary.next_steps,
                  ]
                    .filter((section: string | undefined) => section && section.trim().length > 0)
                    .join('\n\n') || 'No notes generated.';

                  // Set disposition data and open modal
                  setDispositionData({
                    suggested: dispositions.length > 0 
                      ? dispositions.map((item: any) => ({
                          code: item.mappedCode || item.code || 'GENERAL_INQUIRY',
                          title: item.mappedTitle || item.title || 'General Inquiry',
                          score: typeof item.score === 'number' ? item.score : 0.5,
                          id: typeof item.mappedId === 'number' ? item.mappedId : undefined,
                          subDisposition: item.subDisposition || item.sub_disposition || undefined,
                          subDispositionId: typeof item.subDispositionId === 'number' ? item.subDispositionId : undefined,
                        }))
                      : [{ code: 'GENERAL_INQUIRY', title: 'General Inquiry', score: 0.1 }],
                    autoNotes: autoNotes,
                  });
                  setDispositionOpen(true);
                  
                  console.info('[Live] ✅ Disposition generated and modal opened', {
                    callId: currentCallId,
                    hasSummary: !!result.summary,
                    dispositionsCount: dispositions.length,
                    autoNotesLength: autoNotes.length,
                  });
                } catch (err: any) {
                  console.error('[Live] Failed to generate disposition', {
                    callId: currentCallId,
                    error: err.message || String(err),
                  });
                  
                  // Fallback: try to generate using handleDispositionSummary
                  try {
                    await handleDispositionSummary(currentCallId);
                    setDispositionOpen(true);
                  } catch (fallbackErr: any) {
                    console.error('[Live] Fallback disposition generation also failed', {
                      callId: currentCallId,
                      error: fallbackErr.message || String(fallbackErr),
                    });
                  }
                }
              }}
              onOpenCRM={() => {
                console.log('[Live] Open CRM clicked');
                window.open('https://crm.example.com/customer/cust-789', '_blank');
              }}
              onOpenCaseHistory={() => {
                console.log('[Live] Open Case History clicked');
                window.open('https://crm.example.com/cases/cust-789', '_blank');
              }}
            />
          </div>
        </div>

        {/* Right Column: Agent Assist Panel V2 - Right-docked (matching test-agent-assist) */}
        <AgentAssistPanelV2
          agentId="agent-live-123"
          tenantId={tenantId}
          interactionId={callId || ''}
          customer={mockCustomer}
          callDuration="00:00"
          isCallActive={!!callId}
          useSse={!!callId} // Only enable SSE when callId is available
          onKbArticlesUpdate={handleKbArticlesUpdate}
          onTranscriptEvent={handleTranscriptEvent}
          triggerKBSearch={handleKBSearch}
          fetchDispositionSummary={handleDispositionSummary}
          emitTelemetry={(eventName, payload) => {
            console.log('[Live] Telemetry:', eventName, payload);
          }}
          onOpenCRM={() => {
            console.log('[Live] Open CRM clicked');
            window.open('https://crm.example.com/customer/cust-789', '_blank');
          }}
          onOpenCaseHistory={() => {
            console.log('[Live] Open Case History clicked');
            window.open('https://crm.example.com/cases/cust-789', '_blank');
          }}
        />
      </div>

      {/* Disposition Modal */}
      {dispositionData && (
        <AutoDispositionModal
          open={dispositionOpen}
          onClose={() => {
            setDispositionOpen(false);
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

// Export with Suspense wrapper (matches simple UI pattern)
export default function LivePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-4">Loading Live UI...</h1>
          <div className="text-gray-500">Initializing...</div>
        </div>
      </div>
    }>
      <LivePageContent />
    </Suspense>
  );
}

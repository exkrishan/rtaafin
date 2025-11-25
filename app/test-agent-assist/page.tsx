'use client';

import { useState, useEffect, useRef } from 'react';
import LeftSidebar from '@/components/LeftSidebar';
import CentralCallView from '@/components/CentralCallView';
import AgentAssistPanelV2, { Customer, KBArticle, DispositionData } from '@/components/AgentAssistPanelV2';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import ToastContainer from '@/components/ToastContainer';

// Mock customer data for test page (same as demo)
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

export default function TestAgentAssistPage() {
  // Ensure callId is always a string, never undefined
  const [callId, setCallId] = useState<string>('test-call-123');
  const [tenantId] = useState('default');
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [dispositionData, setDispositionData] = useState<{
    suggested: Suggestion[];
    autoNotes: string;
  } | null>(null);
  
  // Call state (for UI consistency, not functional for test page)
  const [isCallActive] = useState(false);
  const [isPaused] = useState(false);
  const [callEnded] = useState(false);
  
  // Auto-discovery state (silent, always enabled)
  const [lastDiscoveredCallId, setLastDiscoveredCallId] = useState<string | null>(null);
  
  // Retry state for exponential backoff
  const discoveryRetryCountRef = useRef(0);
  const isDiscoveryPausedRef = useRef(false);
  const lastSuccessTimeRef = useRef<number>(Date.now());

  // CRITICAL FIX: Read callId from URL parameter FIRST (before auto-discovery)
  // This ensures manual callId from URL takes precedence over auto-discovery
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCallId = params.get('callId');
    
    if (urlCallId && urlCallId.trim().length > 0) {
      const trimmedCallId = urlCallId.trim();
      console.log('[Test] 🎯 Using callId from URL parameter:', trimmedCallId);
      setCallId(trimmedCallId);
      setLastDiscoveredCallId(trimmedCallId);
    } else {
      console.log('[Test] No URL parameter provided, will use auto-discovery or default');
    }
  }, []); // Run once on mount only

  // Auto-discover active calls silently in background
  // FIX: Reduced polling frequency with exponential backoff to prevent timeout spam
  // Includes recently ended calls (within 60 seconds) for real-time transcription
  // CRITICAL FIX: Empty dependency array - use functional updates to avoid stale closures
  // This prevents the effect from restarting every time callId changes
  useEffect(() => {
    const discoverActiveCalls = async () => {
      // Check if URL has callId parameter - don't override it
      const params = new URLSearchParams(window.location.search);
      const urlCallId = params.get('callId');
      const hasUrlCallId = urlCallId && urlCallId.trim().length > 0;
      
      // If URL has callId, skip auto-discovery (user explicitly set it)
      if (hasUrlCallId) {
        console.debug('[Test] URL parameter present, skipping auto-discovery');
        discoveryRetryCountRef.current = 0; // Reset retry count
        isDiscoveryPausedRef.current = false;
        return;
      }

      // If discovery is paused due to repeated failures, skip
      if (isDiscoveryPausedRef.current) {
        return;
      }

      // Fix: Add comprehensive error handling with exponential backoff
      try {
        // FIX: Reduced timeout to 5 seconds to fail faster and reduce spam
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
        
        // Fix: Handle non-OK responses gracefully
        if (!response.ok) {
          // Fix: Handle 503 errors gracefully (return empty array)
          if (response.status === 503) {
            console.debug('[Test] Service unavailable (503), skipping auto-discovery');
            return;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Fix: Check if response has content before parsing
        const text = await response.text();
        if (!text || text.trim().length === 0) {
          console.debug('[Test] Empty response from /api/calls/active');
          return;
        }
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          // Fix: Handle JSON parse errors
          console.error('[Test] Failed to parse JSON response:', parseError);
          return;
        }
        
        if (data.ok && data.calls && data.calls.length > 0) {
          // Use the most recent call from the array (already sorted by lastActivity)
          // This includes both active calls and recently ended calls (within 60 seconds)
          // This ensures real-time transcription works even if test script sends stop event
          const mostRecentCall = data.calls[0];
          
          if (mostRecentCall && mostRecentCall.interactionId) {
            const interactionId = mostRecentCall.interactionId;
            
            // CRITICAL FIX: Use functional updates to avoid stale closures
            // Check current state values, not captured closure values
            setLastDiscoveredCallId(currentLast => {
              // Only update if it's different AND not the default test call
              if (interactionId !== currentLast && interactionId !== 'test-call-123') {
                console.log('[Test] 🎯 Auto-discovered call:', {
                  interactionId,
                  status: mostRecentCall.status,
                  lastActivity: new Date(mostRecentCall.lastActivity).toISOString(),
                  note: mostRecentCall.status === 'ended' ? 'Recently ended (within 60s) - still discoverable for real-time transcription' : 'Active call',
                });
                
                // Use functional update to avoid stale closure
                setCallId(prevCallId => {
                  if (prevCallId === interactionId) {
                    return prevCallId; // No change needed
                  }
                  console.log('[Test] ✅ CallId updated - SSE will reconnect with new callId:', interactionId);
                  return interactionId;
                });
                
                return interactionId;
              }
              return currentLast; // No change
            });
          } else if (data.latestCall) {
            // Fallback to latestCall if calls array structure is different
            // Fix 1.2: Only use if not default test call
            if (data.latestCall.trim && data.latestCall.trim().length > 0 && data.latestCall !== 'test-call-123') {
              setLastDiscoveredCallId(currentLast => {
                if (data.latestCall !== currentLast) {
                  console.log('[Test] 🎯 Auto-discovered new call (via latestCall):', data.latestCall);
                  setCallId(data.latestCall);
                  return data.latestCall;
                }
                return currentLast;
              });
            }
          }
        } else {
          // No calls found - keep current callId (don't reset to test-call-123)
          // This allows UI to stay connected to the last discovered call even if it's ended
          console.debug('[Test] No active calls found, keeping current callId');
        }
      } catch (err: any) {
        // Fix: Handle timeout and network errors with exponential backoff
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          const newRetryCount = discoveryRetryCountRef.current + 1;
          discoveryRetryCountRef.current = newRetryCount;
          
          // FIX: Only log warning after 3 consecutive failures (reduce console spam)
          if (newRetryCount >= 3) {
            console.warn('[Test] Request timeout when fetching active calls (5s)', {
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
                console.debug('[Test] Auto-discovery resumed after pause');
              }, 30000); // Pause for 30 seconds
            }
          } else {
            // Silent retry for first few failures (reduce console spam)
            console.debug('[Test] Request timeout, retrying...', { retryCount: newRetryCount });
          }
        } else if (err instanceof SyntaxError) {
          console.error('[Test] Failed to parse JSON response:', {
            error: err.message,
            note: 'Response may be empty or invalid JSON',
          });
        } else {
          console.error('[Test] Failed to discover active calls:', {
            error: err.message || String(err),
            errorName: err.name,
          });
        }
        
        // On error, keep current callId (don't reset)
        // Don't log warning if URL parameter is set (that's intentional)
        const params = new URLSearchParams(window.location.search);
        const urlCallId = params.get('callId');
        if (!urlCallId) {
          setCallId(prevCallId => {
            if (prevCallId === 'test-call-123') {
              console.debug('[Test] Using default test callId due to discovery error');
            }
            return prevCallId; // Keep current callId
          });
        }
      }
    };

    // Initial discovery
    discoverActiveCalls();

    // FIX: Use dynamic polling with exponential backoff
    // Base interval: 5 seconds (reduced from 2s to reduce load)
    // Use recursive setTimeout instead of setInterval for dynamic intervals
    let timeoutId: NodeJS.Timeout;
    
    const scheduleNextPoll = () => {
      const baseInterval = 5000; // 5 seconds base
      const retryCount = discoveryRetryCountRef.current;
      
      // Calculate backoff: 5s, 7.5s, 10s, 12.5s, 15s (max)
      const backoffMultiplier = retryCount === 0 ? 1 : Math.min(1 + retryCount * 0.5, 3);
      const pollInterval = baseInterval * backoffMultiplier;
      
      timeoutId = setTimeout(() => {
        discoverActiveCalls();
        scheduleNextPoll(); // Schedule next poll
      }, pollInterval);
    };
    
    // Start the polling loop
    scheduleNextPoll();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []); // CRITICAL FIX: Empty dependency array - use functional updates instead
  // This prevents the effect from restarting every time callId changes
  // Functional updates (setCallId(prev => ...)) access current state, avoiding stale closures

  // Safeguard: Ensure callId is never empty or undefined
  // CRITICAL FIX: Don't override URL parameters or recently discovered calls
  useEffect(() => {
    // Check if URL has callId parameter
    const params = new URLSearchParams(window.location.search);
    const urlCallId = params.get('callId');
    
    if (!callId || (typeof callId === 'string' && callId.trim().length === 0)) {
      // If URL has callId, use it; otherwise use default
      if (urlCallId && urlCallId.trim().length > 0) {
        console.log('[Test] Restoring callId from URL parameter:', urlCallId.trim());
        setCallId(urlCallId.trim());
      } else {
        console.warn('[Test] ⚠️ callId is empty, restoring default');
        setCallId('test-call-123');
      }
    }
  }, [callId]);

  // Subscribe to transcripts when callId changes
  // CRITICAL: This ensures the Transcript Consumer subscribes to Redis transcript streams
  // Without this, transcripts from ASR Worker won't be forwarded to the ingest API
  useEffect(() => {
    if (!callId || callId.trim().length === 0) {
      return;
    }

    console.log('[Test] Subscribing to transcripts for:', callId);
    // Subscribe to transcripts for this interaction ID
    fetch('/api/transcripts/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId: callId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          console.info('[Test] ✅ Subscribed to transcripts', { interactionId: callId });
        } else {
          console.error('[Test] ❌ Failed to subscribe to transcripts', data);
        }
      })
      .catch(err => {
        console.error('[Test] ❌ Error subscribing to transcripts:', err);
      });
  }, [callId]);

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
      console.error('[Test] KB search API error:', err);
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
      console.error('[Test] Failed to fetch disposition summary:', err);
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
    console.log('[Test] KB articles update:', { articlesCount: articles.length, intent, confidence });
  };

  // Handle transcript events
  const handleTranscriptEvent = (event: any) => {
    console.log('[Test] Transcript event:', event);
  };

  // Handle interactionId change from AgentAssistPanel (auto-discovery from transcripts)
  const handleInteractionIdChange = (newInteractionId: string) => {
    console.log('[Test] 🔄 InteractionId changed (from transcript):', {
      from: callId,
      to: newInteractionId,
    });
    setCallId(newInteractionId);
    setLastDiscoveredCallId(newInteractionId);
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Main Layout */}
      <div className="flex h-screen">
        {/* Left Sidebar */}
        <LeftSidebar 
          isCallActive={isCallActive}
          isPaused={isPaused}
          callEnded={callEnded}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col pr-[376px]">
          {/* Center Column: Unified Call View */}
          <div className="flex-1 overflow-y-auto p-6">
            <CentralCallView
              customer={mockCustomer}
              callDuration="00:00"
              callId={callId}
              isCallActive={isCallActive}
              onMute={() => console.log('[Test] Mute clicked')}
              onHold={() => console.log('[Test] Hold clicked')}
              onTransfer={() => console.log('[Test] Transfer clicked')}
              onConference={() => console.log('[Test] Conference clicked')}
              onKeypad={() => console.log('[Test] Keypad clicked')}
              onRecord={() => console.log('[Test] Record clicked')}
              onComplete={() => {
                console.log('[Test] Complete clicked');
                // Trigger disposition summary fetch
                handleDispositionSummary(callId).then(() => {
                  setDispositionOpen(true);
                });
              }}
              onEndCall={() => console.log('[Test] End call clicked')}
              onOpenCRM={() => {
                console.log('[Test] Open CRM clicked');
                window.open('https://crm.example.com/customer/cust-789', '_blank');
              }}
              onOpenCaseHistory={() => {
                console.log('[Test] Open Case History clicked');
                window.open('https://crm.example.com/cases/cust-789', '_blank');
              }}
            />
          </div>
        </div>

        {/* Right Column: Agent Assist Panel V2 - Right-docked */}
        <AgentAssistPanelV2
          agentId="agent-test-123"
          tenantId={tenantId}
          interactionId={callId}
          customer={mockCustomer}
          callDuration="00:00"
          isCallActive={isCallActive}
          onKbArticlesUpdate={handleKbArticlesUpdate}
          onTranscriptEvent={handleTranscriptEvent}
          triggerKBSearch={handleKBSearch}
          fetchDispositionSummary={handleDispositionSummary}
          emitTelemetry={(eventName, payload) => {
            console.log('[Test] Telemetry:', eventName, payload);
          }}
          onOpenCRM={() => {
            console.log('[Test] Open CRM clicked');
            window.open('https://crm.example.com/customer/cust-789', '_blank');
          }}
          onOpenCaseHistory={() => {
            console.log('[Test] Open Case History clicked');
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

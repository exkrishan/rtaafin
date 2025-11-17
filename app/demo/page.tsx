'use client';

import { useState, useRef, useEffect } from 'react';
import TranscriptPanel from '@/components/TranscriptPanel';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import AgentAssistPanelV2, { KBArticle, DispositionData, Customer } from '@/components/AgentAssistPanelV2';
import LeftSidebar from '@/components/LeftSidebar';
import CentralCallView from '@/components/CentralCallView';
import ToastContainer from '@/components/ToastContainer';

interface DemoTranscriptLine {
  seq: number;
  speaker: string;
  text: string;
  ts: string;
}

interface DemoResult {
  callId: string;
  tenantId: string;
  startedAt: string;
  endedAt: string;
  disposition?: {
    suggested: Suggestion[];
    autoNotes: string;
  };
}

// Mock customer data for demo
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

export default function DemoPage() {
  const [callId] = useState(`demo-call-${Date.now()}`);
  const [tenantId] = useState('default');
  const [isCallActive, setIsCallActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [viewMode, setViewMode] = useState<'agent-assist' | 'disposition'>('agent-assist');
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [transcriptUtterances, setTranscriptUtterances] = useState<Array<{
    utterance_id: string;
    speaker: 'agent' | 'customer';
    text: string;
    confidence: number;
    timestamp: string;
  }>>([]);
  const [dispositionData, setDispositionData] = useState<{
    suggested: Suggestion[];
    autoNotes: string;
  } | null>(null);
  const [dispositionState, setDispositionState] = useState<{
    selectedDisposition?: string;
    selectedSubDisposition?: string;
    notes?: string;
  } | null>(null);
  const [demoTranscript, setDemoTranscript] = useState<DemoTranscriptLine[]>([]);
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [directTranscripts, setDirectTranscripts] = useState<Array<{
    utterance_id: string;
    speaker: 'agent' | 'customer';
    text: string;
    confidence: number;
    timestamp: string;
  }>>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptIndexRef = useRef(0);
  const callStartTimeRef = useRef<Date | null>(null);

  // Load demo transcript from JSON file
  useEffect(() => {
    fetch('/demo_playback.json')
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load demo_playback.json: ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then(data => {
        console.log('[Demo] ✅ Loaded transcript:', data.length, 'lines');
        if (!Array.isArray(data) || data.length === 0) {
          console.error('[Demo] ❌ Invalid transcript data:', data);
          return;
        }
        setDemoTranscript(data);
      })
      .catch(err => {
        console.error('[Demo] ❌ Failed to load demo transcript:', err);
        alert('Failed to load demo transcript. Check console for details.');
      });
  }, []);

  const sendTranscriptLineRef = useRef<((index: number) => Promise<void>) | null>(null);
  const onKbArticlesUpdateRef = useRef<((articles: any[], intent?: string, confidence?: number) => void) | null>(null);

  const startCall = async () => {
    if (isCallActive || demoTranscript.length === 0) {
      console.warn('[Demo] Cannot start call:', { isCallActive, transcriptLength: demoTranscript.length });
      return;
    }
    
    console.log('[Demo] 🎬 Starting call:', { 
      callId, 
      transcriptLines: demoTranscript.length,
      timestamp: new Date().toISOString()
    });
    setIsCallActive(true);
    setIsPaused(false);
    setCallEnded(false);
    setDirectTranscripts([]); // Reset transcripts
    transcriptIndexRef.current = 0;
    callStartTimeRef.current = new Date();

    const sendTranscriptLine = async (index: number) => {
      if (index >= demoTranscript.length) {
        console.log('[Demo] All transcript lines sent');
        setIsCallActive(false);
        setCallEnded(true);
        // Auto-open disposition modal
        setTimeout(() => {
          disposeCall();
        }, 1000);
        return;
      }

      if (isPaused) {
        transcriptIndexRef.current = index;
        return;
      }

      const line = demoTranscript[index];
      const text = `${line.speaker}: ${line.text}`;
      transcriptIndexRef.current = index;

      // Determine speaker
      const speaker: 'agent' | 'customer' = line.speaker.toLowerCase().includes('agent') ? 'agent' : 'customer';
      const cleanText = line.text.trim();

      // Add directly to transcript state (bypass SSE for demo)
      const utterance = {
        utterance_id: `demo-${line.seq}-${Date.now()}`,
        speaker,
        text: cleanText,
        confidence: 0.95,
        timestamp: line.ts || new Date().toISOString(),
      };

      setDirectTranscripts(prev => {
        // Check for duplicates
        const exists = prev.some(u => u.utterance_id === utterance.utterance_id);
        if (exists) return prev;
        return [...prev, utterance];
      });

      // Transcripts are added to directTranscripts state which is passed to AgentAssistPanelV2

      try {
        console.log('[Demo] 📤 Sending transcript line (direct mode):', { 
          seq: line.seq, 
          index, 
          callId,
          speaker,
          text: cleanText.substring(0, 50),
          textLength: cleanText.length,
        });
        
        // Send to API for KB/intent detection and wait for response
        const response = await fetch('/api/calls/ingest-transcript', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
          },
          body: JSON.stringify({
            callId,
            seq: line.seq,
            ts: line.ts,
            text,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('[Demo] ✅ Received KB/intent response:', {
            seq: line.seq,
            intent: result.intent,
            confidence: result.confidence,
            articlesCount: result.articles?.length || 0,
          });

          // Update KB articles if we have them
          if (result.articles && Array.isArray(result.articles) && result.articles.length > 0) {
            // Use window callback to update KB articles in AgentAssistPanelV2
            if ((window as any).__updateKbArticles) {
              (window as any).__updateKbArticles(result.articles, result.intent, result.confidence);
            }
          }
        } else {
          console.warn('[Demo] API call returned error:', response.status, response.statusText);
        }
      } catch (err: any) {
        console.error('[Demo] ❌ Error sending transcript line:', {
          error: err.message || String(err),
          stack: err.stack,
          callId,
          seq: line.seq,
          index,
          text: text.substring(0, 100)
        });
        // Retry logic: retry once after 1 second
        if (index < demoTranscript.length - 1) {
          console.log('[Demo] ⏳ Retrying transcript line after error in 1 second...', { seq: line.seq, index });
          setTimeout(() => {
            sendTranscriptLine(index);
          }, 1000);
          return;
        }
      }

      if (index < demoTranscript.length - 1) {
        intervalRef.current = setTimeout(() => {
          sendTranscriptLine(index + 1);
        }, 2000); // ~2s cadence as specified
      }
    };

    sendTranscriptLineRef.current = sendTranscriptLine;
    
    // Start sending transcripts immediately (no SSE wait for demo)
    console.log('[Demo] 🎬 Starting transcript playback (direct mode)', {
      callId,
      transcriptLines: demoTranscript.length,
      timestamp: new Date().toISOString()
    });
    
    // Small delay to ensure UI is ready, then start
    setTimeout(() => {
      sendTranscriptLine(0);
    }, 500);
  };

  const pauseCall = () => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPaused(true);
  };

  const resumeCall = () => {
    if (!isCallActive || !isPaused || !sendTranscriptLineRef.current) return;
    setIsPaused(false);
    const currentIndex = transcriptIndexRef.current;
    sendTranscriptLineRef.current(currentIndex);
  };

  const resetCall = () => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsCallActive(false);
    setIsPaused(false);
    setCallEnded(false);
    setDirectTranscripts([]);
    setTranscriptUtterances([]);
    transcriptIndexRef.current = 0;
    callStartTimeRef.current = null;
    setDispositionData(null);
    setDispositionOpen(false);
    
    // Clear KB articles in AgentAssistPanelV2 via window callback
    if ((window as any).__clearKbArticles) {
      (window as any).__clearKbArticles();
    }
    
    console.log('[Demo] 🔄 Call reset - ready to start again');
  };

  const restartCall = () => {
    console.log('[Demo] 🔄 Restarting call...');
    resetCall();
    // Small delay to ensure state is reset, then start again
    setTimeout(() => {
      startCall();
    }, 100);
  };

  const disposeCall = async () => {
    try {
      await fetch('/api/calls/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, tenantId }),
      });
    } catch (err) {
      console.error('[Demo] Failed to send call_end', err);
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

      // Save demo result
      const result: DemoResult = {
        callId,
        tenantId,
        startedAt: callStartTimeRef.current?.toISOString() || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        disposition: dispositionData,
      };
      setDemoResult(result);

      // Save to localStorage
      try {
        const savedResults = JSON.parse(localStorage.getItem('demoResults') || '[]');
        savedResults.push(result);
        localStorage.setItem('demoResults', JSON.stringify(savedResults));
        console.log('[Demo] Saved result to localStorage');
      } catch (err) {
        console.error('[Demo] Failed to save to localStorage:', err);
      }
    } catch (err: any) {
      console.error('[Demo] Failed to generate summary', err);
      alert('Failed to generate summary: ' + (err?.message || 'Unknown error'));
    }
  };

  const exportDemoResult = () => {
    if (!demoResult) return;
    const json = JSON.stringify(demoResult, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `demo-result-${callId}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const stopCall = () => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsCallActive(false);
    setCallEnded(true);
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
          onStartCall={startCall}
          onPauseCall={pauseCall}
          onResumeCall={resumeCall}
          onStopCall={stopCall}
          onResetCall={resetCall}
          onRestartCall={restartCall}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col pr-[376px]">
          {/* Page Header - Removed for subtle demo controls */}

          {/* Center Column: Unified Call View */}
          <div className="flex-1 overflow-y-auto p-6">
            <CentralCallView
              customer={mockCustomer}
              callDuration={isCallActive ? '00:00' : '00:00'}
              callId={callId}
              isCallActive={isCallActive}
              onMute={() => console.log('[Demo] Mute clicked')}
              onHold={() => console.log('[Demo] Hold clicked')}
              onTransfer={() => console.log('[Demo] Transfer clicked')}
              onConference={() => console.log('[Demo] Conference clicked')}
              onKeypad={() => console.log('[Demo] Keypad clicked')}
              onRecord={() => console.log('[Demo] Record clicked')}
              onComplete={() => console.log('[Demo] Complete clicked')}
              onEndCall={() => {
                console.log('[Demo] End call clicked');
                stopCall();
              }}
              onOpenCRM={() => {
                console.log('[Demo] Open CRM clicked');
                window.open('https://crm.example.com/customer/cust-789', '_blank');
              }}
              onOpenCaseHistory={() => {
                console.log('[Demo] Open Case History clicked');
                window.open('https://crm.example.com/cases/cust-789', '_blank');
              }}
            />
          </div>
        </div>

        {/* Right Column: Agent Assist Panel V2 - Right-docked */}
        {viewMode === 'agent-assist' && (
        <AgentAssistPanelV2
          agentId="agent-demo-123"
          tenantId={tenantId}
          interactionId={callId}
          customer={mockCustomer}
          callDuration={isCallActive ? '00:00' : '00:00'}
          isCallActive={isCallActive}
          useSse={false}
          directTranscripts={directTranscripts}
          onKbArticlesUpdate={(articles, intent, confidence) => {
            console.log('[Demo] KB articles update callback:', { articlesCount: articles.length, intent, confidence });
            // This will be handled by the component's internal state
          }}
          onTranscriptEvent={(event) => {
            console.log('[Demo] Transcript event:', event);
            setTranscriptUtterances(prev => {
              const existing = prev.find(u => u.utterance_id === event.utterance_id);
              if (existing) {
                return prev.map(u => u.utterance_id === event.utterance_id ? event : u);
              }
              return [...prev, event];
            });
          }}
          triggerKBSearch={async (query, context) => {
            console.log('[Demo] KB search triggered:', { query, context });
            
            // Call actual KB search API
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
              
              // Fallback to mock data if API fails
              return [
                {
                  id: 'kb-1',
                  title: 'Card Replacement Process',
                  snippet: 'For card replacement requests, verify customer identity and check fraud status...',
                  confidence: 0.85,
                  intent: 'credit_card_replacement',
                  intentConfidence: 0.92,
                  url: 'https://kb.example.com/card-replacement',
                },
              ];
            } catch (err) {
              console.error('[Demo] KB search API error:', err);
              // Return mock data on error
              return [
                {
                  id: 'kb-1',
                  title: 'Card Replacement Process',
                  snippet: 'For card replacement requests, verify customer identity and check fraud status...',
                  confidence: 0.85,
                  intent: 'credit_card_replacement',
                  intentConfidence: 0.92,
                  url: 'https://kb.example.com/card-replacement',
                },
              ];
            }
          }}
          fetchDispositionSummary={async (interactionId) => {
            console.log('[Demo] Fetching disposition for:', interactionId);
            
            try {
              // Call actual API for disposition summary
              const response = await fetch('/api/calls/summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callId: interactionId, tenantId }),
              });

              const payload = await response.json();

              if (!response.ok || !payload.ok) {
                throw new Error(payload?.error || 'Failed to generate summary');
              }

              // Map API response to DispositionData format
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
              console.error('[Demo] Failed to fetch disposition summary:', err);
              // Return fallback data
              return {
                dispositionId: 'disposition-1',
                dispositionTitle: 'General Inquiry',
                confidence: 0.5,
                subDispositions: [],
                autoNotes: 'Failed to generate notes. Please try again.',
              };
            }
          }}
          emitTelemetry={(eventName, payload) => {
            console.log('[Demo] Telemetry:', eventName, payload);
          }}
          onOpenCRM={() => {
            console.log('[Demo] Open CRM clicked');
            window.open('https://crm.example.com/customer/cust-789', '_blank');
          }}
          onOpenCaseHistory={() => {
            console.log('[Demo] Open Case History clicked');
            window.open('https://crm.example.com/cases/cust-789', '_blank');
          }}
        />
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
            // Keep modal open but hidden, so state is preserved
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

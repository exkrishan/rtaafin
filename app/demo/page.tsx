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
  const [demoTranscript, setDemoTranscript] = useState<DemoTranscriptLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
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

  const startCall = async () => {
    if (isCallActive || demoTranscript.length === 0) {
      console.warn('[Demo] Cannot start call:', { isCallActive, transcriptLength: demoTranscript.length });
      return;
    }
    
    console.log('[Demo] Starting call:', { callId, transcriptLines: demoTranscript.length });
    setIsCallActive(true);
    setIsPaused(false);
    setCallEnded(false);
    setProgress(0);
    transcriptIndexRef.current = 0;
    callStartTimeRef.current = new Date();

    const sendTranscriptLine = async (index: number) => {
      if (index >= demoTranscript.length) {
        console.log('[Demo] All transcript lines sent');
        setIsCallActive(false);
        setCallEnded(true);
        setProgress(100);
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
      const progressPercent = ((index + 1) / demoTranscript.length) * 100;
      setProgress(progressPercent);
      transcriptIndexRef.current = index;

      try {
        console.log('[Demo] 📤 Sending transcript line:', { 
          seq: line.seq, 
          index, 
          callId,
          text: text.substring(0, 50),
          textLength: text.length
        });
        
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
          console.log('[Demo] ✅ Transcript line sent successfully:', { 
            seq: line.seq, 
            intent: result.intent,
            articlesCount: result.articles?.length || 0
          });
        } else {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }
          console.error('[Demo] ❌ Failed to send transcript line:', { 
            status: response.status, 
            statusText: response.statusText,
            error: errorData
          });
        }
      } catch (err: any) {
        console.error('[Demo] ❌ Error sending transcript line:', {
          error: err.message || String(err),
          stack: err.stack,
          callId,
          seq: line.seq
        });
      }

      if (index < demoTranscript.length - 1) {
        intervalRef.current = setTimeout(() => {
          sendTranscriptLine(index + 1);
        }, 2000); // ~2s cadence as specified
      }
    };

    sendTranscriptLineRef.current = sendTranscriptLine;
    // Wait longer for SSE connection to establish, then start sending
    // This ensures the AgentAssistPanel has time to connect to the SSE stream
    setTimeout(() => {
      console.log('[Demo] Starting transcript playback after SSE connection delay');
      sendTranscriptLine(0);
    }, 1500); // Increased delay to ensure SSE connection is ready
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
    setProgress(0);
    transcriptIndexRef.current = 0;
    callStartTimeRef.current = null;
    setDispositionData(null);
    setDispositionOpen(false);
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
      {/* Progress Bar */}
      {isCallActive && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white px-4 py-2">
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium">Demo Playback</span>
            <div className="flex-1 bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-medium">{Math.round(progress)}%</span>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className={`flex h-screen ${isCallActive ? 'pt-12' : ''}`}>
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
        <AgentAssistPanelV2
          agentId="agent-demo-123"
          tenantId={tenantId}
          interactionId={callId}
          customer={mockCustomer}
          callDuration={isCallActive ? '00:00' : '00:00'}
          isCallActive={isCallActive}
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
            // Return mock disposition data
            return {
              dispositionId: 'disposition-1',
              dispositionTitle: 'Card Replacement',
              confidence: 0.92,
              subDispositions: [
                { id: 'sub-1', title: 'Fraud Related' },
                { id: 'sub-2', title: 'Lost/Stolen' },
              ],
              autoNotes: 'Customer reported fraud and requested card replacement. Verified identity and initiated replacement process.',
            };
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
      </div>

      {/* Disposition Modal */}
      {dispositionData && (
        <AutoDispositionModal
          open={dispositionOpen}
          onClose={() => setDispositionOpen(false)}
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

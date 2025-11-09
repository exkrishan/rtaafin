'use client';

import { useState, useRef, useEffect } from 'react';
import TranscriptPanel from '@/components/TranscriptPanel';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import AgentAssistPanelV2, { KBArticle, DispositionData, Customer } from '@/components/AgentAssistPanelV2';
import CustomerDetailsHeader from '@/components/CustomerDetailsHeader';
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
  name: 'Asha Sharma',
  id: 'cust-789',
  masked_phone: '+91-XXXX-1234',
  account: 'MoneyAssure — Card Services',
  tags: ['Premium', 'Card'],
  email: 'asha.sharma@example.com',
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
    // Wait a bit for SSE connection to establish, then start sending
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

      {/* Single column layout - Customer Info in center, Agent Assist is right-docked */}
      <div className={`flex flex-col h-screen p-6 pr-[376px] ${isCallActive ? 'pt-16' : ''}`}>
        {/* Top Controls */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Agent Desktop</h1>
          {!isCallActive && !callEnded && (
            <button
              onClick={startCall}
              disabled={demoTranscript.length === 0}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 shadow disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              ▶ Start Call
            </button>
          )}
          {isCallActive && (
            <div className="flex gap-2">
              {isPaused ? (
                <button
                  onClick={resumeCall}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
                >
                  ▶ Resume
                </button>
              ) : (
                <button
                  onClick={pauseCall}
                  className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700"
                >
                  ⏸ Pause
                </button>
              )}
              <button
                onClick={stopCall}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
              >
                ⏹ Stop
              </button>
            </div>
          )}
          {callEnded && (
            <div className="flex gap-2">
              <button
                onClick={resetCall}
                className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700"
              >
                🔄 Reset
              </button>
              {demoResult && (
                <button
                  onClick={exportDemoResult}
                  className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700"
                >
                  📥 Export
                </button>
              )}
            </div>
          )}
        </div>

        {/* Center Column: Customer Info - Main focus like Universal Agent Desktop */}
        <div className="flex-1 overflow-y-auto">
          <div className="card h-full flex flex-col">
            <CustomerDetailsHeader
              customer={mockCustomer}
              callDuration={isCallActive ? '00:00' : '00:00'}
              callId={callId}
              onOpenCRM={() => {
                console.log('[Demo] Open CRM clicked');
                window.open('https://crm.example.com/customer/cust-789', '_blank');
              }}
              onOpenCaseHistory={() => {
                console.log('[Demo] Open Case History clicked');
                window.open('https://crm.example.com/cases/cust-789', '_blank');
              }}
            />
            <div className="flex-1 p-6">
              <div className="text-center text-gray-500">
                <p className="text-sm">Customer information displayed above. Transcript and KB suggestions in Agent Assist panel on the right.</p>
              </div>
            </div>
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
          }}
          triggerKBSearch={async (query, context) => {
            console.log('[Demo] KB search triggered:', { query, context });
            // Mock KB search results with intent detection basis
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

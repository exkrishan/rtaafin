'use client';

import { useState, useEffect } from 'react';
import TranscriptPanel from '@/components/TranscriptPanel';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import AgentAssistPanelV2, { KBArticle, DispositionData } from '@/components/AgentAssistPanelV2';
import { Customer } from '@/components/CustomerDetailsHeader';
import CentralCallView from '@/components/CentralCallView';
import LeftSidebar from '@/components/LeftSidebar';
import ToastContainer from '@/components/ToastContainer';

interface EnvCheck {
  name: string;
  value: string | undefined;
  required: boolean;
}

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
  const [envStatus, setEnvStatus] = useState<{
    missing: string[];
    available: string[];
  }>({ missing: [], available: [] });

  // Check environment variables on mount
  useEffect(() => {
    const requiredEnvVars = [
      'REDIS_URL',
      'GEMINI_API_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ];

    const optionalEnvVars = [
      'LLM_API_KEY',
      'LLM_PROVIDER',
      'DEEPGRAM_API_KEY',
    ];

    const missing: string[] = [];
    const available: string[] = [];

    // Check required vars (we can only check client-side accessible ones)
    // For server-side vars, we'll show a banner
    const clientAccessibleVars = ['NEXT_PUBLIC_SUPABASE_URL'];
    
    requiredEnvVars.forEach(varName => {
      if (clientAccessibleVars.includes(varName)) {
        const value = process.env[`NEXT_PUBLIC_${varName}`] || process.env[varName];
        if (!value) {
          missing.push(varName);
        } else {
          available.push(varName);
        }
      } else {
        // Server-side only - assume missing for now (will be checked via API)
        missing.push(varName);
      }
    });

    optionalEnvVars.forEach(varName => {
      const value = process.env[`NEXT_PUBLIC_${varName}`] || process.env[varName];
      if (value) {
        available.push(varName);
      }
    });

    setEnvStatus({ missing, available });

    // Also check via API endpoint
    fetch('/api/debug/env')
      .then(res => res.json())
      .then(data => {
        if (data.env) {
          const serverMissing: string[] = [];
        const serverAvailable: string[] = [];
        
        requiredEnvVars.forEach(varName => {
          if (data.env[varName] || data.env[`NEXT_PUBLIC_${varName}`]) {
            serverAvailable.push(varName);
          } else {
            serverMissing.push(varName);
          }
        });

        setEnvStatus({
          missing: serverMissing,
          available: [...new Set([...available, ...serverAvailable])],
        });
      }
      })
      .catch(err => {
        console.error('[Live] Failed to check server env vars:', err);
      });
  }, []);

  // Subscribe to transcripts when callId changes
  useEffect(() => {
    if (!callId || callId.trim().length === 0) {
      return;
    }

    console.log('[Live] Subscribing to transcripts for:', callId);
    // Subscribe to transcripts for this interaction ID
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

  return (
    <div className="min-h-screen bg-surface">
      {/* Environment Validation Banner */}
      {envStatus.missing.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                Missing Environment Variables
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>The following environment variables are required for Live mode:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {envStatus.missing.map(varName => (
                    <li key={varName} className="font-mono text-xs">{varName}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  Please configure these in your deployment platform (Render) or set them in your <code className="font-mono text-xs">.env.local</code> file.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Call ID Input */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <label htmlFor="callId" className="text-sm font-medium text-gray-700">
            Interaction ID:
          </label>
          <input
            id="callId"
            type="text"
            value={callId}
            onChange={(e) => setCallId(e.target.value)}
            placeholder="Enter interaction ID from ASR Worker logs"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={disposeCall}
            disabled={!callId}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            📝 Dispose Call
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Enter the interaction_id from your ASR Worker logs (e.g., from Redis Streams topic: transcript.&lt;interaction_id&gt;)
        </p>
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

        {/* Right Column: Agent Assist Panel V2 - Right-docked */}
        {callId && (
          <AgentAssistPanelV2
            agentId="agent-live-123"
            tenantId={tenantId}
            interactionId={callId}
            customer={mockCustomer}
            callDuration="00:00"
            isCallActive={true}
            onTranscriptEvent={(event) => {
              console.log('[Live] Transcript event:', event);
              setTranscriptUtterances(prev => {
                const existing = prev.find(u => u.utterance_id === event.utterance_id);
                if (existing) {
                  return prev.map(u => u.utterance_id === event.utterance_id ? event : u);
                }
                return [...prev, event];
              });
            }}
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
              // TODO: Replace with actual API call
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
              // TODO: Send to telemetry service
            }}
            onOpenCRM={() => {
              console.log('[Live] Open CRM clicked');
              window.open(`https://crm.example.com/customer/${mockCustomer.id}`, '_blank');
            }}
            onOpenCaseHistory={() => {
              console.log('[Live] Open Case History clicked');
              window.open(`https://crm.example.com/cases/${mockCustomer.id}`, '_blank');
            }}
          />
        )}
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

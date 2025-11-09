'use client';

import { useState, useEffect } from 'react';
import TranscriptPanel from '@/components/TranscriptPanel';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import AgentAssistPanel from '@/components/AgentAssistPanel';
import ToastContainer from '@/components/ToastContainer';

interface EnvCheck {
  name: string;
  value: string | undefined;
  required: boolean;
}

// Placeholder Customer Info component
function CustomerInfoPlaceholder() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Info</h2>
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            Customer information and interaction history would appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LivePage() {
  const [callId, setCallId] = useState<string>('');
  const [tenantId] = useState('default');
  const [dispositionOpen, setDispositionOpen] = useState(false);
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

      {/* 3-column grid layout - Same as Dashboard and Demo */}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[320px_1fr_360px] gap-6 h-[calc(100vh-120px)] p-6">
        {/* Left Column: Transcript */}
        <div className="relative">
          <div className="card h-full flex flex-col">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Transcript</h2>
            <div className="flex-1 overflow-hidden">
              {callId ? (
                <TranscriptPanel
                  callId={callId}
                  tenantId={tenantId}
                  onOpenDisposition={(data) => {
                    setDispositionData(data);
                    setDispositionOpen(true);
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p className="text-sm">Enter an Interaction ID above to start receiving transcripts</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center Column: Customer Info */}
        <div className="overflow-y-auto">
          <CustomerInfoPlaceholder />
        </div>

        {/* Right Column: Agent Assist Panel (hidden on <1024px) */}
        <div className="hidden lg:block overflow-y-auto">
          <AgentAssistPanel
            articles={[]} // Start with empty - articles will appear when intent is detected via SSE
            callId={callId}
            onFeedback={(articleId, liked) => {
              console.log('[Live] Article feedback:', { articleId, liked });
            }}
          />
        </div>
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

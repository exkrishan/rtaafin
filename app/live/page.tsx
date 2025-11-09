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

    // Subscribe to transcripts for this interaction ID
    fetch('/api/transcripts/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId: callId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          console.info('[Live] Subscribed to transcripts', { interactionId: callId });
        } else {
          console.error('[Live] Failed to subscribe to transcripts', data);
        }
      })
      .catch(err => {
        console.error('[Live] Error subscribing to transcripts:', err);
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
    <div className="min-h-screen bg-gray-100">
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
                  Please configure these in your deployment platform (Vercel/Netlify) or set them in your <code className="font-mono text-xs">.env.local</code> file.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar - Matching Mock */}
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="text-blue-400 hover:text-blue-300" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h1 className="text-sm font-medium">Agent Assist 22 - Live</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-gray-400 hover:text-white" aria-label="Notifications">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-semibold">
              SM
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800"></span>
          </div>
        </div>
      </div>

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

      {/* Main Content - Three Column Layout */}
      <div className="flex h-[calc(100vh-120px)]">
        {/* Left Navigation Sidebar */}
        <div className="w-12 bg-gray-800 flex flex-col items-center py-4 gap-4">
          <button className="text-white hover:text-blue-400" aria-label="Home">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Next">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Headset">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Add">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center text-xs font-semibold text-gray-900">
            M
          </div>
          <button className="text-white hover:text-blue-400" aria-label="Calendar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Search">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Settings">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Left Column: Call/Transcript Panel */}
        <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
          {/* Call Header */}
          <div className="bg-white border-b border-gray-200 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="font-medium text-sm">Live Call</span>
                <span className="text-xs text-gray-500">{callId ? callId.substring(0, 8) : 'No ID'}</span>
              </div>
            </div>
          </div>

          {/* Transcript Section */}
          <div className="flex-1 overflow-y-auto bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Transcript</h2>
            </div>
            {/* Call Details */}
            <div className="text-xs text-gray-600 space-y-1 mb-4 pb-4 border-b border-gray-200">
              <div>Mode: Live</div>
              <div>Interaction ID: {callId || 'Not set'}</div>
            </div>
            {/* Transcript Messages */}
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
              <div className="text-center text-gray-500 py-8">
                <p className="text-sm">Enter an Interaction ID above to start receiving transcripts</p>
              </div>
            )}
          </div>
        </div>

        {/* Center Column: Customer Details */}
        <div className="flex-1 bg-white overflow-y-auto">
          <div className="p-6">
            <div className="text-center text-gray-500 py-8">
              <p className="text-sm">Customer information will appear here when available</p>
            </div>
          </div>
        </div>

        {/* Right Column: Agent Assist Panel */}
        <div className="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto">
          <div className="p-4">
            <AgentAssistPanel
              callId={callId}
              articles={[]} // Start with empty - articles will appear when intent is detected via SSE
              onFeedback={(articleId, liked) => {
                console.log('[Live] Article feedback:', { articleId, liked });
              }}
            />
          </div>
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


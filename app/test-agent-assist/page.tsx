'use client';

import { useState, useEffect } from 'react';
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
  const [callId, setCallId] = useState('test-call-123');
  const [tenantId, setTenantId] = useState('default');
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [dispositionData, setDispositionData] = useState<{
    suggested: Suggestion[];
    autoNotes: string;
  } | null>(null);
  
  // Call state (for UI consistency, not functional for test page)
  const [isCallActive] = useState(false);
  const [isPaused] = useState(false);
  const [callEnded] = useState(false);
  
  // Auto-discovery state
  const [activeCalls, setActiveCalls] = useState<Array<{ interactionId: string; lastActivity?: string }>>([]);
  const [autoDiscoveryEnabled, setAutoDiscoveryEnabled] = useState(true);
  const [lastDiscoveredCallId, setLastDiscoveredCallId] = useState<string | null>(null);

  // Auto-discover active calls and auto-select latest
  useEffect(() => {
    if (!autoDiscoveryEnabled) return;

    const discoverActiveCalls = async () => {
      try {
        const response = await fetch('/api/calls/active?limit=10');
        const data = await response.json();
        
        if (data.ok && data.calls && data.calls.length > 0) {
          setActiveCalls(data.calls);
          
          // Auto-select the latest call if it's different from current
          if (data.latestCall && data.latestCall !== callId) {
            console.log('[Test] 🎯 Auto-discovered new call:', data.latestCall);
            setCallId(data.latestCall);
            setLastDiscoveredCallId(data.latestCall);
          }
        } else {
          setActiveCalls([]);
        }
      } catch (err: any) {
        console.error('[Test] Failed to discover active calls:', err);
      }
    };

    // Initial discovery
    discoverActiveCalls();

    // Poll every 5 seconds for new calls
    const interval = setInterval(discoverActiveCalls, 5000);

    return () => clearInterval(interval);
  }, [autoDiscoveryEnabled, callId]);

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
          {/* Auto-discovery controls - Simple header */}
          <div className="bg-white border-b border-gray-200 p-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoDiscovery"
                  checked={autoDiscoveryEnabled}
                  onChange={(e) => setAutoDiscoveryEnabled(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="autoDiscovery" className="text-sm font-medium text-gray-700">
                  Auto-discover active calls
                </label>
              </div>
              
              {autoDiscoveryEnabled && activeCalls.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Active Call:</label>
                  <select
                    value={callId}
                    onChange={(e) => setCallId(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    {activeCalls.map((call) => (
                      <option key={call.interactionId} value={call.interactionId}>
                        {call.interactionId}
                      </option>
                    ))}
                  </select>
                  {lastDiscoveredCallId && lastDiscoveredCallId === callId && (
                    <span className="text-xs text-green-600">✓ Auto-selected</span>
                  )}
                </div>
              )}
              
              <div className="flex items-center gap-2 ml-auto">
                <label className="text-sm font-medium text-gray-700">Call ID:</label>
                <input
                  id="callId"
                  type="text"
                  value={callId}
                  onChange={(e) => setCallId(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm w-64"
                  placeholder="Enter call ID (e.g. ab7cbdeac69d2a44ef890ecf164e19bh)"
                />
                <label className="text-sm font-medium text-gray-700">Tenant ID:</label>
                <input
                  id="tenantId"
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm w-32"
                  placeholder="Enter tenant ID"
                />
              </div>
            </div>
          </div>

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

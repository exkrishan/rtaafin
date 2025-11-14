'use client';

import { useState, useEffect } from 'react';
import LeftSidebar from '@/components/LeftSidebar';
import CentralCallView from '@/components/CentralCallView';
import AgentAssistPanelV2, { Customer, KBArticle, DispositionData } from '@/components/AgentAssistPanelV2';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import ToastContainer from '@/components/ToastContainer';

interface DispositionTestResult {
  status: 'loading' | 'success' | 'error';
  data?: any;
  error?: string;
}

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
  
  // Disposition API test states
  const [parentDispositions, setParentDispositions] = useState<DispositionTestResult>({ status: 'loading' });
  const [subDispositions, setSubDispositions] = useState<DispositionTestResult>({ status: 'loading' });
  const [selectedParentCode, setSelectedParentCode] = useState<string>('');
  const [showDispositionTesting, setShowDispositionTesting] = useState(true);

  // Test Parent Dispositions API
  const testParentDispositions = async () => {
    setParentDispositions({ status: 'loading' });
    try {
      const response = await fetch('/api/dispositions');
      const data = await response.json();
      if (data.ok) {
        setParentDispositions({ status: 'success', data });
        if (data.dispositions && data.dispositions.length > 0 && !selectedParentCode) {
          setSelectedParentCode(data.dispositions[0].code);
        }
      } else {
        setParentDispositions({ status: 'error', error: data.error || 'Failed to fetch' });
      }
    } catch (err: any) {
      setParentDispositions({ status: 'error', error: err.message });
    }
  };

  // Test Sub-Dispositions API
  const testSubDispositions = async (parentCode?: string) => {
    const code = parentCode || selectedParentCode;
    if (!code) {
      setSubDispositions({ status: 'error', error: 'Please select a parent disposition first' });
      return;
    }
    
    setSubDispositions({ status: 'loading' });
    try {
      const response = await fetch(`/api/sub-dispositions?dispositionCode=${encodeURIComponent(code)}`);
      const data = await response.json();
      if (data.ok) {
        setSubDispositions({ status: 'success', data });
      } else {
        setSubDispositions({ status: 'error', error: data.error || 'Failed to fetch' });
      }
    } catch (err: any) {
      setSubDispositions({ status: 'error', error: err.message });
    }
  };

  // Load parent dispositions on mount
  useEffect(() => {
    testParentDispositions();
  }, []);

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
          {/* Disposition Taxonomy Testing Section - Collapsible */}
          {showDispositionTesting && (
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">🧪 Disposition Taxonomy Testing</h2>
                <button
                  onClick={() => setShowDispositionTesting(false)}
                  className="text-gray-500 hover:text-gray-700"
                  aria-label="Collapse testing section"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Parent Dispositions */}
                <div className="bg-gray-50 p-4 rounded border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-sm">Parent Dispositions</h3>
                    <button
                      onClick={testParentDispositions}
                      className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Test API
                    </button>
                  </div>
                  {parentDispositions.status === 'loading' && (
                    <p className="text-xs text-gray-500">Loading...</p>
                  )}
                  {parentDispositions.status === 'success' && parentDispositions.data && (
                    <div className="text-xs">
                      <p className="text-green-600 mb-2">
                        ✅ Found {parentDispositions.data.count || 0} parent dispositions
                      </p>
                      <select
                        value={selectedParentCode}
                        onChange={(e) => {
                          setSelectedParentCode(e.target.value);
                          testSubDispositions(e.target.value);
                        }}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="">Select parent disposition...</option>
                        {parentDispositions.data.dispositions?.map((d: any) => (
                          <option key={d.code} value={d.code}>
                            {d.title} ({d.code}) {d.id ? `[ID: ${d.id}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {parentDispositions.status === 'error' && (
                    <p className="text-xs text-red-600">❌ {parentDispositions.error}</p>
                  )}
                </div>

                {/* Sub-Dispositions */}
                <div className="bg-gray-50 p-4 rounded border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-sm">Sub-Dispositions</h3>
                    <button
                      onClick={() => testSubDispositions()}
                      disabled={!selectedParentCode}
                      className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Test API
                    </button>
                  </div>
                  {subDispositions.status === 'loading' && (
                    <p className="text-xs text-gray-500">Loading...</p>
                  )}
                  {subDispositions.status === 'success' && subDispositions.data && (
                    <div className="text-xs">
                      <p className="text-green-600 mb-2">
                        ✅ Found {subDispositions.data.count || 0} sub-dispositions
                      </p>
                      <div className="max-h-32 overflow-y-auto">
                        {subDispositions.data.subDispositions?.map((sd: any) => (
                          <div key={sd.code} className="py-1 border-b border-gray-100">
                            <span className="font-medium">{sd.title || sd.label}</span>
                            <span className="text-gray-500 ml-2">
                              ({sd.code}) {sd.id ? `[ID: ${sd.id}]` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {subDispositions.status === 'error' && (
                    <p className="text-xs text-red-600">❌ {subDispositions.error}</p>
                  )}
                </div>
              </div>
              
              {/* Test Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="callId" className="block text-xs font-medium text-gray-700 mb-1">
                    Call ID
                  </label>
                  <input
                    id="callId"
                    type="text"
                    value={callId}
                    onChange={(e) => setCallId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                    placeholder="Enter call ID"
                  />
                </div>
                <div>
                  <label htmlFor="tenantId" className="block text-xs font-medium text-gray-700 mb-1">
                    Tenant ID
                  </label>
                  <input
                    id="tenantId"
                    type="text"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                    placeholder="Enter tenant ID"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Show button to expand if collapsed */}
          {!showDispositionTesting && (
            <div className="bg-white border-b border-gray-200 p-2">
              <button
                onClick={() => setShowDispositionTesting(true)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Show Disposition Testing
              </button>
            </div>
          )}

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

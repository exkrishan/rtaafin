'use client';

import { useState } from 'react';
import TranscriptPanel from '@/components/TranscriptPanel';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import KBSuggestions from '@/components/KBSuggestions';

export default function TestAgentAssistPage() {
  const [callId, setCallId] = useState('test-call-123');
  const [tenantId, setTenantId] = useState('default');
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [dispositionData, setDispositionData] = useState<{
    suggested: Suggestion[];
    autoNotes: string;
  } | null>(null);

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-4">Agent Assist Test Page</h1>
      
      <div className="mb-4 space-y-2">
        <div>
          <label htmlFor="callId" className="block text-sm font-medium text-gray-700 mb-1">
            Call ID
          </label>
          <input
            id="callId"
            type="text"
            value={callId}
            onChange={(e) => setCallId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Enter call ID"
          />
        </div>
        <div>
          <label htmlFor="tenantId" className="block text-sm font-medium text-gray-700 mb-1">
            Tenant ID
          </label>
          <input
            id="tenantId"
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Enter tenant ID"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border rounded-lg p-4 bg-white">
          <h2 className="text-lg font-semibold mb-4">Transcript Panel</h2>
          <div className="h-[600px]">
            <TranscriptPanel
              callId={callId}
              tenantId={tenantId}
              onOpenDisposition={(data) => {
                setDispositionData(data);
                setDispositionOpen(true);
              }}
            />
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-white">
          <h2 className="text-lg font-semibold mb-4">KB Suggestions (Standalone)</h2>
          <div className="h-[600px] overflow-y-auto">
            <KBSuggestions
              callId={callId}
              tenantId={tenantId}
              initialSuggestions={[]}
              onSelectArticle={(article) => {
                console.log('[Test] Article selected:', article);
                alert(`Selected: ${article.title}`);
              }}
            />
          </div>
        </div>
      </div>

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
    </div>
  );
}


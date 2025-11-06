'use client';

import { useState, useEffect } from 'react';
import TranscriptPanel from '@/components/TranscriptPanel';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import KBSuggestions from '@/components/KBSuggestions';

interface DispositionTestResult {
  status: 'loading' | 'success' | 'error';
  data?: any;
  error?: string;
}

export default function TestAgentAssistPage() {
  const [callId, setCallId] = useState('test-call-123');
  const [tenantId, setTenantId] = useState('default');
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [dispositionData, setDispositionData] = useState<{
    suggested: Suggestion[];
    autoNotes: string;
  } | null>(null);
  
  // Disposition API test states
  const [parentDispositions, setParentDispositions] = useState<DispositionTestResult>({ status: 'loading' });
  const [subDispositions, setSubDispositions] = useState<DispositionTestResult>({ status: 'loading' });
  const [selectedParentCode, setSelectedParentCode] = useState<string>('');

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

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-4">Agent Assist Test Page</h1>
      
      {/* Disposition Taxonomy Testing Section */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold mb-3">🧪 Disposition Taxonomy Testing</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Parent Dispositions */}
          <div className="bg-white p-4 rounded border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Parent Dispositions</h3>
              <button
                onClick={testParentDispositions}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Test API
              </button>
            </div>
            {parentDispositions.status === 'loading' && (
              <p className="text-sm text-gray-500">Loading...</p>
            )}
            {parentDispositions.status === 'success' && parentDispositions.data && (
              <div className="text-sm">
                <p className="text-green-600 mb-2">
                  ✅ Found {parentDispositions.data.count || 0} parent dispositions
                </p>
                <select
                  value={selectedParentCode}
                  onChange={(e) => {
                    setSelectedParentCode(e.target.value);
                    testSubDispositions(e.target.value);
                  }}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
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
              <p className="text-sm text-red-600">❌ {parentDispositions.error}</p>
            )}
          </div>

          {/* Sub-Dispositions */}
          <div className="bg-white p-4 rounded border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Sub-Dispositions</h3>
              <button
                onClick={() => testSubDispositions()}
                disabled={!selectedParentCode}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Test API
              </button>
            </div>
            {subDispositions.status === 'loading' && (
              <p className="text-sm text-gray-500">Loading...</p>
            )}
            {subDispositions.status === 'success' && subDispositions.data && (
              <div className="text-sm">
                <p className="text-green-600 mb-2">
                  ✅ Found {subDispositions.data.count || 0} sub-dispositions
                </p>
                <div className="max-h-40 overflow-y-auto">
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
              <p className="text-sm text-red-600">❌ {subDispositions.error}</p>
            )}
          </div>
        </div>
      </div>

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


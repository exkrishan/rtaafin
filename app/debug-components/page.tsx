'use client';

import { useState } from 'react';
import AutoDispositionModal from '@/components/AutoDispositionModal';
import KBSuggestions from '@/components/KBSuggestions';
import TranscriptPanel from '@/components/TranscriptPanel';

export default function DebugComponentsPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Component Debug Page</h1>
      
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">1. AutoDispositionModal</h2>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Open Modal
        </button>
        <AutoDispositionModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          callId="debug-001"
          tenantId="default"
          suggested={[
            { code: 'TEST', title: 'Test Disposition', score: 0.9 }
          ]}
          autoNotes="This is a test note"
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">2. KBSuggestions</h2>
        <div className="border p-4 rounded">
          <KBSuggestions
            callId="debug-001"
            tenantId="default"
            initialSuggestions={[]}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">3. TranscriptPanel</h2>
        <div className="border p-4 rounded h-96">
          <TranscriptPanel
            callId="debug-001"
            tenantId="default"
          />
        </div>
      </div>

      <div className="p-4 bg-gray-100 rounded">
        <h3 className="font-semibold mb-2">If components don't appear:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Check browser console (F12) for errors</li>
          <li>Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)</li>
          <li>Check Network tab to see if JavaScript files are loading</li>
          <li>Verify you're using Node.js 20+ (currently: {typeof window !== 'undefined' ? 'Browser' : 'Server'})</li>
        </ul>
      </div>
    </div>
  );
}


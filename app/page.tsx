'use client';

import { useState } from 'react';
import Link from 'next/link';
import AutoDispositionModal from '@/components/AutoDispositionModal';
import TranscriptPanel from '@/components/TranscriptPanel';
import KBSuggestions from '@/components/KBSuggestions';

export default function Home() {
  const [open, setOpen] = useState(false);

  return (
    <main className="min-h-screen space-y-6 bg-gray-50 p-8">
      <h1 className="text-2xl font-semibold text-gray-900">RTAA Demo</h1>
      <p className="text-sm text-gray-600">
        Use the buttons below to preview different components.
      </p>

      <div className="space-y-4">
        <div className="flex gap-4 flex-wrap">
          <button
            onClick={() => setOpen(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            Open Auto Disposition Modal
          </button>
          
          <Link
            href="/test-agent-assist"
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-200 inline-block"
          >
            View Full Agent Assist UI
          </Link>
          
          <Link
            href="/demo"
            className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-200 inline-block"
          >
            🎬 Live Demo (Start Call)
          </Link>
        </div>

        {/* Preview sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="border rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Transcript Panel Preview</h2>
              <button
                onClick={async () => {
                  try {
                    const response = await fetch('/api/test/send-transcript', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ callId: 'demo-call-001', lines: 8 }),
                    });
                    const data = await response.json();
                    if (data.ok) {
                      alert('Test transcript lines sent! Check the transcript panel.');
                    } else {
                      alert('Failed to send test transcript: ' + data.error);
                    }
                  } catch (err) {
                    alert('Error: ' + err);
                  }
                }}
                className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Send Test Lines
              </button>
            </div>
            <div className="h-64 border rounded">
              <TranscriptPanel
                callId="demo-call-001"
                tenantId="default"
              />
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-white">
            <h2 className="text-lg font-semibold mb-4">KB Suggestions Preview</h2>
            <div className="h-64 overflow-y-auto">
              <KBSuggestions
                callId="demo-call-001"
                tenantId="default"
                initialSuggestions={[]}
              />
            </div>
          </div>
        </div>
      </div>

      <AutoDispositionModal
        open={open}
        onClose={() => setOpen(false)}
        callId="demo-call-001"
        tenantId="default"
        suggested={[
          { code: 'RESOLVED', title: 'Resolved', score: 0.92 },
          { code: 'FOLLOW_UP', title: 'Follow Up Required', score: 0.55 },
        ]}
        autoNotes="Customer accepted the resolution; follow up tomorrow with confirmation email."
      />
    </main>
  );
}

'use client';

import { useState } from 'react';
import AutoDispositionModal from '@/components/AutoDispositionModal';

export default function Home() {
  const [open, setOpen] = useState(false);

  return (
    <main className="min-h-screen space-y-6 bg-gray-50 p-8">
      <h1 className="text-2xl font-semibold text-gray-900">RTAA Demo</h1>
      <p className="text-sm text-gray-600">
        Use the button below to preview the Auto-Generated Disposition &amp; Notes modal.
      </p>

      <button
        onClick={() => setOpen(true)}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        Open Auto Disposition Modal
      </button>

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

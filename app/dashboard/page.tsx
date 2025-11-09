'use client';

import { useState } from 'react';
import TranscriptPanel from '@/components/TranscriptPanel';
import AgentAssistPanel, { KBArticle } from '@/components/AgentAssistPanel';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import ToastContainer from '@/components/ToastContainer';

// Mock data loader for Agent Assist articles
function loadMockArticles(): KBArticle[] {
  return [
    {
      id: 'article-1',
      title: 'Fraud Dispute Process',
      snippet: 'Complete guide for handling fraud disputes including required documentation and the step-by-step process for resolving customer fraud claims.',
      url: 'https://example.com/kb/fraud-dispute',
      relevance: 0.9,
    },
    {
      id: 'article-2',
      title: 'Card Blocking Procedures',
      snippet: 'Step-by-step process for temporarily or permanently blocking customer cards, including verification requirements and security measures.',
      url: 'https://example.com/kb/card-blocking',
      relevance: 0.85,
    },
    {
      id: 'article-3',
      title: 'Reset Debit Card PIN',
      snippet: 'Customer can reset PIN through App method or by visiting nearby branch. Includes verification steps and security requirements.',
      url: 'https://example.com/kb/reset-pin',
      relevance: 0.85,
    },
  ];
}

// Placeholder Customer Info component
function CustomerInfoPlaceholder() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Info</h2>
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-text-muted">
            Customer information and interaction history would appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // TODO: Replace with actual Exotel call ID from logs
  // Find it in Ingest Service logs: [exotel] call_sid: "CA123..."
  // Or ASR Worker logs: interaction_id: 'call-1762532332133'
  // For now, using a placeholder - update this with your actual call ID
  const [callId] = useState('call-123'); // ⚠️ UPDATE THIS with your Exotel call ID
  const [tenantId] = useState('default');
  const [showModal, setShowModal] = useState(false);
  const [mockArticles] = useState<KBArticle[]>(loadMockArticles());

  // Mock disposition data for testing
  const mockSuggestions: Suggestion[] = [
    { code: 'CREDIT_CARD', title: '💳 Credit Card', score: 0.9 },
    { code: 'ACCOUNT_ISSUE', title: '🏦 Account Issue', score: 0.7 },
    { code: 'PAYMENT', title: '💵 Payment', score: 0.6 },
  ];
  const mockAutoNotes = 'Manish had previously reported a fraudulent SMS and a small unauthorized debit card transaction in the past few months, leading to a new debit card issuance.';

  const handleFeedback = (articleId: string, liked: boolean) => {
    console.log('[Dashboard] Feedback:', { articleId, liked });
    // Handle feedback - could call API here
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* 3-column grid layout */}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[320px_1fr_360px] gap-6 h-screen p-6">
        {/* Left Column: Transcript */}
        <div className="relative">
          <div className="card h-full flex flex-col">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Transcript</h2>
            <div className="flex-1 overflow-hidden">
              <TranscriptPanel
                callId={callId}
                tenantId={tenantId}
                onOpenDisposition={(data) => {
                  setShowModal(true);
                }}
              />
            </div>
          </div>
          
          {/* Floating button for dev testing */}
          <button
            onClick={() => setShowModal(true)}
            className="absolute bottom-6 right-6 px-4 py-2 bg-brand text-white text-sm font-medium rounded-md shadow-lg hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-brand/20"
            aria-label="Open disposition modal (dev)"
          >
            Open Disposition Modal (dev)
          </button>
        </div>

        {/* Center Column: Customer Info */}
        <div className="overflow-y-auto">
          <CustomerInfoPlaceholder />
        </div>

        {/* Right Column: Agent Assist Panel (hidden on <1024px) */}
        <div className="hidden lg:block overflow-y-auto">
          <AgentAssistPanel
            articles={mockArticles}
            callId={callId}
            onFeedback={handleFeedback}
          />
        </div>
      </div>

      {/* Auto Disposition Modal */}
      <AutoDispositionModal
        open={showModal}
        onClose={() => setShowModal(false)}
        callId={callId}
        tenantId={tenantId}
        suggested={mockSuggestions}
        autoNotes={mockAutoNotes}
      />

      {/* Toast Container */}
      <ToastContainer />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { showToast } from '@/components/ToastContainer';

export default function TestIngestPage() {
  const [callId] = useState(`test-${Date.now()}`);
  const [tenantId] = useState('default');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const testTranscript = [
    "Customer: Hi, I'm calling about my Platinum Credit Card. I noticed a fraudulent transaction yesterday.",
    "Agent: I understand your concern. Let me help you with that. Can you provide your card number ending in?",
    "Customer: Yes, it's ending in 7792. The transaction was for $500 at a store I've never been to.",
    "Agent: Thank you. I can see the unauthorized charge on your account. I'll help you dispute this transaction.",
    "Customer: That would be great. How long will it take to get a replacement card?",
  ];

  const ingestLine = async (text: string, seq: number) => {
    try {
      const response = await fetch('/api/calls/ingest-transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({
          callId,
          seq,
          ts: new Date().toISOString(),
          text,
        }),
      });

      const data = await response.json();
      return data;
    } catch (err: any) {
      console.error('Ingest error:', err);
      return { ok: false, error: err.message };
    }
  };

  const runTest = async () => {
    setIsLoading(true);
    setResults([]);
    showToast('Starting test...', 'info');

    const testResults: any[] = [];

    for (let i = 0; i < testTranscript.length; i++) {
      const line = testTranscript[i];
      const seq = i + 1;

      console.log(`[Test] Ingesting line ${seq}...`);
      const result = await ingestLine(line, seq);
      
      testResults.push({
        seq,
        text: line.substring(0, 60) + '...',
        intent: result.intent || 'unknown',
        confidence: result.confidence || 0,
        articlesCount: result.articles?.length || 0,
        articles: result.articles || [],
        ok: result.ok,
      });

      setResults([...testResults]);
      
      // Wait between lines
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsLoading(false);
    showToast('Test complete!', 'success');
  };

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Test Intent Detection & KB Articles</h1>
        
        <div className="card mb-6">
          <div className="mb-4">
            <p className="text-sm text-text-muted mb-2">Call ID: <code className="bg-gray-100 px-2 py-1 rounded">{callId}</code></p>
            <p className="text-sm text-text-muted">Tenant ID: <code className="bg-gray-100 px-2 py-1 rounded">{tenantId}</code></p>
          </div>
          
          <button
            onClick={runTest}
            disabled={isLoading}
            className="px-4 py-2 bg-brand text-white rounded-md font-medium hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Running Test...' : 'Run Test'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Results</h2>
            
            {results.map((result, idx) => (
              <div key={idx} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      Line {result.seq}: {result.text}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-text-muted">
                      <span>Intent: <strong className={result.intent !== 'unknown' ? 'text-green-600' : 'text-red-600'}>{result.intent}</strong></span>
                      <span>Confidence: {result.confidence.toFixed(2)}</span>
                      <span>Articles: {result.articlesCount}</span>
                    </div>
                  </div>
                  {result.ok ? (
                    <span className="text-green-600 text-sm">✅</span>
                  ) : (
                    <span className="text-red-600 text-sm">❌</span>
                  )}
                </div>

                {result.articles && result.articles.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border-soft">
                    <p className="text-xs font-medium text-gray-700 mb-2">KB Articles Found:</p>
                    <ul className="space-y-1">
                      {result.articles.map((article: any, aidx: number) => (
                        <li key={aidx} className="text-xs text-text-muted">
                          • {article.title || article.code || 'Unknown'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.intent === 'unknown' && (
                  <div className="mt-3 pt-3 border-t border-border-soft">
                    <p className="text-xs text-red-600">
                      ⚠️ Intent detection failed. Check server terminal logs for errors.
                    </p>
                  </div>
                )}
              </div>
            ))}

            <div className="card bg-blue-50 border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">Summary</h3>
              <div className="text-sm text-blue-800 space-y-1">
                <p>Total lines: {results.length}</p>
                <p>Successful: {results.filter(r => r.ok).length}</p>
                <p>Intent detected: {results.filter(r => r.intent !== 'unknown').length}</p>
                <p>KB articles found: {results.filter(r => r.articlesCount > 0).length}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 card bg-yellow-50 border-yellow-200">
          <h3 className="font-semibold text-yellow-900 mb-2">Debugging Tips</h3>
          <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
            <li>Check your dev server terminal for detailed logs</li>
            <li>Look for: <code>[ingest-transcript] Detecting intent</code></li>
            <li>Look for: <code>[intent] Calling Google Gemini API</code></li>
            <li>If intent is "unknown", check for Gemini API errors in server logs</li>
            <li>Open browser console (F12) to see additional logs</li>
          </ul>
        </div>
      </div>
    </div>
  );
}


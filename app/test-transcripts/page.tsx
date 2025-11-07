'use client';

import { useState, useEffect } from 'react';

interface Transcript {
  interaction_id: string;
  tenant_id: string;
  seq: number;
  type: 'partial' | 'final';
  text: string;
  confidence?: number;
  timestamp_ms: number;
}

export default function TestTranscriptsPage() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [interactionId, setInteractionId] = useState('');
  const [status, setStatus] = useState<string>('');

  // Fetch transcripts from API
  const fetchTranscripts = async (id: string) => {
    try {
      const response = await fetch(`/api/transcripts/fetch?interactionId=${id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.transcripts) {
          setTranscripts(data.transcripts);
        }
      }
    } catch (error) {
      console.error('Failed to fetch transcripts:', error);
    }
  };

  // Subscribe to transcripts via SSE
  useEffect(() => {
    if (!interactionId || !isSubscribed) return;

    const eventSource = new EventSource(
      `/api/events/stream?callId=${interactionId}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'transcript_line') {
          setTranscripts((prev) => [
            ...prev,
            {
              interaction_id: interactionId,
              tenant_id: data.tenantId || 'default',
              seq: data.seq || prev.length + 1,
              type: data.type || 'partial',
              text: data.text || '',
              timestamp_ms: Date.now(),
            },
          ]);
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setIsSubscribed(false);
    };

    return () => {
      eventSource.close();
    };
  }, [interactionId, isSubscribed]);

  const handleSubscribe = async () => {
    if (!interactionId) {
      setStatus('Please enter an interaction ID');
      return;
    }

    try {
      const response = await fetch('/api/transcripts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId }),
      });

      if (response.ok) {
        setIsSubscribed(true);
        setStatus('✅ Subscribed to transcripts');
        fetchTranscripts(interactionId);
      } else {
        const error = await response.json();
        setStatus(`❌ Failed: ${error.error}`);
      }
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
    }
  };

  const handleCheckStatus = async () => {
    try {
      const response = await fetch('/api/transcripts/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(JSON.stringify(data.status, null, 2));
      }
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
    }
  };

  const handleTestPublish = async () => {
    if (!interactionId) {
      setStatus('Please enter an interaction ID');
      return;
    }

    try {
      // Simulate a transcript message
      const response = await fetch('/api/calls/ingest-transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'test',
        },
        body: JSON.stringify({
          callId: interactionId,
          seq: transcripts.length + 1,
          ts: new Date().toISOString(),
          text: 'Test transcript message from UI',
        }),
      });

      if (response.ok) {
        setStatus('✅ Test transcript sent');
      } else {
        const error = await response.text();
        setStatus(`❌ Failed: ${error}`);
      }
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Transcript Testing UI</h1>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Controls</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Interaction ID / Call ID
              </label>
              <input
                type="text"
                value={interactionId}
                onChange={(e) => setInteractionId(e.target.value)}
                placeholder="e.g., call-1762530768573"
                className="w-full px-4 py-2 border rounded-md"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleSubscribe}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Subscribe to Transcripts
              </button>
              <button
                onClick={handleCheckStatus}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Check Consumer Status
              </button>
              <button
                onClick={handleTestPublish}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Send Test Transcript
              </button>
              <button
                onClick={() => {
                  setTranscripts([]);
                  setStatus('');
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Clear
              </button>
            </div>

            {status && (
              <div className="p-3 bg-gray-100 rounded-md">
                <pre className="text-sm whitespace-pre-wrap">{status}</pre>
              </div>
            )}
          </div>
        </div>

        {/* Transcripts Display */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              Transcripts ({transcripts.length})
            </h2>
            {isSubscribed && (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                Subscribed
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {transcripts.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No transcripts yet. Subscribe to an interaction ID to see transcripts.
              </p>
            ) : (
              transcripts.map((transcript, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-md border ${
                    transcript.type === 'final'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex gap-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          transcript.type === 'final'
                            ? 'bg-green-200 text-green-800'
                            : 'bg-blue-200 text-blue-800'
                        }`}
                      >
                        {transcript.type}
                      </span>
                      <span className="text-sm text-gray-600">
                        Seq: {transcript.seq}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(transcript.timestamp_ms).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-2">
                    <p
                      className={`font-medium ${
                        transcript.text ? 'text-gray-900' : 'text-red-600'
                      }`}
                    >
                      {transcript.text || '(empty text)'}
                    </p>
                    {transcript.confidence && (
                      <p className="text-xs text-gray-500 mt-1">
                        Confidence: {(transcript.confidence * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 rounded-lg p-6">
          <h3 className="font-semibold mb-2">How to Use:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Enter an interaction ID (e.g., from ASR worker logs)</li>
            <li>Click "Subscribe to Transcripts" to start receiving updates</li>
            <li>Watch transcripts appear in real-time</li>
            <li>Use "Check Consumer Status" to see transcript consumer state</li>
            <li>Use "Send Test Transcript" to manually inject a test message</li>
          </ol>
        </div>
      </div>
    </div>
  );
}


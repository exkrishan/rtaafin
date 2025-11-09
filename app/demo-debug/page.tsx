'use client';

import { useState, useEffect } from 'react';

export default function DemoDebugPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [callId] = useState(`demo-call-${Date.now()}`);
  const [sseConnected, setSseConnected] = useState(false);
  const [transcriptCount, setTranscriptCount] = useState(0);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(message);
  };

  useEffect(() => {
    // Test SSE connection
    addLog(`🔌 Connecting to SSE stream for callId: ${callId}`);
    const url = `/api/events/stream?callId=${encodeURIComponent(callId)}`;
    addLog(`📍 SSE URL: ${url}`);
    
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      addLog('✅ SSE connection opened');
      setSseConnected(true);
    };

    eventSource.onerror = (err) => {
      addLog(`❌ SSE error: readyState=${eventSource.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);
      setSseConnected(false);
    };

    eventSource.addEventListener('transcript_line', (event) => {
      try {
        const data = JSON.parse(event.data);
        addLog(`📨 Received transcript_line: seq=${data.seq}, text="${data.text?.substring(0, 50)}..."`);
        setTranscriptCount(prev => prev + 1);
      } catch (err) {
        addLog(`❌ Failed to parse transcript_line: ${err}`);
      }
    });

    return () => {
      eventSource.close();
      addLog('🔌 SSE connection closed');
    };
  }, [callId]);

  const testSendTranscript = async () => {
    addLog(`📤 Sending test transcript to /api/calls/ingest-transcript`);
    
    try {
      const response = await fetch('/api/calls/ingest-transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'default',
        },
        body: JSON.stringify({
          callId,
          seq: 1,
          ts: new Date().toISOString(),
          text: 'Test: Agent: Hello, this is a test transcript line',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        addLog(`✅ Transcript sent successfully: intent=${result.intent}, articles=${result.articles?.length || 0}`);
      } else {
        const error = await response.text();
        addLog(`❌ Failed to send transcript: ${response.status} ${error}`);
      }
    } catch (err: any) {
      addLog(`❌ Error sending transcript: ${err.message}`);
    }
  };

  const testDebugEndpoint = async () => {
    addLog(`📤 Testing debug endpoint /api/debug/test-transcript`);
    
    try {
      const response = await fetch('/api/debug/test-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          text: 'Debug test transcript',
          seq: 999,
        }),
      });

      const result = await response.json();
      addLog(`✅ Debug endpoint response: ${JSON.stringify(result)}`);
    } catch (err: any) {
      addLog(`❌ Debug endpoint error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Demo Debug Page</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h2 className="text-lg font-semibold mb-4">Status</h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span>SSE Connection: {sseConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div>
              <span>Call ID: <code className="bg-gray-100 px-2 py-1 rounded">{callId}</code></span>
            </div>
            <div>
              <span>Transcripts Received: <strong>{transcriptCount}</strong></span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h2 className="text-lg font-semibold mb-4">Actions</h2>
          <div className="flex gap-4">
            <button
              onClick={testSendTranscript}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Test Send Transcript
            </button>
            <button
              onClick={testDebugEndpoint}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Test Debug Endpoint
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Logs</h2>
          <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500">No logs yet...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


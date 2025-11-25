'use client';

import { useState } from 'react';
import { useRealtimeTranscript } from '@/hooks/useRealtimeTranscript';

export default function SimpleTranscriptTestPage() {
  const [callId, setCallId] = useState('test-1764084348');
  
  // Use the hook directly - this is the ONLY way we connect to SSE
  const { 
    transcripts, 
    isConnected, 
    error 
  } = useRealtimeTranscript(callId || null, {
    autoReconnect: true,
  });

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>
        🧪 Simple Transcript Test (Direct Hook Test)
      </h1>

      {/* Connection Status */}
      <div style={{ 
        padding: '15px', 
        marginBottom: '20px',
        borderRadius: '8px',
        backgroundColor: isConnected ? '#d1fae5' : '#fee2e2',
        border: `2px solid ${isConnected ? '#10b981' : '#ef4444'}`
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
          Connection Status:
        </div>
        <div>
          {isConnected ? (
            <span style={{ color: '#065f46' }}>✅ CONNECTED</span>
          ) : (
            <span style={{ color: '#991b1b' }}>❌ DISCONNECTED</span>
          )}
        </div>
        {error && (
          <div style={{ marginTop: '10px', color: '#991b1b', fontSize: '14px' }}>
            Error: {error}
          </div>
        )}
      </div>

      {/* CallId Input */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
          Call ID:
        </label>
        <input
          type="text"
          value={callId}
          onChange={(e) => setCallId(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '16px'
          }}
          placeholder="Enter callId (e.g., test-1764084348)"
        />
      </div>

      {/* Transcripts Display */}
      <div style={{ 
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '20px',
        minHeight: '400px',
        backgroundColor: '#f9fafb'
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>
          Transcripts ({transcripts.length})
        </h2>

        {transcripts.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px',
            color: '#6b7280'
          }}>
            {isConnected 
              ? 'Waiting for transcripts...' 
              : 'Not connected. Waiting for connection...'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {transcripts.map((transcript, index) => (
              <div
                key={transcript.id || index}
                style={{
                  padding: '15px',
                  borderRadius: '8px',
                  backgroundColor: transcript.speaker === 'agent' ? '#dbeafe' : '#dcfce7',
                  borderLeft: `4px solid ${transcript.speaker === 'agent' ? '#3b82f6' : '#10b981'}`,
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  marginBottom: '8px'
                }}>
                  <span style={{ 
                    fontWeight: 'bold',
                    color: transcript.speaker === 'agent' ? '#1e40af' : '#065f46'
                  }}>
                    {transcript.speaker === 'agent' ? '👤 Agent' : '👤 Customer'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {new Date(transcript.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ fontSize: '16px', color: '#111827' }}>
                  {transcript.text}
                </div>
                {transcript.confidence && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                    Confidence: {(transcript.confidence * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Debug Info */}
      <div style={{ 
        marginTop: '20px',
        padding: '15px',
        backgroundColor: '#f3f4f6',
        borderRadius: '8px',
        fontSize: '14px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Debug Info:</div>
        <div>Call ID: {callId || '(none)'}</div>
        <div>Connected: {isConnected ? 'Yes' : 'No'}</div>
        <div>Transcript Count: {transcripts.length}</div>
        <div>Error: {error || 'None'}</div>
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#6b7280' }}>
          Check browser console for detailed logs:
          <br />
          - Look for: [useRealtimeTranscript] ✅ SSE connection opened
          <br />
          - OR: [useRealtimeTranscript] ✅ Received connection confirmation
        </div>
      </div>
    </div>
  );
}


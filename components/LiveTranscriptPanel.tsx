'use client';

import { TranscriptUtterance } from '@/hooks/useRealtimeTranscript';

export interface LiveTranscriptPanelProps {
  transcripts: TranscriptUtterance[];
  isConnected: boolean;
  error: string | null;
  className?: string;
}

/**
 * LiveTranscriptPanel - Clean transcript display component
 * 
 * Receives transcripts as props to avoid duplicate EventSource connections.
 * The parent component (Live page) manages the single connection via useRealtimeTranscript hook.
 * 
 * Backend ReadableStream is already working - no changes needed
 * Hook improvements are already in place (15s timeout, timestamp validation, callId matching)
 */
export default function LiveTranscriptPanel({
  transcripts,
  isConnected,
  error,
  className = '',
}: LiveTranscriptPanelProps) {

  return (
    <div className={className}>
      {/* Connection Status */}
      <div className={`mb-4 p-3 rounded-lg border-2 ${
        isConnected 
          ? 'bg-green-50 border-green-500' 
          : 'bg-red-50 border-red-500'
      }`}>
        <div className="font-semibold text-sm mb-1">Connection Status:</div>
        <div className="text-sm">
          {isConnected ? (
            <span className="text-green-700">✅ CONNECTED</span>
          ) : (
            <span className="text-red-700">❌ DISCONNECTED</span>
          )}
        </div>
        {error && (
          <div className="mt-2 text-sm text-red-700">
            Error: {error}
          </div>
        )}
      </div>

      {/* Transcripts Display */}
      <div className="border border-gray-300 rounded-lg p-5 min-h-[400px] bg-gray-50">
        <h2 className="text-lg font-semibold mb-4">
          Transcripts ({transcripts.length})
        </h2>

        {transcripts.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            {isConnected 
              ? 'Waiting for transcripts...' 
              : 'Not connected. Waiting for connection...'}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {transcripts.map((transcript, index) => (
              <div
                key={transcript.id || index}
                className={`p-4 rounded-lg border-l-4 ${
                  transcript.speaker === 'agent' 
                    ? 'bg-blue-50 border-blue-500' 
                    : 'bg-green-50 border-green-500'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={`font-semibold ${
                    transcript.speaker === 'agent' 
                      ? 'text-blue-700' 
                      : 'text-green-700'
                  }`}>
                    {transcript.speaker === 'agent' ? '👤 Agent' : '👤 Customer'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {(() => {
                      try {
                        const date = new Date(transcript.timestamp);
                        if (isNaN(date.getTime())) {
                          return 'Invalid Date';
                        }
                        return date.toLocaleTimeString();
                      } catch (err) {
                        return 'Invalid Date';
                      }
                    })()}
                  </span>
                </div>
                <div className="text-gray-900">
                  {transcript.text}
                </div>
                {transcript.confidence && (
                  <div className="text-xs text-gray-500 mt-1">
                    Confidence: {(transcript.confidence * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


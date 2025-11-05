'use client';

/**
 * Real-Time Agent Assist Dashboard
 * Displays live transcript, detected intents, and KB article recommendations
 *
 * Features:
 * - SSE connection with auto-reconnect
 * - Live transcript scrolling
 * - Intent confidence display
 * - Top 3 KB article recommendations
 * - Per-call subscription
 */

import { useEffect, useState, useRef } from 'react';
import RealtimeNotice, { ConnectionStatus } from '../components/RealtimeNotice';

interface TranscriptLine {
  seq: number;
  ts: string;
  text: string;
}

interface IntentData {
  intent: string;
  confidence: number;
  seq: number;
}

interface KBArticle {
  id: string;
  title: string;
  snippet: string;
  url: string;
  tags?: string[];
}

export default function DashboardPage() {
  const [callId, setCallId] = useState<string>('call-123');
  const [inputCallId, setInputCallId] = useState<string>('call-123');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastEventTime, setLastEventTime] = useState<Date | undefined>();
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [latestIntent, setLatestIntent] = useState<IntentData | null>(null);
  const [articles, setArticles] = useState<KBArticle[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Connect to SSE stream
  const connect = (targetCallId: string) => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    console.log('[dashboard] Connecting to SSE stream', { callId: targetCallId });
    setConnectionStatus('reconnecting');

    try {
      const url = `/api/events/stream?callId=${encodeURIComponent(targetCallId)}`;
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        console.log('[dashboard] SSE connection opened');
        setConnectionStatus('connected');
        setReconnectAttempts(0);

        // Fetch initial intent on connect
        fetchInitialIntent(targetCallId);
      };

      // Handle transcript_line events
      eventSource.addEventListener('transcript_line', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[dashboard] Received transcript_line', data);

          setLastEventTime(new Date());

          // Skip system messages
          if (data.callId === 'system') return;

          setTranscript((prev) => {
            // Deduplicate by seq
            const exists = prev.some((line) => line.seq === data.seq);
            if (exists) return prev;

            return [
              ...prev,
              {
                seq: data.seq,
                ts: data.ts,
                text: data.text,
              },
            ].sort((a, b) => a.seq - b.seq);
          });
        } catch (err) {
          console.error('[dashboard] Failed to parse transcript_line', err);
        }
      });

      // Handle intent_update events
      eventSource.addEventListener('intent_update', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[dashboard] Received intent_update', data);

          setLastEventTime(new Date());

          setLatestIntent({
            intent: data.intent,
            confidence: data.confidence,
            seq: data.seq,
          });

          if (data.articles && Array.isArray(data.articles)) {
            setArticles(data.articles.slice(0, 3));
          }
        } catch (err) {
          console.error('[dashboard] Failed to parse intent_update', err);
        }
      });

      eventSource.onerror = (error) => {
        console.error('[dashboard] SSE error', error);
        eventSource.close();
        setConnectionStatus('disconnected');

        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        console.log('[dashboard] Reconnecting in', delay, 'ms');

        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts((prev) => prev + 1);
          connect(targetCallId);
        }, delay);
      };

      eventSourceRef.current = eventSource;
    } catch (err) {
      console.error('[dashboard] Failed to create EventSource', err);
      setConnectionStatus('disconnected');
    }
  };

  // Fetch initial intent state on connect
  const fetchInitialIntent = async (targetCallId: string) => {
    try {
      const res = await fetch(`/api/calls/intent?callId=${encodeURIComponent(targetCallId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setLatestIntent({
            intent: data.intent,
            confidence: data.confidence,
            seq: data.seq,
          });
        }
      }
    } catch (err) {
      console.warn('[dashboard] Failed to fetch initial intent', err);
    }
  };

  // Connect on mount and callId change
  useEffect(() => {
    connect(callId);

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [callId]);

  // Handle call ID change
  const handleCallIdChange = () => {
    if (inputCallId.trim()) {
      setCallId(inputCallId.trim());
      setTranscript([]); // Clear transcript
      setLatestIntent(null);
      setArticles([]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Real-Time Agent Assist</h1>
            <p className="text-sm text-gray-600 mt-1">Live transcript & intent detection</p>
          </div>
          <RealtimeNotice
            status={connectionStatus}
            lastEventTime={lastEventTime}
            reconnectAttempts={reconnectAttempts}
          />
        </div>

        {/* Call ID input */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Call ID to monitor
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputCallId}
              onChange={(e) => setInputCallId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCallIdChange()}
              placeholder="call-123"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleCallIdChange}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Connect
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Current: <span className="font-mono font-medium">{callId}</span>
          </p>
        </div>

        {/* Main content: Transcript + Intent/Articles */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Transcript (2/3 width on large screens) */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Live Transcript</h2>
              <p className="text-sm text-gray-600 mt-1">
                {transcript.length} {transcript.length === 1 ? 'line' : 'lines'}
              </p>
            </div>
            <div className="p-4 h-[500px] overflow-y-auto space-y-2">
              {transcript.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <p>Waiting for transcript data...</p>
                </div>
              ) : (
                transcript.map((line) => (
                  <div
                    key={line.seq}
                    className="p-3 bg-gray-50 rounded border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-mono text-gray-500">seq {line.seq}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(line.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900">{line.text}</p>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          {/* Intent + Articles (1/3 width on large screens) */}
          <div className="space-y-4">
            {/* Latest Intent */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Latest Intent</h2>
              </div>
              <div className="p-4">
                {latestIntent ? (
                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">Intent:</span>
                      <span className="text-xs font-mono text-gray-400">seq {latestIntent.seq}</span>
                    </div>
                    <p className="text-lg font-semibold text-blue-600 mb-2">
                      {latestIntent.intent}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Confidence:</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-green-500 h-full transition-all duration-300"
                          style={{ width: `${latestIntent.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {(latestIntent.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 py-8">
                    <p>No intent detected yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* KB Articles */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Recommended Articles</h2>
              </div>
              <div className="p-4 space-y-3">
                {articles.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <p>No articles available</p>
                  </div>
                ) : (
                  articles.map((article) => (
                    <div
                      key={article.id}
                      className="p-3 border border-gray-200 rounded hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <h3 className="font-medium text-sm text-gray-900 mb-1">
                        {article.title}
                      </h3>
                      <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                        {article.snippet}
                      </p>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View article →
                      </a>
                      {article.tags && article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {article.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

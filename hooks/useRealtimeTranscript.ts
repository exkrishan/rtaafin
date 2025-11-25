/**
 * Custom hook for real-time transcript streaming via Server-Sent Events (SSE)
 * 
 * CTO Implementation: Clean, reusable hook that handles:
 * - EventSource connection lifecycle
 * - Automatic reconnection
 * - Connection state management
 * - Transcript accumulation
 * - Error handling
 * 
 * Usage:
 *   const { transcripts, isConnected, error } = useRealtimeTranscript(callId);
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface TranscriptUtterance {
  id: string;
  text: string;
  speaker: 'agent' | 'customer';
  timestamp: string;
  seq?: number;
  confidence?: number;
}

export interface UseRealtimeTranscriptResult {
  transcripts: TranscriptUtterance[];
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

export function useRealtimeTranscript(
  callId: string | null,
  options?: {
    onTranscript?: (utterance: TranscriptUtterance) => void;
    onConnectionChange?: (connected: boolean) => void;
    autoReconnect?: boolean;
    reconnectDelay?: number;
  }
): UseRealtimeTranscriptResult {
  const [transcripts, setTranscripts] = useState<TranscriptUtterance[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const shouldReconnectRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  
  const {
    onTranscript,
    onConnectionChange,
    autoReconnect = true,
    reconnectDelay = 2000,
  } = options || {};

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = undefined;
    }
  }, []);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    cleanup();
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    // Trigger reconnection by updating callId (via useEffect)
    // This is a workaround - we'll actually reconnect in the useEffect
    if (callId) {
      // Force reconnection by clearing and re-establishing
      const url = `/api/events/stream?callId=${encodeURIComponent(callId)}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      // The rest of the connection logic will be handled by the useEffect
    }
  }, [callId, cleanup]);

  useEffect(() => {
    // Don't connect if no callId
    if (!callId) {
      setIsConnected(false);
      setError(null);
      setTranscripts([]);
      cleanup();
      return;
    }

    // Reset state
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    setError(null);

    const connect = () => {
      // Clean up any existing connection
      cleanup();

      const url = `/api/events/stream?callId=${encodeURIComponent(callId)}`;
      console.log('[useRealtimeTranscript] 🔌 Connecting to SSE', { callId, url });
      
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // Connection timeout: if onopen doesn't fire within 5 seconds, consider it failed
      connectionTimeoutRef.current = setTimeout(() => {
        if (eventSource.readyState !== EventSource.OPEN) {
          console.warn('[useRealtimeTranscript] ⚠️ Connection timeout (5s)');
          eventSource.close();
          setError('Connection timeout - server may be slow');
          setIsConnected(false);
          
          // Retry if auto-reconnect is enabled
          if (autoReconnect && shouldReconnectRef.current) {
            reconnectAttemptsRef.current++;
            const delay = reconnectDelay * Math.min(reconnectAttemptsRef.current, 5); // Max 5x delay
            console.log(`[useRealtimeTranscript] Retrying in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
            reconnectTimeoutRef.current = setTimeout(connect, delay);
          }
        }
      }, 5000);

      // Connection opened successfully
      eventSource.onopen = () => {
        clearTimeout(connectionTimeoutRef.current);
        reconnectAttemptsRef.current = 0; // Reset on successful connection
        
        console.log('[useRealtimeTranscript] ✅ SSE connection opened', {
          callId,
          readyState: eventSource.readyState,
        });
        
        setIsConnected(true);
        setError(null);
        onConnectionChange?.(true);
      };

      // Connection error
      eventSource.onerror = (e) => {
        const readyState = eventSource.readyState;
        console.log('[useRealtimeTranscript] SSE error event', {
          callId,
          readyState,
          readyStateName: readyState === 0 ? 'CONNECTING' : readyState === 1 ? 'OPEN' : 'CLOSED',
        });

        if (readyState === EventSource.CLOSED) {
          clearTimeout(connectionTimeoutRef.current);
          setIsConnected(false);
          onConnectionChange?.(false);
          
          // EventSource will auto-reconnect, but we add manual retry as backup
          if (autoReconnect && shouldReconnectRef.current) {
            reconnectAttemptsRef.current++;
            const delay = reconnectDelay * Math.min(reconnectAttemptsRef.current, 5);
            console.log(`[useRealtimeTranscript] Auto-reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
            reconnectTimeoutRef.current = setTimeout(connect, delay);
          } else if (!autoReconnect) {
            setError('Connection closed');
          }
        } else if (readyState === EventSource.OPEN) {
          // Connection is actually open, just clear any error
          setIsConnected(true);
          setError(null);
        }
      };

      // Listen for transcript_line events
      eventSource.addEventListener('transcript_line', (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventCallId = data.callId || data.interaction_id || data.interactionId;
          
          // Skip system messages
          if (data.text && (
            data.text.includes('Connected to realtime stream') ||
            data.text.includes('clientId:') ||
            data.callId === 'system'
          )) {
            return;
          }

          // Match callId - must match exactly or be missing (assume it's for this call)
          const callIdMatches = !eventCallId || eventCallId === callId;
          
          if (!callIdMatches) {
            console.debug('[useRealtimeTranscript] CallId mismatch, skipping', {
              eventCallId,
              expectedCallId: callId,
            });
            return;
          }

          // Only process if we have text
          if (!data.text || data.text.trim().length === 0) {
            return;
          }

          // Determine speaker
          let speaker: 'agent' | 'customer' = 'customer';
          let text = data.text.trim();
          
          if (data.speaker) {
            speaker = data.speaker.toLowerCase() === 'agent' ? 'agent' : 'customer';
          } else if (text.match(/^Agent:\s*/i)) {
            speaker = 'agent';
            text = text.replace(/^Agent:\s*/i, '').trim();
          } else if (text.match(/^Customer:\s*/i)) {
            speaker = 'customer';
            text = text.replace(/^Customer:\s*/i, '').trim();
          }

          if (!text || text.length === 0) {
            return;
          }

          // Create utterance
          const utterance: TranscriptUtterance = {
            id: data.seq?.toString() || `${Date.now()}-${Math.random()}`,
            text,
            speaker,
            timestamp: data.ts || new Date().toISOString(),
            seq: data.seq,
            confidence: data.confidence || 0.95,
          };

          // Add to transcripts (check for duplicates)
          setTranscripts((prev) => {
            const exists = prev.some(
              (u) => u.id === utterance.id || (data.seq && u.seq === data.seq)
            );
            if (exists) {
              console.debug('[useRealtimeTranscript] Skipping duplicate utterance', {
                id: utterance.id,
                seq: data.seq,
              });
              return prev;
            }
            return [...prev, utterance];
          });

          // Call callback if provided
          onTranscript?.(utterance);
        } catch (err) {
          console.error('[useRealtimeTranscript] Failed to parse transcript_line', err, event.data);
        }
      });

      // Listen for connection events (from our initial connection message)
      eventSource.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connection' && data.message === 'connected') {
            // This is our initial connection message - connection is ready
            console.log('[useRealtimeTranscript] Received connection confirmation', { callId });
          }
        } catch (err) {
          // Ignore parse errors for non-JSON messages
        }
      });
    };

    // Initial connection
    connect();

    // Cleanup on unmount or callId change
    return () => {
      shouldReconnectRef.current = false;
      cleanup();
    };
  }, [callId, autoReconnect, reconnectDelay, onTranscript, onConnectionChange, cleanup]);

  return {
    transcripts,
    isConnected,
    error,
    reconnect,
  };
}


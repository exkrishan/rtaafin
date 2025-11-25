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
    onCallEnd?: (event: MessageEvent) => void;
    onIntentUpdate?: (event: MessageEvent) => void;
    autoReconnect?: boolean;
    reconnectDelay?: number;
  }
): UseRealtimeTranscriptResult {
  // CRITICAL: Limit transcript array size to prevent memory issues (OOM crashes)
  // 500 transcripts = ~150 KB per call, safe for 512MB instances with multiple concurrent calls
  // Reduced from 1000 to 500 to prevent OOM crashes on Render.com Starter plan (512MB RAM)
  const MAX_TRANSCRIPTS = 500;
  
  const [transcripts, setTranscripts] = useState<TranscriptUtterance[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const shouldReconnectRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSeqRef = useRef<number>(0); // Track last seq to only fetch new transcripts
  
  const {
    onTranscript,
    onConnectionChange,
    onCallEnd,
    onIntentUpdate,
    autoReconnect = true,
    reconnectDelay = 5000, // 5 second base delay for Render.com wake-up
  } = options || {};

  // CRITICAL: Use refs for ALL callbacks to prevent infinite reconnection loop
  // Callbacks are recreated on every render, so we use refs to avoid dependency issues
  const onTranscriptRef = useRef(onTranscript);
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onCallEndRef = useRef(onCallEnd);
  const onIntentUpdateRef = useRef(onIntentUpdate);

  // Update refs when callbacks change (without triggering reconnection)
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onConnectionChangeRef.current = onConnectionChange;
    onCallEndRef.current = onCallEnd;
    onIntentUpdateRef.current = onIntentUpdate;
  });

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
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = undefined;
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

      // CRITICAL FIX: Increased timeout for Render.com free tier (takes 50s+ to wake up from sleep)
      // Connection timeout: if onopen doesn't fire within 60 seconds, consider it failed
      const connectionTimeoutMs = 60000; // 60 seconds to handle Render.com 50s+ wake-up delay
      connectionTimeoutRef.current = setTimeout(() => {
        if (eventSource.readyState !== EventSource.OPEN) {
          console.warn(`[useRealtimeTranscript] ⚠️ Connection timeout (${connectionTimeoutMs / 1000}s)`, {
            callId,
            readyState: eventSource.readyState,
            reconnectAttempts: reconnectAttemptsRef.current,
          });
          eventSource.close();
          setError('Connection timeout - using polling fallback');
          setIsConnected(false);
          
          // CRITICAL: Start polling fallback when SSE fails
          if (!pollIntervalRef.current) {
            console.log('[useRealtimeTranscript] 🔄 Starting polling fallback (SSE connection failed)', { callId });
            startPolling();
          }
          
          // Retry if auto-reconnect is enabled
          if (autoReconnect && shouldReconnectRef.current) {
            reconnectAttemptsRef.current++;
            const delay = reconnectDelay * Math.min(reconnectAttemptsRef.current, 5); // Max 5x delay
            console.log(`[useRealtimeTranscript] Retrying in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
            reconnectTimeoutRef.current = setTimeout(connect, delay);
          }
        }
      }, connectionTimeoutMs);

      // Connection opened successfully
      eventSource.onopen = () => {
        clearTimeout(connectionTimeoutRef.current);
        reconnectAttemptsRef.current = 0; // Reset on successful connection
        
        // Stop polling when SSE connects successfully
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = undefined;
          console.log('[useRealtimeTranscript] 🛑 Stopped polling (SSE connected)', { callId });
        }
        
        console.log('[useRealtimeTranscript] ✅ SSE connection opened', {
          callId,
          readyState: eventSource.readyState,
        });
        
        setIsConnected(true);
        setError(null);
        onConnectionChangeRef.current?.(true);
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
          onConnectionChangeRef.current?.(false);
          
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
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = undefined;
          setIsConnected(true);
          setError(null);
          onConnectionChangeRef.current?.(true); // CRITICAL: Notify that we're connected
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

          // CRITICAL FIX: Improved callId matching - case-insensitive and handles edge cases
          // Must match exactly (case-insensitive) or be missing (assume it's for this call)
          let callIdMatches = !eventCallId || eventCallId === callId;
          
          if (!callIdMatches && eventCallId && callId) {
            // Try case-insensitive matching
            const normalizedEventCallId = String(eventCallId).trim().toLowerCase();
            const normalizedCallId = String(callId).trim().toLowerCase();
            callIdMatches = normalizedEventCallId === normalizedCallId;
          }
          
          if (!callIdMatches) {
            console.debug('[useRealtimeTranscript] CallId mismatch, skipping', {
              eventCallId,
              expectedCallId: callId,
              normalizedEvent: eventCallId ? String(eventCallId).trim().toLowerCase() : null,
              normalizedExpected: callId ? String(callId).trim().toLowerCase() : null,
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

          // CRITICAL FIX: Validate and parse timestamp properly to avoid "Invalid Date"
          let timestamp: string;
          if (data.ts) {
            // Try to parse the timestamp
            const parsedDate = new Date(data.ts);
            if (isNaN(parsedDate.getTime())) {
              // Invalid timestamp, use current time
              console.warn('[useRealtimeTranscript] Invalid timestamp, using current time', {
                originalTs: data.ts,
                callId,
              });
              timestamp = new Date().toISOString();
            } else {
              timestamp = parsedDate.toISOString();
            }
          } else {
            timestamp = new Date().toISOString();
          }

          // Create utterance
          const utterance: TranscriptUtterance = {
            id: data.seq?.toString() || `${Date.now()}-${Math.random()}`,
            text,
            speaker,
            timestamp,
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
            
            // CRITICAL FIX: Limit transcript array size to prevent memory issues (OOM crashes)
            // Keep only the most recent MAX_TRANSCRIPTS to prevent unbounded growth
            const newTranscripts = [...prev, utterance];
            if (newTranscripts.length > MAX_TRANSCRIPTS) {
              const pruned = newTranscripts.slice(-MAX_TRANSCRIPTS);
              console.warn('[useRealtimeTranscript] ⚠️ Pruned transcripts to prevent memory issues', {
                before: newTranscripts.length,
                after: pruned.length,
                callId,
                note: `Keeping only the most recent ${MAX_TRANSCRIPTS} transcripts`,
              });
              return pruned;
            }
            return newTranscripts;
          });

          // Call callback if provided (via ref to avoid dependency issues)
          onTranscriptRef.current?.(utterance);
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
            console.log('[useRealtimeTranscript] ✅ Received connection confirmation', { callId });
            
          // CRITICAL FIX: Set connected state when we receive connection message
          // This handles cases where onopen doesn't fire but data is flowing
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = undefined;
          
          // Stop polling when SSE connects successfully
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = undefined;
            console.log('[useRealtimeTranscript] 🛑 Stopped polling (SSE connected via message)', { callId });
          }
          
          setIsConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0; // Reset attempts
          onConnectionChangeRef.current?.(true);
          }
        } catch (err) {
          // Ignore parse errors for non-JSON messages
        }
      });

      // Listen for call_end events
      if (onCallEndRef.current) {
        eventSource.addEventListener('call_end', (event) => {
          try {
            const data = JSON.parse(event.data);
            const eventCallId = data.callId || data.interaction_id || data.interactionId;
            
            // Only process if callId matches or is missing (assume it's for this call)
            if (!eventCallId || eventCallId === callId) {
              console.log('[useRealtimeTranscript] 📞 Call ended event received', { callId, eventCallId });
              onCallEndRef.current?.(event);
            }
          } catch (err) {
            console.error('[useRealtimeTranscript] Failed to parse call_end event', err, event.data);
          }
        });
      }

      // Listen for intent_update events
      if (onIntentUpdateRef.current) {
        eventSource.addEventListener('intent_update', (event) => {
          try {
            const data = JSON.parse(event.data);
            const eventCallId = data.callId || data.interaction_id || data.interactionId;
            
            // Only process if callId matches or is missing (assume it's for this call)
            if (!eventCallId || eventCallId === callId) {
              console.log('[useRealtimeTranscript] 🎯 Intent update event received', { callId, eventCallId });
              onIntentUpdateRef.current?.(event);
            }
          } catch (err) {
            console.error('[useRealtimeTranscript] Failed to parse intent_update event', err, event.data);
          }
        });
      }
    };

    // Polling fallback function (when SSE fails)
    const startPolling = () => {
      if (pollIntervalRef.current) {
        return; // Already polling
      }
      
      console.log('[useRealtimeTranscript] 🔄 Starting polling fallback', { callId });
      
      const poll = async () => {
        try {
          const response = await fetch(`/api/transcripts/latest?callId=${encodeURIComponent(callId!)}`);
          if (!response.ok) {
            console.warn('[useRealtimeTranscript] Polling request failed', { status: response.status, callId });
            return;
          }
          
          const data = await response.json();
          if (data.ok && data.transcripts && Array.isArray(data.transcripts)) {
            // Only add new transcripts (based on seq number)
            setTranscripts((prev) => {
              const existingSeqs = new Set(prev.map(t => t.seq).filter(Boolean));
              const newTranscripts = data.transcripts.filter((t: TranscriptUtterance) => 
                t.seq && !existingSeqs.has(t.seq)
              );
              
              if (newTranscripts.length > 0) {
                console.log('[useRealtimeTranscript] 📥 Polling: Received new transcripts', {
                  callId,
                  newCount: newTranscripts.length,
                  totalCount: prev.length + newTranscripts.length,
                });
                
                // Merge new transcripts
                const merged = [...prev, ...newTranscripts].sort((a, b) => {
                  if (a.seq && b.seq) return a.seq - b.seq;
                  if (a.seq) return -1;
                  if (b.seq) return 1;
                  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                });
                
                // Limit to MAX_TRANSCRIPTS
                if (merged.length > MAX_TRANSCRIPTS) {
                  return merged.slice(-MAX_TRANSCRIPTS);
                }
                return merged;
              }
              
              return prev;
            });
            
            // Update last seq
            if (data.transcripts.length > 0) {
              const maxSeq = Math.max(...data.transcripts.map((t: TranscriptUtterance) => t.seq || 0).filter(Boolean));
              if (maxSeq > lastSeqRef.current) {
                lastSeqRef.current = maxSeq;
              }
            }
          }
        } catch (err: any) {
          console.error('[useRealtimeTranscript] Polling error', { error: err.message, callId });
        }
      };
      
      // Poll immediately, then every 2 seconds
      poll();
      pollIntervalRef.current = setInterval(poll, 2000);
    };

    // Initial connection
    connect();

    // Cleanup on unmount or callId change
    return () => {
      shouldReconnectRef.current = false;
      cleanup();
      lastSeqRef.current = 0; // Reset last seq
    };
  }, [callId, autoReconnect, reconnectDelay, cleanup]); // CRITICAL: No callbacks in dependency array - use refs instead

  return {
    transcripts,
    isConnected,
    error,
    reconnect,
  };
}


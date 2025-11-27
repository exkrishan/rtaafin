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

// Helper function to estimate memory usage
const estimateMemorySize = (obj: any): number => {
  try {
    const str = JSON.stringify(obj);
    return new Blob([str]).size;
  } catch (e) {
    return 0;
  }
};

// Helper function to log memory usage
const logMemoryUsage = (label: string, data: any, callId?: string) => {
  const size = estimateMemorySize(data);
  const sizeKB = (size / 1024).toFixed(2);
  const sizeMB = (size / 1024 / 1024).toFixed(4);
  console.log(`[MEMORY] 💾 ${label}`, {
    callId: callId || 'unknown',
    size_bytes: size,
    size_kb: `${sizeKB} KB`,
    size_mb: `${sizeMB} MB`,
    item_count: Array.isArray(data) ? data.length : 1,
    timestamp: new Date().toISOString(),
  });
};

// Helper function to log performance
const logPerformance = (label: string, fn: () => void, callId?: string) => {
  const startTime = performance.now();
  const startMemory = (performance as any).memory?.usedJSHeapSize || 0;
  fn();
  const endTime = performance.now();
  const endMemory = (performance as any).memory?.usedJSHeapSize || 0;
  const duration = endTime - startTime;
  const memoryDelta = endMemory - startMemory;
  
  console.log(`[PERF] ⚡ ${label}`, {
    callId: callId || 'unknown',
    duration_ms: duration.toFixed(2),
    memory_delta_bytes: memoryDelta,
    memory_delta_kb: (memoryDelta / 1024).toFixed(2),
    timestamp: new Date().toISOString(),
  });
  
  if (duration > 100) {
    console.warn(`[PERF] ⚠️ Slow operation detected: ${label} took ${duration.toFixed(2)}ms`, {
      callId,
      threshold: '100ms',
    });
  }
};

// Global memory monitoring (runs every 10 seconds)
if (typeof window !== 'undefined' && (performance as any).memory) {
  setInterval(() => {
    const memory = (performance as any).memory;
    const usedMB = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
    const totalMB = (memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
    const limitMB = (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
    const usagePercent = ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2);
    
    console.log('[MEMORY-GLOBAL] 📊 Browser memory usage', {
      used_heap_mb: usedMB,
      total_heap_mb: totalMB,
      limit_mb: limitMB,
      usage_percent: `${usagePercent}%`,
      timestamp: new Date().toISOString(),
    });
    
    if (memory.usedJSHeapSize / memory.jsHeapSizeLimit > 0.9) {
      console.error('[MEMORY-GLOBAL] ⚠️ CRITICAL: Memory usage above 90%!', {
        used_mb: usedMB,
        limit_mb: limitMB,
        usage_percent: `${usagePercent}%`,
      });
    }
  }, 10000); // Every 10 seconds
}

// Polling mode flag: when true, uses polling instead of SSE streaming
// Set to false to enable SSE streaming mode
const pollMode = true;

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
  // 300 transcripts = ~90 KB per call, safe for 512MB instances with multiple concurrent calls
  // Reduced from 500 to 300 to prevent OOM crashes on Render.com Starter plan (512MB RAM)
  const MAX_TRANSCRIPTS = 300;
  
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
  
  // Log initial state creation
  useEffect(() => {
    console.log('[MEMORY] 🆕 useRealtimeTranscript hook initialized', {
      callId: callId || 'null',
      maxTranscripts: MAX_TRANSCRIPTS,
      pollMode,
      timestamp: new Date().toISOString(),
    });
  }, []);
  
  // Log transcript state changes
  useEffect(() => {
    if (transcripts.length > 0) {
      logMemoryUsage('Transcripts state updated', transcripts, callId || undefined);
      const totalTextLength = transcripts.reduce((sum, t) => sum + (t.text?.length || 0), 0);
      console.log('[MEMORY] 📊 Transcript array details', {
        callId: callId || 'null',
        count: transcripts.length,
        total_text_length: totalTextLength,
        avg_text_length: Math.round(totalTextLength / transcripts.length),
        memory_estimate_kb: (estimateMemorySize(transcripts) / 1024).toFixed(2),
      });
    }
  }, [transcripts, callId]);
  
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
    // CRITICAL: In polling mode, reconnect just restarts polling, doesn't create SSE
    if (pollMode) {
      console.log('[useRealtimeTranscript] 🔄 Reconnect called (polling mode) - restarting polling', { callId });
      cleanup();
      // Polling will restart automatically via useEffect when callId is set
      return;
    }
    
    cleanup();
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    // Trigger reconnection by updating callId (via useEffect)
    // This is a workaround - we'll actually reconnect in the useEffect
    if (callId) {
      // Force reconnection by clearing and re-establishing
      const url = `/api/events/stream?callId=${encodeURIComponent(callId)}`;
      console.log('[API-CALL] 🔌 Reconnect: Creating SSE connection', {
        callId,
        endpoint: '/api/events/stream',
        url,
        timestamp: new Date().toISOString(),
      });
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      // The rest of the connection logic will be handled by the useEffect
    }
  }, [callId]); // CRITICAL FIX: Removed cleanup from dependencies to prevent infinite loop

  useEffect(() => {
    // Don't connect if no callId
    if (!callId) {
      console.log('[MEMORY] 🧹 Clearing transcripts (no callId)', {
        previousCount: transcripts.length,
        timestamp: new Date().toISOString(),
      });
      setIsConnected(false);
      setError(null);
      setTranscripts([]);
      cleanup();
      return;
    }

    // POLLING MODE: Skip SSE and use polling only
    if (pollMode) {
      console.log('[useRealtimeTranscript] 📊 Polling mode enabled - skipping SSE', { callId });
      
      // Clean up any existing SSE connection
      cleanup();
      
      // Start polling immediately
      const startPolling = () => {
        if (pollIntervalRef.current) {
          return; // Already polling
        }
        
        console.log('[useRealtimeTranscript] 🔄 Starting polling (pollMode=true)', { callId });
        console.log('[API-CALL] 📞 Polling mode: Will call /api/transcripts/latest every 2 seconds', {
          callId,
          endpoint: '/api/transcripts/latest',
          interval: '2000ms',
          note: 'SSE connections are disabled in polling mode',
        });
        
        const poll = async () => {
          const pollStartTime = performance.now();
          try {
            const fetchStartTime = performance.now();
            const apiUrl = `/api/transcripts/latest?callId=${encodeURIComponent(callId!)}`;
            console.log('[API-CALL] 🌐 Making polling request', {
              callId,
              url: apiUrl,
              timestamp: new Date().toISOString(),
            });
            const response = await fetch(apiUrl);
            const fetchDuration = performance.now() - fetchStartTime;
            
            console.log('[PERF] 🌐 Fetch request completed', {
              callId,
              duration_ms: fetchDuration.toFixed(2),
              status: response.status,
            });
            
            if (!response.ok) {
              console.warn('[useRealtimeTranscript] Polling request failed', { status: response.status, callId });
              setIsConnected(false);
              setError(`Polling failed: HTTP ${response.status}`);
              return;
            }
            
            const parseStartTime = performance.now();
            const data = await response.json();
            const parseDuration = performance.now() - parseStartTime;
            
            logMemoryUsage('API response data', data, callId);
            console.log('[PERF] 📦 JSON parse completed', {
              callId,
              duration_ms: parseDuration.toFixed(2),
              transcript_count: data.transcripts?.length || 0,
            });
            
            if (data.ok && data.transcripts && Array.isArray(data.transcripts)) {
              logPerformance('Transcript processing (polling mode)', () => {
                setTranscripts((prev) => {
                  const processStartTime = performance.now();
                  
                  // Log previous state
                  logMemoryUsage('Previous transcripts state', prev, callId);
                  
                  // Sort transcripts by seq or timestamp
                  const sortStartTime = performance.now();
                  const sorted = [...data.transcripts].sort((a: TranscriptUtterance, b: TranscriptUtterance) => {
                    if (a.seq && b.seq) return a.seq - b.seq;
                    if (a.seq) return -1;
                    if (b.seq) return 1;
                    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                  });
                  const sortDuration = performance.now() - sortStartTime;
                  
                  console.log('[PERF] 🔀 Array sort completed', {
                    callId,
                    duration_ms: sortDuration.toFixed(2),
                    items_sorted: sorted.length,
                  });
                  
                  // Limit to MAX_TRANSCRIPTS
                  const limited = sorted.length > MAX_TRANSCRIPTS 
                    ? sorted.slice(-MAX_TRANSCRIPTS)
                    : sorted;
                  
                  if (limited.length !== sorted.length) {
                    console.warn('[MEMORY] ✂️ Transcripts pruned', {
                      callId,
                      before: sorted.length,
                      after: limited.length,
                      pruned: sorted.length - limited.length,
                    });
                  }
                  
                  // Only update if transcripts actually changed (avoid unnecessary re-renders)
                  const compareStartTime = performance.now();
                  const prevStr = JSON.stringify(prev.map(t => ({ id: t.id, seq: t.seq, text: t.text })));
                  const newStr = JSON.stringify(limited.map(t => ({ id: t.id, seq: t.seq, text: t.text })));
                  const compareDuration = performance.now() - compareStartTime;
                  
                  console.log('[PERF] 🔍 Transcript comparison completed', {
                    callId,
                    duration_ms: compareDuration.toFixed(2),
                    prev_str_length: prevStr.length,
                    new_str_length: newStr.length,
                  });
                  
                  if (prevStr !== newStr) {
                    logMemoryUsage('New transcripts state (after update)', limited, callId);
                    const totalDuration = performance.now() - processStartTime;
                    console.log('[PERF] ✅ Complete transcript update', {
                      callId,
                      total_duration_ms: totalDuration.toFixed(2),
                      count: limited.length,
                      prevCount: prev.length,
                    });
                    return limited;
                  }
                  
                  console.log('[PERF] ⏭️ Transcripts unchanged, skipping update', {
                    callId,
                    count: prev.length,
                  });
                  return prev;
                });
              }, callId);
              
              setIsConnected(true);
              setError(null);
            } else {
              console.warn('[useRealtimeTranscript] Polling: Invalid response format', { callId, data });
              setIsConnected(false);
            }
            
            const totalPollDuration = performance.now() - pollStartTime;
            console.log('[PERF] 🎯 Complete poll cycle', {
              callId,
              total_duration_ms: totalPollDuration.toFixed(2),
            });
          } catch (err: any) {
            console.error('[useRealtimeTranscript] Polling error', { error: err.message, callId });
            setIsConnected(false);
            setError(`Polling error: ${err.message}`);
          }
        };
        
        // Poll immediately, then every 2 seconds
        poll();
        pollIntervalRef.current = setInterval(poll, 2000);
        setIsConnected(true); // Mark as connected when polling starts
      };
      
      startPolling();
      
      // Cleanup on unmount or callId change
      return () => {
        console.log('[MEMORY] 🧹 Cleaning up polling (callId changed or unmount)', {
          callId,
          transcriptsCount: transcripts.length,
          timestamp: new Date().toISOString(),
        });
        cleanup();
      };
    }

    // STREAMING MODE: Use SSE (only when pollMode = false)
    // CRITICAL: Skip SSE completely when pollMode is true
    if (pollMode) {
      console.warn('[useRealtimeTranscript] ⚠️ pollMode=true but reached SSE code - this should not happen!', { callId });
      return; // Exit early - should not reach here
    }
    // CRITICAL FIX: Log when callId is discovered/changed to help debug reconnection
    console.log('[useRealtimeTranscript] 🔄 CallId changed, reconnecting immediately (SSE mode)', {
      callId,
      previousCallId: eventSourceRef.current ? 'had connection' : 'no connection',
      timestamp: new Date().toISOString(),
    });

    // Reset state
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    setError(null);

    const connect = () => {
      // Clean up any existing connection
      cleanup();

      const url = `/api/events/stream?callId=${encodeURIComponent(callId)}`;
      console.log('[useRealtimeTranscript] 🔌 Connecting to SSE', { callId, url });
      console.log('[API-CALL] 🔌 Creating SSE connection (streaming mode)', {
        callId,
        endpoint: '/api/events/stream',
        url,
        timestamp: new Date().toISOString(),
        warning: 'This should not happen when pollMode=true',
      });
      
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // CRITICAL FIX: Reduced timeout for always-awake services (paid plans)
      // Connection timeout: if onopen doesn't fire within 10 seconds, consider it failed
      const connectionTimeoutMs = 10000; // 10 seconds (reduced from 60s for always-awake services)
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
        const eventStartTime = performance.now();
        try {
          const parseStartTime = performance.now();
          const data = JSON.parse(event.data);
          const parseDuration = performance.now() - parseStartTime;
          
          console.log('[PERF] 📨 SSE event parse', {
            callId,
            duration_ms: parseDuration.toFixed(2),
            data_size: event.data?.length || 0,
          });
          
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
          
          logMemoryUsage('New utterance created', utterance, callId);

          // Add to transcripts (check for duplicates)
          logPerformance('Transcript state update (SSE)', () => {
            setTranscripts((prev) => {
              logMemoryUsage('Previous transcripts (before SSE update)', prev, callId);
              
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
                logMemoryUsage('Pruned transcripts (SSE)', pruned, callId);
                console.warn('[useRealtimeTranscript] ⚠️ Pruned transcripts to prevent memory issues', {
                  before: newTranscripts.length,
                  after: pruned.length,
                  callId,
                  note: `Keeping only the most recent ${MAX_TRANSCRIPTS} transcripts`,
                });
                return pruned;
              }
              
              logMemoryUsage('Updated transcripts (SSE)', newTranscripts, callId);
              return newTranscripts;
            });
          }, callId);
          
          const totalEventDuration = performance.now() - eventStartTime;
          console.log('[PERF] ✅ Complete SSE event processing', {
            callId,
            total_duration_ms: totalEventDuration.toFixed(2),
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
      
      // Poll immediately, then every 2 seconds (polling fallback - only used when SSE fails)
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
  }, [callId, autoReconnect, reconnectDelay]); // CRITICAL FIX: Removed cleanup from dependencies to prevent infinite render loop

  // Log component render
  useEffect(() => {
    console.log('[RENDER] 🎨 useRealtimeTranscript render', {
      callId: callId || 'null',
      transcriptsCount: transcripts.length,
      isConnected,
      hasError: !!error,
      timestamp: new Date().toISOString(),
    });
  });

  return {
    transcripts,
    isConnected,
    error,
    reconnect,
  };
}


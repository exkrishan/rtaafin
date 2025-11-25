'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import KBSuggestions, { KBArticle } from './KBSuggestions';
import AutoDispositionModal, { Suggestion } from './AutoDispositionModal';
import { useRealtimeTranscript } from '@/hooks/useRealtimeTranscript';

export interface TranscriptLine {
  text: string;
  ts?: string;
  seq?: number;
}

export interface TranscriptPanelProps {
  callId: string;
  tenantId?: string;
  onOpenDisposition?: (initialData: {
    suggested: Suggestion[];
    autoNotes: string;
  }) => void;
}

export default function TranscriptPanel({
  callId,
  tenantId,
  onOpenDisposition,
}: TranscriptPanelProps) {
  // CTO FIX: Use custom hook for real-time transcripts
  const { transcripts, isConnected, error: transcriptError } = useRealtimeTranscript(callId, {
    onConnectionChange: (connected) => {
      console.log('[TranscriptPanel] Connection state changed', { connected, callId });
    },
  });

  // Convert hook transcripts to lines format (for backward compatibility)
  const lines: TranscriptLine[] = transcripts.map(t => ({
    text: t.text,
    ts: t.timestamp,
    seq: t.seq,
  }));

  const [error, setError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    suggested: Suggestion[];
    autoNotes: string;
  } | null>(null);
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [kbSuggestions, setKbSuggestions] = useState<KBArticle[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Combine errors
  const displayError = transcriptError || error;

  // Define fetchSummaryAndOpenDisposition with useCallback (to avoid dependency issues)
  const fetchSummaryAndOpenDisposition = useCallback(async () => {
    try {
      const response = await fetch('/api/calls/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, tenantId }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error || 'Failed to generate summary');
      }

      // Convert mappedDispositions to Suggestion format
      const suggested: Suggestion[] =
        (payload.dispositions || []).map((item: any) => ({
          code: item.mappedCode || item.code || 'GENERAL_INQUIRY',
          title: item.mappedTitle || item.title || 'General Inquiry',
          score: typeof item.score === 'number' ? item.score : 0.5,
          id: typeof item.mappedId === 'number' ? item.mappedId : undefined,
          subDisposition: item.subDisposition || item.sub_disposition || undefined,
          subDispositionId: typeof item.subDispositionId === 'number' ? item.subDispositionId : undefined,
        }));

      // Build notes from summary sections
      const summary = payload.summary || {};
      const autoNotes = [
        summary.issue,
        summary.resolution,
        summary.next_steps,
      ]
        .filter((section: string | undefined) => section && section.trim().length > 0)
        .join('\n\n');

      const dispositionData = {
        suggested: suggested.length > 0 ? suggested : [{ code: 'GENERAL_INQUIRY', title: 'General Inquiry', score: 0.1 }],
        autoNotes: autoNotes || 'No notes generated.',
      };

      setSummaryData(dispositionData);

      // Update KB suggestions from summary if available
      if (payload.kbArticles && Array.isArray(payload.kbArticles)) {
        setKbSuggestions((prev) => {
          const existingIds = new Set(prev.map(a => a.id || a.code));
          const newArticles = payload.kbArticles.filter((a: KBArticle) => !existingIds.has(a.id || a.code || ''));
          return [...prev, ...newArticles];
        });
      }

      // Open disposition modal
      if (onOpenDisposition) {
        onOpenDisposition(dispositionData);
      } else {
        setDispositionOpen(true);
      }
    } catch (err: any) {
      console.error('[TranscriptPanel] Failed to fetch summary', err);
      setError(err?.message || 'Failed to generate summary');
    }
  }, [callId, tenantId, onOpenDisposition]);

  // Listen for call_end and intent_update events (not handled by hook)
  useEffect(() => {
    if (!callId) {
      return;
    }

    console.log('[TranscriptPanel] 🔌 Setting up call_end and intent_update listeners', { callId });
    const url = `/api/events/stream?callId=${encodeURIComponent(callId)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('call_end', () => {
      console.log('[TranscriptPanel] Call ended event received');
      setCallEnded(true);
      eventSource.close();
      // Auto-fetch summary and open disposition modal
      fetchSummaryAndOpenDisposition();
    });

    // Handle intent_update events that may contain KB articles
    eventSource.addEventListener('intent_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[TranscriptPanel] Received intent_update', data);
        if (data.articles && Array.isArray(data.articles)) {
          // Update KB suggestions with new articles from intent detection
          setKbSuggestions((prev) => {
            // Merge new articles, avoiding duplicates by id
            const existingIds = new Set(prev.map(a => a.id || a.code));
            const newArticles = data.articles.filter((a: KBArticle) => !existingIds.has(a.id || a.code || ''));
            return [...prev, ...newArticles];
          });
        }
      } catch (err) {
        console.error('[TranscriptPanel] Failed to parse intent_update', err);
      }
    });

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [callId, fetchSummaryAndOpenDisposition]);

  // Auto-scroll to bottom of transcript when new lines arrive
  useEffect(() => {
    // Auto-scroll to bottom when new transcript lines are added
    if (transcriptEndRef.current && transcriptContainerRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (transcriptEndRef.current) {
          transcriptEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      });
    }
  }, [lines]);

  const handleManualDisposition = () => {
    if (summaryData) {
      setDispositionOpen(true);
    } else {
      fetchSummaryAndOpenDisposition();
    }
  };

  return (
    <>
      {displayError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-3">
          {displayError}
        </div>
      )}

      <div ref={transcriptContainerRef} className="flex-1 overflow-y-auto">
        {lines.length === 0 && !isConnected && (
          <div className="text-center text-sm text-gray-500 py-8">
            Waiting for transcript...
          </div>
        )}
        {lines.length === 0 && isConnected && (
          <div className="text-center text-sm text-gray-500 py-8">
            No transcript lines yet. Waiting for data...
          </div>
        )}
        <div className="space-y-3" role="log" aria-live="polite" aria-atomic="false">
          {lines.map((line, idx) => {
            // Determine if it's agent or customer based on text content
            const isAgent = line.text.startsWith('Agent:') || line.text.startsWith('You:');
            const displayText = line.text.replace(/^(Agent:|You:|Customer:|Manish:)\s*/, '');
            const speaker = isAgent ? 'You' : 'Manish';
            
            return (
              <div key={idx} className={`flex ${isAgent ? 'justify-end' : 'justify-start'} mb-3`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  isAgent 
                    ? 'bg-blue-100 text-gray-900' 
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {!isAgent && (
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                        M
                      </div>
                    )}
                    <span className="text-xs font-medium">{speaker}</span>
                    {line.ts && (
                      <span className="text-xs text-gray-500">
                        {(() => {
                          try {
                            const date = new Date(line.ts);
                            if (isNaN(date.getTime())) {
                              return '';
                            }
                            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                          } catch (err) {
                            return '';
                          }
                        })()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{displayText}</p>
                </div>
              </div>
            );
          })}
          {/* Scroll anchor - auto-scrolls to this element when new lines arrive */}
          <div ref={transcriptEndRef} />
        </div>
      </div>


      {summaryData && (
        <AutoDispositionModal
          open={dispositionOpen}
          onClose={() => setDispositionOpen(false)}
          callId={callId}
          tenantId={tenantId}
          suggested={summaryData.suggested}
          autoNotes={summaryData.autoNotes}
        />
      )}
    </>
  );
}


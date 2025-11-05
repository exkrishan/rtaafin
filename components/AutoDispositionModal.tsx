'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { showToast } from './ToastContainer';

export type Suggestion = {
  code: string;
  title: string;
  score?: number;
};

export interface AutoDispositionModalProps {
  open: boolean;
  onClose: () => void;
  callId: string;
  tenantId?: string;
  suggested?: Suggestion[]; // sorted by score desc
  autoNotes?: string;
}

export default function AutoDispositionModal({
  open,
  onClose,
  callId,
  tenantId,
  suggested = [],
  autoNotes = '',
}: AutoDispositionModalProps) {
  const [allDispositions, setAllDispositions] = useState<DispositionOption[]>([]);
  const [subDispositions, setSubDispositions] = useState<DispositionOption[]>([]);
  const [selectedDisposition, setSelectedDisposition] = useState<string>(
    suggested[0]?.code || ''
  );
  const [subDisposition, setSubDisposition] = useState<string>(
    suggested[0]?.subDisposition || ''
  );
  const [notes, setNotes] = useState<string>(autoNotes);
  const [loading, setLoading] = useState<'save' | 'retry' | 'fetching' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSuggestions, setCurrentSuggestions] = useState<Suggestion[]>(suggested);
  const [currentAutoNotes, setCurrentAutoNotes] = useState<string>(autoNotes);
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch all dispositions from API when modal opens
  useEffect(() => {
    if (!open) return;

    const fetchDispositions = async () => {
      setLoading('fetching');
      try {
        const response = await fetch('/api/dispositions');
        const payload = await response.json();

        if (payload.ok && Array.isArray(payload.dispositions)) {
          setAllDispositions(payload.dispositions);
        } else {
          console.warn('[AutoDispositionModal] Failed to fetch dispositions, using suggested only');
        }
      } catch (err) {
        console.error('[AutoDispositionModal] Error fetching dispositions', err);
      } finally {
        setLoading(null);
      }
    };

    fetchDispositions();
  }, [open]);

  // Fetch sub-dispositions when disposition changes
  useEffect(() => {
    if (!open || !selectedDisposition) {
      setSubDispositions([]);
      return;
    }

    const fetchSubDispositions = async () => {
      try {
        const response = await fetch(`/api/sub-dispositions?dispositionCode=${encodeURIComponent(selectedDisposition)}`);
        const payload = await response.json();

        if (payload.ok && Array.isArray(payload.subDispositions)) {
          setSubDispositions(payload.subDispositions);
        } else {
          setSubDispositions([]);
        }
      } catch (err) {
        console.error('[AutoDispositionModal] Error fetching sub-dispositions', err);
        setSubDispositions([]);
      }
    };

    fetchSubDispositions();
  }, [open, selectedDisposition]);

  // Update state when props change and auto-select best match
  useEffect(() => {
    if (open) {
      setCurrentSuggestions(suggested);
      setCurrentAutoNotes(autoNotes);
      
      // Auto-select the best match from suggested dispositions
      // Priority: highest score, then first suggestion
      const bestSuggestion = suggested.length > 0
        ? suggested.reduce((best, current) => {
            const bestScore = best.score || 0;
            const currentScore = current.score || 0;
            return currentScore > bestScore ? current : best;
          })
        : null;

      if (bestSuggestion) {
        setSelectedDisposition(bestSuggestion.code);
        setSubDisposition(bestSuggestion.subDisposition || '');
      } else {
        setSelectedDisposition('');
        setSubDisposition('');
      }

      setNotes(autoNotes);
      setError(null);
    }
  }, [open, suggested, autoNotes]);

  // Handle ESC key to close
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose, loading]);

  // Trap focus within modal
  useEffect(() => {
    if (!open || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleTab);
    firstElement?.focus();

    return () => {
      modal.removeEventListener('keydown', handleTab);
    };
  }, [open]);

  // Get selected disposition object (from all dispositions or suggestions)
  const selectedDispositionObj = 
    allDispositions.find((d) => d.code === selectedDisposition) ||
    currentSuggestions.find((s) => s.code === selectedDisposition);

  // Calculate average score for confidence
  const averageScore = currentSuggestions.length > 0
    ? currentSuggestions.reduce((sum, s) => sum + (s.score || 0), 0) / currentSuggestions.length
    : 0;

  // Handle Save
  const handleSave = useCallback(async () => {
    if (!selectedDispositionObj) {
      setError('Please select a disposition');
      return;
    }

    setError(null);
    setLoading('save');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch('/api/calls/auto_notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          tenantId: tenantId || 'default',
          author: 'agent-ui',
          notes,
          dispositions: [
            {
              code: selectedDispositionObj.code,
              title: selectedDispositionObj.title || selectedDispositionObj.code,
              score: 'score' in selectedDispositionObj && typeof selectedDispositionObj.score === 'number' 
                ? selectedDispositionObj.score 
                : 0,
            },
          ],
          subDisposition: subDisposition || undefined,
          confidence: averageScore,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to save disposition');
      }

      // Success - close modal and show toast
      showToast('Saved and synced', 'success');
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('[AutoDispositionModal] Save failed', err);
      
      const errorMessage = err.name === 'AbortError' 
        ? 'Request timed out. Please try again.'
        : err?.message || 'Failed to save disposition';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setLoading(null);
    }
  }, [selectedDispositionObj, notes, callId, tenantId, averageScore, onClose]);

  // Handle Retry
  const handleRetry = useCallback(async () => {
    setError(null);
    setLoading('retry');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('/api/calls/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          tenantId: tenantId || 'default',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to generate summary');
      }

      const payload = await response.json();

      if (!payload.ok) {
        throw new Error(payload?.error || 'Failed to generate summary');
      }

      // Update suggestions and notes from response
      const newSuggestions: Suggestion[] = (payload.dispositions || []).map((item: any) => ({
        code: item.mappedCode || item.code || 'GENERAL_INQUIRY',
        title: item.mappedTitle || item.title || 'General Inquiry',
        score: typeof item.score === 'number' ? item.score : 0,
        subDisposition: item.subDisposition || item.sub_disposition || undefined,
      }));

      const summary = payload.summary || {};
      const newNotes = [
        summary.issue,
        summary.resolution,
        summary.next_steps,
      ]
        .filter((section: string | undefined) => section && section.trim().length > 0)
        .join('\n\n');

      setCurrentSuggestions(newSuggestions.length > 0 ? newSuggestions : currentSuggestions);
      setCurrentAutoNotes(newNotes || '');
      setNotes(newNotes || '');
      
      // Auto-select best match
      if (newSuggestions.length > 0) {
        const bestSuggestion = newSuggestions.reduce((best, current) => {
          const bestScore = best.score || 0;
          const currentScore = current.score || 0;
          return currentScore > bestScore ? current : best;
        });
        setSelectedDisposition(bestSuggestion.code);
        setSubDisposition(bestSuggestion.subDisposition || '');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('[AutoDispositionModal] Retry failed', err);
      
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err?.message || 'Failed to generate summary');
      }
    } finally {
      setLoading(null);
    }
  }, [callId, tenantId, currentSuggestions]);

  if (!open) return null;

  const isLoading = loading !== null;
  const Spinner = () => (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
        onClick={!isLoading ? onClose : undefined}
        aria-hidden="true"
      >
        {/* Modal */}
        <div
          ref={modalRef}
          className="relative z-50 w-full max-w-[420px] bg-panel-bg rounded-lg shadow-card my-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-soft">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
            Auto-Generated Disposition & Notes
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            aria-label="Close modal"
            role="button"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Disposition Select */}
          <div>
            <label htmlFor="disposition-select" className="block text-sm font-medium text-gray-700 mb-2">
              Disposition
            </label>
            <select
              id="disposition-select"
              value={selectedDisposition}
              onChange={(e) => {
                setSelectedDisposition(e.target.value);
                // Clear sub-disposition when disposition changes
                setSubDisposition('');
              }}
              disabled={isLoading}
              className="w-full rounded-md border border-border-soft p-2 text-sm text-gray-900 bg-panel-bg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:cursor-not-allowed disabled:bg-gray-50"
              aria-label="Select disposition"
            >
              <option value="">Select disposition...</option>
              {allDispositions.length > 0 ? (
                allDispositions.map((disposition) => (
                  <option key={disposition.code} value={disposition.code}>
                    {disposition.title}
                  </option>
                ))
              ) : currentSuggestions.length > 0 ? (
                currentSuggestions.map((suggestion) => (
                  <option key={suggestion.code} value={suggestion.code}>
                    {suggestion.title}
                  </option>
                ))
              ) : (
                <option value="">Loading dispositions...</option>
              )}
            </select>
            {/* Show auto-selected indicator if suggested disposition matches */}
            {currentSuggestions.length > 0 && selectedDisposition && 
             currentSuggestions.some(s => s.code === selectedDisposition) && (
              <p className="mt-1 text-xs text-text-muted">
                ✓ Auto-selected based on transcript analysis
              </p>
            )}
          </div>

          {/* Sub-Disposition Select */}
          <div>
            <label htmlFor="sub-disposition-select" className="block text-sm font-medium text-gray-700 mb-2">
              Sub-Disposition <span className="text-text-muted font-normal">(Optional)</span>
            </label>
            <select
              id="sub-disposition-select"
              value={subDisposition}
              onChange={(e) => setSubDisposition(e.target.value)}
              disabled={isLoading || !selectedDisposition || subDispositions.length === 0}
              className="w-full rounded-md border border-border-soft p-2 text-sm text-gray-900 bg-panel-bg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:cursor-not-allowed disabled:bg-gray-50"
              aria-label="Select sub-disposition"
            >
              <option value="">Select sub-disposition...</option>
              {subDispositions.length > 0 ? (
                subDispositions.map((subDisp) => (
                  <option key={subDisp.code} value={subDisp.code}>
                    {subDisp.title}
                  </option>
                ))
              ) : selectedDisposition ? (
                <option value="">Loading sub-dispositions...</option>
              ) : (
                <option value="">Select a disposition first</option>
              )}
            </select>
            {currentSuggestions.length > 0 && 
             currentSuggestions.some(s => s.code === selectedDisposition && s.subDisposition) &&
             subDisposition && (
              <p className="mt-1 text-xs text-text-muted">
                ✓ Auto-selected based on transcript analysis
              </p>
            )}
          </div>

          {/* Notes Textarea */}
          <div>
            <label htmlFor="notes-textarea" className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <div className="relative">
              <textarea
                id="notes-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isLoading}
                rows={5}
                className="w-full rounded-lg border border-border-soft p-3 text-sm text-gray-900 bg-panel-bg resize-none focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:cursor-not-allowed disabled:bg-gray-50"
                style={{ height: '120px' }}
                aria-label="Call notes"
              />
              {/* LLM Icon Badge */}
              {notes && (
                <div className="absolute bottom-2 right-2">
                  <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-purple-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-label="AI-generated"
                    >
                      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                      <path
                        fillRule="evenodd"
                        d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-text-muted">
              AI-suggested dispositions may be inaccurate, review before applying.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border-soft">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-border-soft rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Retry summary generation"
          >
            {loading === 'retry' && <Spinner />}
            Retry
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !selectedDispositionObj}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand rounded-md hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Save and sync disposition"
          >
            {loading === 'save' && <Spinner />}
            Save & Sync
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

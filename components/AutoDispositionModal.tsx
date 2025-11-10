'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { showToast } from './ToastContainer';

// Type definitions for hierarchical disposition structure
export type DispositionOption = {
  id?: number | null;
  code: string;
  title: string;
  label?: string; // Alias for title
  category?: string;
  score?: number;
  subDisposition?: string; // For suggestions
  sub_dispositions?: Array<{ id: number; code: string; label: string }>; // From API
};

export type Suggestion = {
  code: string;
  title: string;
  score?: number;
  id?: number;
  subDisposition?: string;
  subDispositionId?: number;
};

export interface AutoDispositionModalProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  callId: string;
  tenantId?: string;
  suggested?: Suggestion[]; // sorted by score desc
  autoNotes?: string;
}

export default function AutoDispositionModal({
  open,
  onClose,
  onBack,
  callId,
  tenantId,
  suggested = [],
  autoNotes = '',
}: AutoDispositionModalProps) {
  const [allDispositions, setAllDispositions] = useState<DispositionOption[]>([]);
  const [subDispositions, setSubDispositions] = useState<DispositionOption[]>([]);
  const [selectedDispositionId, setSelectedDispositionId] = useState<number | null>(null);
  const [selectedDisposition, setSelectedDisposition] = useState<string>(
    suggested[0]?.code || ''
  );
  const [selectedSubDisposition, setSelectedSubDisposition] = useState<string>(
    suggested[0]?.subDisposition || ''
  );
  const [selectedSubDispositionId, setSelectedSubDispositionId] = useState<number | null>(
    suggested[0]?.subDispositionId || null
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
          // If we have a selected disposition, ensure it's still valid
          if (selectedDisposition) {
            const found = payload.dispositions.find((d: DispositionOption) => d.code === selectedDisposition);
            if (!found && currentSuggestions.length > 0) {
              // Keep using current suggestions if selected disposition not in allDispositions
              const suggestion = currentSuggestions.find(s => s.code === selectedDisposition);
              if (suggestion) {
                // Keep the selection from suggestions
                setSelectedDispositionId(suggestion.id || null);
              }
            } else if (found) {
              setSelectedDispositionId(found.id || null);
            }
          }
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
  }, [open, selectedDisposition, currentSuggestions]);

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
        setSelectedSubDisposition(bestSuggestion.subDisposition || '');
        setSelectedDispositionId(bestSuggestion.id || null);
        setSelectedSubDispositionId(bestSuggestion.subDispositionId || null);
      } else {
        setSelectedDisposition('');
        setSelectedSubDisposition('');
        setSelectedDispositionId(null);
        setSelectedSubDispositionId(null);
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
          dispositionId: selectedDispositionId,
          subDisposition: selectedSubDisposition || undefined,
          subDispositionId: selectedSubDispositionId,
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
        id: typeof item.mappedId === 'number' ? item.mappedId : undefined,
        subDisposition: item.subDisposition || item.sub_disposition || undefined,
        subDispositionId: typeof item.subDispositionId === 'number' ? item.subDispositionId : undefined,
      }));

      const summary = payload.summary || {};
      const newNotes = [
        summary.issue,
        summary.resolution,
        summary.next_steps,
      ]
        .filter((section: string | undefined) => section && section.trim().length > 0)
        .join('\n\n');

      // Update suggestions and notes - regenerate notes specifically
      setCurrentSuggestions(newSuggestions.length > 0 ? newSuggestions : currentSuggestions);
      setCurrentAutoNotes(newNotes || '');
      setNotes(newNotes || ''); // Regenerate notes
      
      // Keep current disposition selection, only update notes
      // Don't auto-select new disposition unless user wants to change it
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
          className="relative z-50 w-full max-w-[480px] bg-white rounded-lg shadow-lg my-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack || onClose}
              disabled={isLoading}
              className="text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
              aria-label="Go back"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
              Agent Assist
            </h2>
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
          </div>
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
        <div className="px-6 py-5 space-y-5">
          {/* Recommended Disposition Select */}
          <div>
            <label htmlFor="disposition-select" className="block text-sm font-semibold text-gray-900 mb-2">
              Recommended Disposition
            </label>
            <select
              id="disposition-select"
              value={selectedDisposition}
              onChange={(e) => {
                const newCode = e.target.value;
                setSelectedDisposition(newCode);
                // Find the selected disposition to get its ID
                const selected = allDispositions.find(d => d.code === newCode) || 
                                currentSuggestions.find(s => s.code === newCode);
                setSelectedDispositionId(selected?.id || null);
                // Clear sub-disposition when disposition changes
                setSelectedSubDisposition('');
                setSelectedSubDispositionId(null);
              }}
              disabled={isLoading || (allDispositions.length === 0 && currentSuggestions.length === 0)}
              className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
              style={{ color: '#111827' }}
              aria-label="Select disposition"
              required
            >
              <option value="" style={{ color: '#9CA3AF' }}>Select disposition...</option>
              {allDispositions.length > 0 ? (
                allDispositions.map((disposition) => (
                  <option key={disposition.code} value={disposition.code} style={{ color: '#111827' }}>
                    {disposition.title || disposition.label || disposition.code}
                  </option>
                ))
              ) : currentSuggestions.length > 0 ? (
                currentSuggestions.map((suggestion) => (
                  <option key={suggestion.code} value={suggestion.code} style={{ color: '#111827' }}>
                    {suggestion.title} {suggestion.score ? `(${Math.round(suggestion.score * 100)}%)` : ''}
                  </option>
                ))
              ) : (
                <option value="" disabled style={{ color: '#9CA3AF' }}>Loading dispositions...</option>
              )}
            </select>
          </div>

          {/* Sub-Disposition Select */}
          <div>
            <label htmlFor="sub-disposition-select" className="block text-sm font-semibold text-gray-900 mb-2">
              Sub-Disposition
            </label>
            <select
              id="sub-disposition-select"
              value={selectedSubDisposition}
              onChange={(e) => {
                const newCode = e.target.value;
                setSelectedSubDisposition(newCode);
                // Find the selected sub-disposition to get its ID
                const selected = subDispositions.find(sd => sd.code === newCode || sd.title === newCode);
                setSelectedSubDispositionId(selected?.id || null);
              }}
              disabled={isLoading || !selectedDisposition || subDispositions.length === 0}
              className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
              style={{ color: '#111827' }}
              aria-label="Select sub-disposition"
            >
              <option value="" style={{ color: '#9CA3AF' }}>Select sub-disposition...</option>
              {subDispositions.length > 0 ? (
                subDispositions.map((subDisp) => (
                  <option key={subDisp.code || subDisp.title} value={subDisp.code || subDisp.title} style={{ color: '#111827' }}>
                    {subDisp.title || subDisp.label || subDisp.code}
                  </option>
                ))
              ) : selectedDisposition ? (
                <option value="" disabled style={{ color: '#9CA3AF' }}>Loading sub-dispositions...</option>
              ) : (
                <option value="" disabled style={{ color: '#9CA3AF' }}>Select a disposition first</option>
              )}
            </select>
          </div>

          {/* Notes Textarea */}
          <div>
            <label htmlFor="notes-textarea" className="block text-sm font-semibold text-gray-900 mb-2">
              Notes (AI-generated, editable)
            </label>
            <div className="relative">
              <textarea
                id="notes-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isLoading}
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                style={{ color: '#111827' }}
                aria-label="Call notes"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
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
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            aria-label="Retry summary generation"
          >
            {loading === 'retry' && <Spinner />}
            Retry
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !selectedDispositionObj}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            aria-label="Save and sync disposition"
          >
            {loading === 'save' && <Spinner />}
            Save and Dispose
          </button>
          <button
            type="button"
            onClick={() => {
              handleSave();
              // TODO: Trigger dial next
            }}
            disabled={isLoading || !selectedDispositionObj}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            aria-label="Dispose and dial next"
          >
            Dispose and Dial
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';

export interface AutoDispositionSuggestion {
  code: string;
  title: string;
  score: number;
}

export interface AutoDispositionModalProps {
  open: boolean;
  onClose: () => void;
  callId: string;
  tenantId?: string;
  suggested: AutoDispositionSuggestion[];
  autoNotes?: string;
}

type LoadingState = 'save' | 'retry' | null;

const Spinner = () => (
  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
);

export default function AutoDispositionModal({
  open,
  onClose,
  callId,
  tenantId,
  suggested,
  autoNotes,
}: AutoDispositionModalProps) {
  const [dispositions, setDispositions] = useState<AutoDispositionSuggestion[]>(suggested);
  const [selectedCode, setSelectedCode] = useState<string>(suggested[0]?.code ?? '');
  const [notes, setNotes] = useState<string>(autoNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingState>(null);

  useEffect(() => {
    if (open) {
      setDispositions(suggested);
      setSelectedCode(suggested[0]?.code ?? '');
      setNotes(autoNotes ?? '');
      setError(null);
    }
  }, [open, suggested, autoNotes]);

  const selectedDisposition = useMemo(
    () => dispositions.find((item) => item.code === selectedCode) ?? dispositions[0],
    [dispositions, selectedCode]
  );

  if (!open) {
    return null;
  }

  const disabled = loading !== null;

  const handleSave = async () => {
    if (!selectedDisposition) {
      setError('Please select a disposition before saving.');
      return;
    }

    setError(null);
    setLoading('save');

    try {
      const response = await fetch('/api/calls/auto_notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          tenantId,
          author: 'agent-ui',
          notes,
          dispositions: [
            {
              code: selectedDisposition.code,
              title: selectedDisposition.title,
              score: selectedDisposition.score,
            },
          ],
          confidence: selectedDisposition.score ?? undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to save notes.');
      }

      onClose();
    } catch (err: any) {
      console.error('[AutoDispositionModal] Save failed', err);
      setError(err?.message ?? 'Failed to save disposition.');
    } finally {
      setLoading(null);
    }
  };

  const handleRetry = async () => {
    setError(null);
    setLoading('retry');

    try {
      const response = await fetch('/api/calls/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, tenantId, source: 'auto-disposition-modal' }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.summary) {
        throw new Error(payload?.error || 'Retry failed to generate summary.');
      }

      const nextDispositions: AutoDispositionSuggestion[] =
        payload?.dispositions?.map((item: any) => ({
          code: item.mappedCode || item.code,
          title: item.mappedTitle || item.title || item.code || 'Disposition',
          score: typeof item.score === 'number' ? item.score : 0,
        })) ?? [];

      if (nextDispositions.length > 0) {
        setDispositions(nextDispositions);
        setSelectedCode(nextDispositions[0].code);
      }

      const summary = payload.summary;
      const newNotes = [summary.issue, summary.resolution, summary.next_steps]
        .filter((section: string | undefined) => typeof section === 'string' && section.trim().length > 0)
        .join('\n\n');

      if (newNotes) {
        setNotes(newNotes);
      }
    } catch (err: any) {
      console.error('[AutoDispositionModal] Retry failed', err);
      setError(err?.message ?? 'Retry failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
        <header className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Auto-Generated Disposition &amp; Notes</h2>
            <p className="text-sm text-gray-500">
              Review the suggested disposition and notes before syncing to the call record.
            </p>
          </div>
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={onClose}
            disabled={disabled}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="space-y-6 px-6 py-5">
          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Suggested dispositions</h3>
            <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
              {dispositions.length === 0 && (
                <p className="text-sm text-gray-500">No dispositions were suggested. Retry to generate new options.</p>
              )}
              {dispositions.map((item) => (
                <label
                  key={item.code}
                  className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                    selectedCode === item.code
                      ? 'border-blue-500 bg-white'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="auto-disposition"
                      checked={selectedCode === item.code}
                      onChange={() => setSelectedCode(item.code)}
                      disabled={disabled}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-gray-800">{item.title || item.code}</span>
                  </span>
                  <span className="text-xs text-gray-500">Confidence {(item.score * 100).toFixed(0)}%</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-gray-700">Notes</h3>
            <textarea
              className="h-36 w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Summarize the call outcome and next steps..."
              disabled={disabled}
            />
          </section>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={handleRetry}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === 'retry' ? <Spinner /> : null}
            Retry
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading === 'save' ? <Spinner /> : null}
            Save &amp; Sync
          </button>
        </footer>
      </div>
    </div>
  );
}

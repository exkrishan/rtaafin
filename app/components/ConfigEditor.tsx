'use client';

/**
 * Configuration Editor Component
 * Allows editing configuration as JSON with validation and save
 */

import { useState } from 'react';
import type { Config, ConfigScope } from '@/lib/config';

interface ConfigEditorProps {
  initialConfig: Partial<Config>;
  scope: ConfigScope;
  scopeId: string | null;
  onSaved?: (config: Partial<Config>) => void;
  onCancel?: () => void;
}

export default function ConfigEditor({
  initialConfig,
  scope,
  scopeId,
  onSaved,
  onCancel,
}: ConfigEditorProps) {
  const [configText, setConfigText] = useState(
    JSON.stringify(initialConfig, null, 2)
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    // Validate JSON
    let config: Partial<Config>;
    try {
      config = JSON.parse(configText);
    } catch (err: any) {
      setError(`Invalid JSON: ${err.message}`);
      return;
    }

    // Validate config is an object
    if (typeof config !== 'object' || config === null) {
      setError('Config must be an object');
      return;
    }

    setSaving(true);

    try {
      // Get admin key from env or window
      const adminKey =
        process.env.NEXT_PUBLIC_ADMIN_KEY ||
        (typeof window !== 'undefined' && (window as any).__ADMIN_KEY__);

      if (!adminKey) {
        setError('Admin key not configured. Set NEXT_PUBLIC_ADMIN_KEY or window.__ADMIN_KEY__');
        setSaving(false);
        return;
      }

      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          scope,
          scopeId,
          config,
          actor: 'admin-ui',
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to save config');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      if (onSaved) {
        onSaved(config);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfigText(JSON.stringify(initialConfig, null, 2));
    setError(null);
    setSuccess(false);
  };

  const formatJson = () => {
    try {
      const config = JSON.parse(configText);
      setConfigText(JSON.stringify(config, null, 2));
      setError(null);
    } catch (err: any) {
      setError(`Invalid JSON: ${err.message}`);
    }
  };

  return (
    <div className="config-editor">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="font-semibold">Scope:</span> {scope}
            {scopeId && (
              <>
                {' / '}
                <span className="font-semibold">ID:</span> {scopeId}
              </>
            )}
          </div>
          <button
            onClick={formatJson}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Format JSON
          </button>
        </div>

        <textarea
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          className="w-full h-96 font-mono text-sm p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter configuration as JSON..."
          spellCheck={false}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          Configuration saved successfully!
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>

        <button
          onClick={handleReset}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Reset
        </button>

        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <p>
          <strong>Tip:</strong> Configuration uses deep merge. Only include fields you want to override.
        </p>
        <p className="mt-1">
          Example: <code className="bg-gray-100 px-1 rounded">{'{ "kb": { "maxArticles": 5 } }'}</code>
        </p>
      </div>
    </div>
  );
}

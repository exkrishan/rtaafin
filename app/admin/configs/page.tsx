'use client';

/**
 * Configuration Admin Page
 * List and edit configurations for different scopes
 */

import { useState, useEffect } from 'react';
import ConfigEditor from '@/app/components/ConfigEditor';
import type { ConfigRow, ConfigScope, Config } from '@/lib/config';

export default function ConfigsAdminPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<ConfigRow | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newScope, setNewScope] = useState<ConfigScope>('tenant');
  const [newScopeId, setNewScopeId] = useState('');

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/config');
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load configs');
      }

      setConfigs(data.configs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaved = () => {
    setEditingConfig(null);
    setCreatingNew(false);
    setNewScope('tenant');
    setNewScopeId('');
    loadConfigs();
  };

  const handleCreateNew = () => {
    if (newScope !== 'global' && !newScopeId.trim()) {
      alert('Please enter a scope ID');
      return;
    }

    setCreatingNew(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Configuration Management</h1>
        <div className="text-gray-600">Loading configurations...</div>
      </div>
    );
  }

  if (editingConfig) {
    return (
      <div className="p-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Edit Configuration</h1>
        <ConfigEditor
          initialConfig={editingConfig.config}
          scope={editingConfig.scope}
          scopeId={editingConfig.scope_id}
          onSaved={handleSaved}
          onCancel={() => setEditingConfig(null)}
        />
      </div>
    );
  }

  if (creatingNew) {
    return (
      <div className="p-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Create New Configuration</h1>
        <ConfigEditor
          initialConfig={{}}
          scope={newScope}
          scopeId={newScope === 'global' ? null : newScopeId}
          onSaved={handleSaved}
          onCancel={() => {
            setCreatingNew(false);
            setNewScopeId('');
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl">
        <h1 className="text-3xl font-bold mb-6">Configuration Management</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        <div className="mb-6 bg-white border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Create New Configuration</h2>

          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scope
              </label>
              <select
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as ConfigScope)}
                className="border rounded-lg px-3 py-2"
              >
                <option value="global">Global</option>
                <option value="tenant">Tenant</option>
                <option value="campaign">Campaign</option>
                <option value="agent">Agent</option>
              </select>
            </div>

            {newScope !== 'global' && (
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Scope ID
                </label>
                <input
                  type="text"
                  value={newScopeId}
                  onChange={(e) => setNewScopeId(e.target.value)}
                  placeholder={`Enter ${newScope} ID...`}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            )}

            <button
              onClick={handleCreateNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </div>

        <div className="bg-white border rounded-lg">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Existing Configurations</h2>
          </div>

          {configs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No configurations found. Create one above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Scope
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Scope ID
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Version
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Updated By
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Updated At
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {configs.map((config) => (
                    <tr key={config.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          {config.scope}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {config.scope_id || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">{config.version}</td>
                      <td className="px-4 py-3 text-sm">
                        {config.updated_by || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(config.updated_at)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => setEditingConfig(config)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 text-sm text-gray-500">
          <p>
            <strong>Note:</strong> Admin key required for updates. Set{' '}
            <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_ADMIN_KEY</code> in your
            environment or inject <code className="bg-gray-100 px-1 rounded">window.__ADMIN_KEY__</code>
          </p>
        </div>
      </div>
    </div>
  );
}

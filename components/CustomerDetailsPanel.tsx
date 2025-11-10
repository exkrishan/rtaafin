'use client';

import { useState } from 'react';
import type { Customer } from './CustomerDetailsHeader';

export interface CustomerDetailsPanelProps {
  customer: Customer;
  onOpenCRM?: () => void;
  onOpenCaseHistory?: () => void;
}

export default function CustomerDetailsPanel({
  customer,
  onOpenCRM,
  onOpenCaseHistory,
}: CustomerDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'crm'>('overview');

  return (
    <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Contact History
        </button>
        <button
          onClick={() => setActiveTab('crm')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'crm'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          CRM
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact Information</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Phone:</span>
                  <span className="text-gray-900 font-medium">{customer.masked_phone}</span>
                </div>
                {customer.email && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Email:</span>
                    <span className="text-gray-900 font-medium">{customer.email}</span>
                  </div>
                )}
                {customer.account && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Account:</span>
                    <span className="text-gray-900 font-medium">{customer.account}</span>
                  </div>
                )}
              </div>
            </div>

            {customer.tags && customer.tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {customer.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Past Interactions</h3>
              <input
                type="text"
                placeholder="Search interactions..."
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {customer.lastInteractions && customer.lastInteractions.length > 0 ? (
              <div className="space-y-3">
                {customer.lastInteractions.map((interaction, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-md border border-gray-200">
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-900">{interaction.summary}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap ml-2">{interaction.date}</span>
                    </div>
                    {interaction.caseId && (
                      <div className="text-xs text-gray-600 mt-1">Case: {interaction.caseId}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-sm text-gray-500">
                No past interactions found
              </div>
            )}

            {onOpenCaseHistory && (
              <button
                onClick={onOpenCaseHistory}
                className="w-full mt-4 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                View Full Case History
              </button>
            )}
          </div>
        )}

        {activeTab === 'crm' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">CRM Integration</h3>
            
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                <div className="text-sm font-medium text-gray-900 mb-1">Customer ID</div>
                <div className="text-xs text-gray-600">{customer.id || 'N/A'}</div>
              </div>

              <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                <div className="text-sm font-medium text-gray-900 mb-1">Account Status</div>
                <div className="text-xs text-gray-600">Active</div>
              </div>
            </div>

            {onOpenCRM && (
              <button
                onClick={onOpenCRM}
                className="w-full mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                Open in CRM
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


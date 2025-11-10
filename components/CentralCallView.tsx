'use client';

import { useState } from 'react';
import type { Customer } from './CustomerDetailsHeader';
import CallControls from './CallControls';

export interface TranscriptUtterance {
  utterance_id: string;
  speaker: 'agent' | 'customer';
  text: string;
  confidence?: number;
  timestamp: string;
}

export interface CentralCallViewProps {
  customer: Customer | null;
  callDuration: string;
  callId?: string;
  isCallActive: boolean;
  transcript?: TranscriptUtterance[];
  onMute?: () => void;
  onHold?: () => void;
  onTransfer?: () => void;
  onConference?: () => void;
  onKeypad?: () => void;
  onRecord?: () => void;
  onComplete?: () => void;
  onEndCall?: () => void;
  onOpenCRM?: () => void;
  onOpenCaseHistory?: () => void;
}

export default function CentralCallView({
  customer,
  callDuration,
  callId,
  isCallActive,
  transcript = [],
  onMute,
  onHold,
  onTransfer,
  onConference,
  onKeypad,
  onRecord,
  onComplete,
  onEndCall,
  onOpenCRM,
  onOpenCaseHistory,
}: CentralCallViewProps) {
  const [activeTab, setActiveTab] = useState<'transcript' | 'customer' | 'crm'>('transcript');

  if (!customer) {
    return (
      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 p-8 flex items-center justify-center">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-sm text-gray-500">No Customer Exists</p>
          <p className="text-xs mt-2 text-gray-400">Please check the customer in CRM App.</p>
        </div>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
      {/* Call Header Section */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Customer Avatar */}
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
              {getInitials(customer.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{customer.name}</h2>
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.724 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.724 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.724-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 .724-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-600">{customer.masked_phone}</span>
                {customer.account && (
                  <>
                    <span className="text-gray-400">•</span>
                    <span className="text-sm text-gray-600">{customer.account}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {/* Call Status */}
          {isCallActive && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium text-gray-900">{callDuration}</span>
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Call Controls */}
      <div className="px-6 py-4 border-b border-gray-200">
        <CallControls
          onMute={onMute}
          onHold={onHold}
          onTransfer={onTransfer}
          onConference={onConference}
          onKeypad={onKeypad}
          onRecord={onRecord}
          onComplete={onComplete}
          onEndCall={onEndCall}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('transcript')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'transcript'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Transcript
        </button>
        <button
          onClick={() => setActiveTab('customer')}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'customer'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Customer
        </button>
        <button
          onClick={() => setActiveTab('crm')}
          className={`px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'crm'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          LeadSquare
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'transcript' && (
          <div className="p-6">
            {/* Call Details */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <div className="grid grid-cols-4 gap-4 text-xs text-gray-600">
                <div>
                  <span className="text-gray-500">Campaign:</span> <span className="text-gray-900 font-medium">Service</span>
                </div>
                <div>
                  <span className="text-gray-500">Queue:</span> <span className="text-gray-900 font-medium">Card</span>
                </div>
                <div>
                  <span className="text-gray-500">Call Type:</span> <span className="text-gray-900 font-medium">Inbound</span>
                </div>
                <div>
                  <span className="text-gray-500">DID:</span> <span className="text-gray-900 font-medium">080 XXXXXXXX</span>
                </div>
              </div>
            </div>

            {/* Transcript Messages */}
            <div className="space-y-4">
              {transcript.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-500">
                  Waiting for transcript...
                </div>
              ) : (
                transcript.map((utterance) => {
                  // Filter out system messages
                  if (utterance.text.includes('Connected to realtime stream') || utterance.text.includes('clientId:')) {
                    return null;
                  }

                  return (
                    <div
                      key={utterance.utterance_id}
                      className={`flex gap-3 ${
                        utterance.speaker === 'agent' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {utterance.speaker === 'customer' && (
                        <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                          {customer ? customer.name.charAt(0).toUpperCase() : 'C'}
                        </div>
                      )}
                      <div className={`flex-1 max-w-[70%] ${utterance.speaker === 'agent' ? 'order-2' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-700">
                            {utterance.speaker === 'agent' ? 'You' : customer?.name || 'Customer'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(utterance.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div
                          className={`p-3 rounded-lg ${
                            utterance.speaker === 'agent'
                              ? 'bg-blue-50 text-gray-900'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <p className="text-sm leading-relaxed">{utterance.text}</p>
                        </div>
                      </div>
                      {utterance.speaker === 'agent' && (
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 order-3">
                          P
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'customer' && (
          <div className="p-6 space-y-6">
            {/* Customer Information */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Customer Information</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Phone Number:</span>
                  <span className="text-gray-900 font-medium">{customer.masked_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Business Number:</span>
                  <span className="text-gray-900 font-medium">{customer.masked_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Home Number:</span>
                  <span className="text-gray-900 font-medium">{customer.masked_phone}</span>
                </div>
                {customer.email && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email ID:</span>
                    <span className="text-gray-900 font-medium">{customer.email}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Instagram:</span>
                  <div className="flex gap-2">
                    <span className="text-gray-900 font-medium">@mj12</span>
                    <span className="text-gray-900 font-medium">@mani12</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sentiment Trend */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Sentiment Trend</h3>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-600">Last 5 months</span>
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">Positive</span>
                </div>
                <div className="h-24 flex items-end gap-2">
                  {[65, 72, 68, 75, 80].map((value, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-blue-500 rounded-t"
                        style={{ height: `${value}%` }}
                      />
                      <span className="text-xs text-gray-500 mt-1">Nov</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary</h3>
              <button
                onClick={onOpenCaseHistory}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                Last 5 Interaction
              </button>
            </div>

            {/* Past Interactions */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Past Interactions (4)</h3>
                <input
                  type="text"
                  placeholder="Search interactions..."
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="space-y-3">
                {/* Intent */}
                <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-900">Intent:</span>
                    <span className="text-xs text-gray-700">Complex Trade Execution Support</span>
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">Neutral</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Manish had reported a fraudulent SMS and a small unauthorized debit card transaction in the past few months, leading to a new debit card issuance.
                  </p>
                </div>

                {/* Cases */}
                {customer.lastInteractions && customer.lastInteractions.length > 0 ? (
                  customer.lastInteractions.map((interaction, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-md border border-gray-200">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-900">Case: {interaction.caseId || `4567${i}`}</span>
                          <span className="text-xs text-gray-600">|</span>
                          <span className="text-xs text-gray-600">Delivery</span>
                          <span className="text-xs text-gray-600">|</span>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Closed</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{interaction.summary}</p>
                      <div className="text-xs text-gray-500 mt-1">{interaction.date}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-sm text-gray-500">
                    No past interactions found
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'crm' && (
          <div className="p-6">
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">CRM Integration</h3>
              <p className="text-xs text-gray-600 mb-4">Connect to your CRM system to view detailed customer information</p>
              {onOpenCRM && (
                <button
                  onClick={onOpenCRM}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                >
                  Open in CRM
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


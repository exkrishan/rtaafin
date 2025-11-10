'use client';

import { useState, useRef, useEffect } from 'react';

export interface Customer {
  name: string;
  id: string;
  masked_phone: string;
  account: string;
  tags?: string[];
  email?: string;
  lastInteractions?: Array<{
    date: string;
    summary: string;
    caseId?: string;
  }>;
}

export interface CustomerDetailsHeaderProps {
  customer: Customer | null;
  callDuration?: string;
  callId?: string;
  onOpenCRM?: () => void;
  onOpenCaseHistory?: () => void;
}

export default function CustomerDetailsHeader({
  customer,
  callDuration = '00:00',
  callId,
  onOpenCRM,
  onOpenCaseHistory,
}: CustomerDetailsHeaderProps) {
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Close flyout when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(event.target as Node)) {
        setFlyoutOpen(false);
      }
    };

    if (flyoutOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [flyoutOpen]);

  if (!customer) {
    return (
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="text-sm text-gray-500">No customer information available</div>
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

  const maskPhone = (phone: string) => {
    // Already masked, but ensure format
    return phone.replace(/(\+\d{2})-(\d{4})-(\d{4})/, '+$1-XXXX-$3');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 relative" ref={flyoutRef}>
      {/* Main Header - Centered like Universal Agent Desktop */}
      <div className="px-6 py-8">
        <div className="flex flex-col items-center gap-5">
          {/* Large Avatar - Centered, consistent size */}
          <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-xl flex-shrink-0">
            {getInitials(customer.name)}
          </div>
          
          {/* Customer Name - Consistent font size */}
          <div className="text-center">
            <button
              onClick={() => setFlyoutOpen(!flyoutOpen)}
              className="text-lg font-semibold text-gray-900 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label={`Customer details for ${customer.name}`}
              aria-expanded={flyoutOpen}
            >
              {customer.name}
            </button>
          </div>
          
          {/* Customer Info Row - Consistent font size */}
          <div className="flex items-center gap-2 justify-center">
            <div className="text-sm text-gray-600">
              {maskPhone(customer.masked_phone)}
            </div>
            {customer.account && (
              <>
                <span className="text-gray-400 text-sm">•</span>
                <div className="text-sm text-gray-600">
                  {customer.account}
                </div>
              </>
            )}
          </div>
          
          {/* Tags - Consistent size */}
          {customer.tags && customer.tags.length > 0 && (
            <div className="flex gap-2 justify-center">
              {customer.tags.slice(0, 2).map((tag, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Call Details Row - Consistent font size and alignment */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="space-y-1.5 text-left">
            <div className="text-xs text-gray-600">Campaign: <span className="text-gray-900">whatsapp_chat</span></div>
            <div className="text-xs text-gray-600">Call Type: <span className="text-gray-900">Manual Dial</span></div>
            <div className="text-xs text-gray-600">Queue: <span className="text-gray-900">--</span></div>
            <div className="text-xs text-gray-600">DID: <span className="text-gray-900">NODID</span></div>
          </div>
        </div>
      </div>

      {/* Flyout */}
      {flyoutOpen && (
        <div
          className="absolute top-full left-0 right-0 bg-white border border-gray-200 shadow-lg z-50 rounded-b-lg"
          role="dialog"
          aria-label="Customer details"
        >
          <div className="p-4 space-y-4">
            {/* Email */}
            {customer.email && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Email</div>
                <div className="text-sm text-gray-900 flex items-center gap-2">
                  <span>{customer.email}</span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="PII redacted">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>
            )}

            {/* Last Interactions */}
            {customer.lastInteractions && customer.lastInteractions.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">Last 3 Interactions</div>
                <div className="space-y-2">
                  {customer.lastInteractions.slice(0, 3).map((interaction, i) => (
                    <div key={i} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-900">{interaction.summary}</span>
                        <span className="text-gray-500 text-xs">{interaction.date}</span>
                      </div>
                      {interaction.caseId && (
                        <div className="text-xs text-gray-500 mt-0.5">Case: {interaction.caseId}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Links */}
            <div className="pt-2 border-t border-gray-200">
              <div className="flex gap-2">
                {onOpenCRM && (
                  <button
                    onClick={() => {
                      onOpenCRM();
                      setFlyoutOpen(false);
                    }}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Open CRM
                  </button>
                )}
                {onOpenCaseHistory && (
                  <button
                    onClick={() => {
                      onOpenCaseHistory();
                      setFlyoutOpen(false);
                    }}
                    className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Case History
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


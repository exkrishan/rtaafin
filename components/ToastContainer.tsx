'use client';

import { useEffect, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

let toastIdCounter = 0;
const toastListeners: Array<(toast: Toast | null) => void> = [];

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 2000) {
  const toast: Toast = {
    id: `toast-${++toastIdCounter}`,
    message,
    type,
    duration,
  };
  toastListeners.forEach((listener) => listener(toast));
}

export default function ToastContainer() {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    toastListeners.push(setToast);
    return () => {
      const index = toastListeners.indexOf(setToast);
      if (index > -1) {
        toastListeners.splice(index, 1);
      }
    };
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, toast.duration || 2000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!toast) return null;

  const bgColor = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-gray-900',
  }[toast.type || 'info'];

  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg transition-opacity duration-300 flex items-center gap-2`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="text-sm">{toast.message}</span>
      <button
        onClick={() => setToast(null)}
        className="ml-2 text-white/80 hover:text-white transition-colors"
        aria-label="Close toast"
      >
        <svg
          className="w-4 h-4"
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
  );
}


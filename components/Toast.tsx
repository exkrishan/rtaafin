'use client';

import { useEffect, useState } from 'react';

export interface ToastProps {
  message: string;
  duration?: number;
  onClose?: () => void;
}

export default function Toast({ message, duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose?.(), 300); // Wait for fade out
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 text-white px-4 py-3 shadow-lg transition-opacity duration-300 flex items-center gap-2"
      role="alert"
      aria-live="polite"
    >
      <span>{message}</span>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(() => onClose?.(), 300);
        }}
        className="ml-2 text-white/80 hover:text-white"
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
}

// Hook for using toast
export function useToast() {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

  const showToast = (message: string) => {
    const id = Date.now();
    setToast({ message, id });
  };

  const ToastComponent = toast ? (
    <Toast
      key={toast.id}
      message={toast.message}
      onClose={() => setToast(null)}
    />
  ) : null;

  return { showToast, ToastComponent };
}


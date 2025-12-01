'use client';

interface DispositionProgressNotificationProps {
  visible: boolean;
  message?: string;
}

export default function DispositionProgressNotification({
  visible,
  message = 'Generating disposition...',
}: DispositionProgressNotificationProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-6 min-w-[320px] animate-slide-in">
        <div className="flex items-center gap-3 mb-4">
          <svg
            className="animate-spin h-6 w-6 text-blue-600"
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
          <p className="text-sm font-medium text-gray-900">{message}</p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full animate-progress" style={{ width: '70%' }} />
        </div>
      </div>
    </div>
  );
}


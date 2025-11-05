'use client';

/**
 * RealtimeNotice Component
 * Displays connection status and last event time for SSE stream
 */

import { useEffect, useState } from 'react';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface RealtimeNoticeProps {
  status: ConnectionStatus;
  lastEventTime?: Date;
  reconnectAttempts?: number;
}

export default function RealtimeNotice({
  status,
  lastEventTime,
  reconnectAttempts = 0,
}: RealtimeNoticeProps) {
  const [timeSinceLastEvent, setTimeSinceLastEvent] = useState<string>('—');

  // Update time since last event
  useEffect(() => {
    if (!lastEventTime) {
      setTimeSinceLastEvent('—');
      return;
    }

    const updateTime = () => {
      const now = Date.now();
      const diff = now - lastEventTime.getTime();
      const seconds = Math.floor(diff / 1000);

      if (seconds < 60) {
        setTimeSinceLastEvent(`${seconds}s ago`);
      } else if (seconds < 3600) {
        setTimeSinceLastEvent(`${Math.floor(seconds / 60)}m ago`);
      } else {
        setTimeSinceLastEvent(`${Math.floor(seconds / 3600)}h ago`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lastEventTime]);

  // Status styling
  const statusConfig = {
    connected: {
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      dotColor: 'bg-green-500',
      label: 'Connected',
    },
    reconnecting: {
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-800',
      dotColor: 'bg-yellow-500',
      label: `Reconnecting${reconnectAttempts > 0 ? ` (${reconnectAttempts})` : ''}`,
    },
    disconnected: {
      bgColor: 'bg-red-100',
      textColor: 'text-red-800',
      dotColor: 'bg-red-500',
      label: 'Disconnected',
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${config.bgColor} ${config.textColor}`}
    >
      {/* Status dot with pulse animation for connecting states */}
      <div className="relative flex items-center justify-center">
        <div
          className={`w-2 h-2 rounded-full ${config.dotColor} ${
            status === 'reconnecting' ? 'animate-pulse' : ''
          }`}
        />
      </div>

      {/* Status text */}
      <span>{config.label}</span>

      {/* Last event time */}
      {lastEventTime && status === 'connected' && (
        <>
          <span className="opacity-40">•</span>
          <span className="opacity-70">{timeSinceLastEvent}</span>
        </>
      )}
    </div>
  );
}

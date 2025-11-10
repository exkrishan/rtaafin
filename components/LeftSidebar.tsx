'use client';

export interface LeftSidebarProps {
  onNavigate?: (path: string) => void;
  // Demo controls
  isCallActive?: boolean;
  isPaused?: boolean;
  callEnded?: boolean;
  onStartCall?: () => void;
  onPauseCall?: () => void;
  onResumeCall?: () => void;
  onStopCall?: () => void;
  onResetCall?: () => void;
}

export default function LeftSidebar({ 
  onNavigate,
  isCallActive = false,
  isPaused = false,
  callEnded = false,
  onStartCall,
  onPauseCall,
  onResumeCall,
  onStopCall,
  onResetCall,
}: LeftSidebarProps) {
  const handleClick = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      console.log('[LeftSidebar] Navigate to:', path);
    }
  };

  return (
    <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-0">
      {/* Exotel Logo at top */}
      <div className="mb-4 px-2">
        <img 
          src="/xtrm_logo_color.svg" 
          alt="Exotel" 
          className="w-full h-auto"
          style={{ maxWidth: '90px' }}
        />
      </div>

      {/* Home */}
      <button
        onClick={() => handleClick('/')}
        className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Home"
        title="Home"
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </button>

      {/* Separator */}
      <div className="w-8 h-px bg-gray-200 my-2" />

      {/* Calls/Interactions with badge */}
      <button
        onClick={() => handleClick('/interactions')}
        className="p-3 hover:bg-gray-100 rounded-lg transition-colors relative"
        aria-label="Calls"
        title="Calls"
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <span className="absolute top-1 right-1 bg-blue-500 text-white text-xs font-semibold rounded px-1.5 py-0.5 min-w-[20px] text-center">
          63
        </span>
      </button>

      {/* Tasks/Checkbox */}
      <button
        onClick={() => handleClick('/tasks')}
        className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Tasks"
        title="Tasks"
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {/* Calendar */}
      <button
        onClick={() => handleClick('/calendar')}
        className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Calendar"
        title="Calendar"
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Users/Team */}
      <button
        onClick={() => handleClick('/team')}
        className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Team"
        title="Team"
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      </button>

      {/* Separator */}
      <div className="w-8 h-px bg-gray-200 my-2" />

      {/* Four grid icons (app launcher) */}
      {[1, 2, 3, 4].map((i) => (
        <button
          key={i}
          onClick={() => handleClick(`/app-${i}`)}
          className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label={`App ${i}`}
          title={`App ${i}`}
        >
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
      ))}

      {/* Spacer to push bottom items down */}
      <div className="flex-1" />

      {/* Demo Controls - Icon-only buttons */}
      <div className="w-8 h-px bg-gray-200 my-2" />
      
      {/* Start/Pause/Resume/Stop Call */}
      {!isCallActive && !callEnded && (
        <button
          onClick={onStartCall}
          disabled={!onStartCall}
          className="p-3 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Start Call"
          title="Start Call"
        >
          <svg className="w-6 h-6 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
      )}
      {isCallActive && (
        <>
          {isPaused ? (
            <button
              onClick={onResumeCall}
              className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Resume"
              title="Resume"
            >
              <svg className="w-6 h-6 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={onPauseCall}
              className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Pause"
              title="Pause"
            >
              <svg className="w-6 h-6 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            </button>
          )}
          <button
            onClick={onStopCall}
            className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Stop"
            title="Stop"
          >
            <svg className="w-6 h-6 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z"/>
            </svg>
          </button>
        </>
      )}
      {callEnded && (
        <button
          onClick={onResetCall}
          className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Reset"
          title="Reset"
        >
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}

      {/* Settings */}
      <button
        onClick={() => handleClick('/settings')}
        className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Settings"
        title="Settings"
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* Help */}
      <button
        onClick={() => handleClick('/help')}
        className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Help"
        title="Help"
      >
        <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </div>
  );
}

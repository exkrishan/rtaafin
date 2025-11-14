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
      <div className="mb-4 px-2 flex items-center justify-center">
        <svg 
          width="99" 
          height="30" 
          viewBox="0 0 99 30" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto"
          style={{ maxWidth: '120px', height: 'auto' }}
          aria-label="Exotel"
        >
          <mask id="mask0_58947_303832" maskUnits="userSpaceOnUse" x="0" y="0" width="99" height="30" style={{ maskType: 'luminance' }}>
            <path d="M99 0.5H0V29.5H99V0.5Z" fill="white"></path>
          </mask>
          <g mask="url(#mask0_58947_303832)">
            <path d="M9.74086 29.5013C4.38043 29.5013 0 25.2716 0 19.0574V18.9792C0 13.1948 3.96647 8.53516 9.36491 8.53516C15.1435 8.53516 18.4257 13.3859 18.4257 18.7056C18.4257 19.522 17.7836 20.1039 17.0655 20.1039H2.94422C3.35819 24.4509 6.34043 26.8958 9.8169 26.8958C12.2331 26.8958 14.0072 25.9274 15.4434 24.5681C15.6716 24.3727 15.9334 24.2207 16.2756 24.2207C16.9937 24.2207 17.5597 24.8026 17.5597 25.5018C17.5597 25.8492 17.4077 26.201 17.1078 26.4702C15.2576 28.2984 13.0653 29.5013 9.74086 29.5013ZM15.5195 17.8935C15.2153 14.2457 13.1793 11.0626 9.28888 11.0626C5.88845 11.0626 3.3244 13.9765 2.94422 17.8935H15.5195Z" fill="black"></path>
            <path d="M40.4844 19.0964V19.0183C40.4844 13.3512 44.7888 8.53516 50.6815 8.53516C56.5362 8.53516 60.8406 13.273 60.8406 18.9401V19.0183C60.8406 24.6854 56.4981 29.5013 50.6055 29.5013C44.7508 29.5013 40.4844 24.7636 40.4844 19.0964ZM57.8541 19.0964V19.0183C57.8541 14.7104 54.7198 11.1755 50.6055 11.1755C46.3771 11.1755 43.4667 14.7061 43.4667 18.9401V19.0183C43.4667 23.3261 46.563 26.822 50.6773 26.822C54.9099 26.822 57.8541 23.3305 57.8541 19.0964Z" fill="black"></path>
            <path d="M63.3333 23.7162V11.6046H61.745C61.0649 11.6046 60.4609 10.9836 60.4609 10.2845C60.4609 9.54622 61.0649 8.96431 61.745 8.96431H63.3333V4.22651C63.3333 3.4101 63.9373 2.71094 64.7695 2.71094C65.5636 2.71094 66.2437 3.4101 66.2437 4.22651V8.96431H71.3042C72.0223 8.96431 72.6264 9.5853 72.6264 10.2845C72.6264 11.0227 72.0223 11.6046 71.3042 11.6046H66.2437V23.3297C66.2437 25.7746 67.5659 26.6692 69.5301 26.6692C70.5481 26.6692 71.0761 26.3956 71.3042 26.3956C71.9843 26.3956 72.5504 26.9775 72.5504 27.6767C72.5504 28.2195 72.2124 28.6494 71.7182 28.8405C70.8861 29.1879 69.9821 29.3833 68.85 29.3833C65.7115 29.3833 63.3333 27.7939 63.3333 23.7162Z" fill="black"></path>
            <path d="M83.2705 29.5013C77.9058 29.5013 73.5254 25.2716 73.5254 19.0574V18.9792C73.5254 13.1948 77.4919 8.53516 82.8903 8.53516C88.6689 8.53516 91.9511 13.3859 91.9511 18.7056C91.9511 19.522 91.309 20.1039 90.5909 20.1039H76.4696C76.8836 24.4509 79.8658 26.8958 83.3423 26.8958C85.7585 26.8958 87.5326 25.9274 88.9688 24.5681C89.1969 24.3727 89.4588 24.2207 89.801 24.2207C90.5191 24.2207 91.0851 24.8026 91.0851 25.5018C91.0851 25.8492 90.9331 26.201 90.6331 26.4702C88.7872 28.2984 86.5949 29.5013 83.2705 29.5013ZM89.0491 17.8935C88.7492 14.2457 86.7089 11.0626 82.8185 11.0626C79.4181 11.0626 76.8498 13.9765 76.4738 17.8935H89.0491Z" fill="black"></path>
            <path d="M95.0938 2.01557C95.0938 1.19916 95.7356 0.5 96.5298 0.5C97.3619 0.5 98.0042 1.19916 98.0042 2.01557V27.7152C98.0042 28.5707 97.3999 29.2308 96.5678 29.2308C95.7356 29.2308 95.0938 28.5707 95.0938 27.7152V2.01557Z" fill="black"></path>
            <path d="M37.1638 29.4797C35.8459 29.4884 34.7434 28.5461 34.473 27.2129C34.2027 25.8797 33.6873 24.6638 32.7961 23.6389C31.005 21.5762 27.913 21.5849 26.1304 23.6606C25.2729 24.6638 24.7491 25.8406 24.4914 27.1391C24.2253 28.4679 23.1777 29.4537 21.9231 29.4928C20.5376 29.5362 19.4098 28.6807 19.1014 27.3084C18.7423 25.719 19.7604 24.1948 21.3613 23.8691C22.8271 23.5694 24.1535 22.9267 25.1461 21.7368C26.633 19.952 26.4049 17.3291 24.6688 15.8048C23.6804 14.9363 22.5314 14.4108 21.2726 14.1459C19.9293 13.8637 19.0169 12.7085 19.0338 11.2668C19.0507 9.94661 20.0434 8.79581 21.3444 8.58302C22.8355 8.33984 24.1746 9.34732 24.4914 10.8977C24.7871 12.3481 25.3742 13.6639 26.4387 14.7018C28.1622 16.3781 30.8192 16.3563 32.5468 14.6757C32.6989 14.5281 32.8932 14.3891 33.0917 14.3283C33.5268 14.1894 33.9788 14.4022 34.1985 14.793C34.4308 15.2055 34.3717 15.6963 34.0253 16.0524C33.5057 16.5865 33.1298 17.2118 32.9566 17.9457C32.5384 19.7566 33.0791 21.2461 34.473 22.4056C35.4277 23.2003 36.5386 23.6563 37.7341 23.9212C39.052 24.2121 39.9729 25.415 39.9137 26.783C39.8546 28.1856 38.8535 29.3104 37.5017 29.4884C37.3919 29.4928 37.2779 29.4797 37.1638 29.4797Z" fill="#394FB6"></path>
            <path d="M39.9016 11.3605C39.9016 12.9412 38.6935 14.1745 37.1475 14.1745C35.631 14.1745 34.4313 12.9195 34.4356 11.3431C34.4356 9.79283 35.6479 8.55518 37.1686 8.55083C38.6893 8.54215 39.9016 9.79282 39.9016 11.3605Z" fill="#394FB6"></path>
          </g>
        </svg>
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

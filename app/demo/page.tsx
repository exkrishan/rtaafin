'use client';

import { useState, useRef, useEffect } from 'react';
import TranscriptPanel from '@/components/TranscriptPanel';
import AutoDispositionModal, { Suggestion } from '@/components/AutoDispositionModal';
import AgentAssistPanel from '@/components/AgentAssistPanel';
import ToastContainer from '@/components/ToastContainer';

interface DemoTranscriptLine {
  seq: number;
  speaker: string;
  text: string;
  ts: string;
}

interface DemoResult {
  callId: string;
  tenantId: string;
  startedAt: string;
  endedAt: string;
  disposition?: {
    suggested: Suggestion[];
    autoNotes: string;
  };
}

export default function DemoPage() {
  const [callId] = useState(`demo-call-${Date.now()}`);
  const [tenantId] = useState('default');
  const [isCallActive, setIsCallActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [dispositionOpen, setDispositionOpen] = useState(false);
  const [dispositionData, setDispositionData] = useState<{
    suggested: Suggestion[];
    autoNotes: string;
  } | null>(null);
  const [demoTranscript, setDemoTranscript] = useState<DemoTranscriptLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptIndexRef = useRef(0);
  const callStartTimeRef = useRef<Date | null>(null);

  // Load demo transcript from JSON file
  useEffect(() => {
    fetch('/demo_playback.json')
      .then(res => res.json())
      .then(data => {
        setDemoTranscript(data);
      })
      .catch(err => {
        console.error('[Demo] Failed to load demo transcript:', err);
      });
  }, []);

  const sendTranscriptLineRef = useRef<((index: number) => Promise<void>) | null>(null);

  const startCall = async () => {
    if (isCallActive || demoTranscript.length === 0) return;
    
    setIsCallActive(true);
    setIsPaused(false);
    setCallEnded(false);
    setProgress(0);
    transcriptIndexRef.current = 0;
    callStartTimeRef.current = new Date();

    const sendTranscriptLine = async (index: number) => {
      if (index >= demoTranscript.length) {
        setIsCallActive(false);
        setCallEnded(true);
        setProgress(100);
        console.log('[Demo] All transcript lines sent');
        // Auto-open disposition modal
        setTimeout(() => {
          disposeCall();
        }, 1000);
        return;
      }

      if (isPaused) {
        transcriptIndexRef.current = index;
        return;
      }

      const line = demoTranscript[index];
      const text = `${line.speaker}: ${line.text}`;
      const progressPercent = ((index + 1) / demoTranscript.length) * 100;
      setProgress(progressPercent);
      transcriptIndexRef.current = index;

      try {
        const response = await fetch('/api/calls/ingest-transcript', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
          },
          body: JSON.stringify({
            callId,
            seq: line.seq,
            ts: line.ts,
            text,
          }),
        });

        if (response.ok) {
          console.log('[Demo] Sent transcript line', { seq: line.seq, text: text.substring(0, 50) });
        }
      } catch (err) {
        console.error('[Demo] Failed to send transcript line', err);
      }

      if (index < demoTranscript.length - 1) {
        intervalRef.current = setTimeout(() => {
          sendTranscriptLine(index + 1);
        }, 2000); // ~2s cadence as specified
      }
    };

    sendTranscriptLineRef.current = sendTranscriptLine;
    sendTranscriptLine(0);
  };

  const pauseCall = () => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPaused(true);
  };

  const resumeCall = () => {
    if (!isCallActive || !isPaused || !sendTranscriptLineRef.current) return;
    setIsPaused(false);
    const currentIndex = transcriptIndexRef.current;
    sendTranscriptLineRef.current(currentIndex);
  };

  const resetCall = () => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsCallActive(false);
    setIsPaused(false);
    setCallEnded(false);
    setProgress(0);
    transcriptIndexRef.current = 0;
    callStartTimeRef.current = null;
    setDispositionData(null);
    setDispositionOpen(false);
  };

  const disposeCall = async () => {
    // Stop the call first if it's still active
    if (isCallActive) {
      stopCall();
      // Wait a moment for call to end
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      await fetch('/api/calls/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, tenantId }),
      });
    } catch (err) {
      console.error('[Demo] Failed to send call_end', err);
    }

    try {
      const response = await fetch('/api/calls/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, tenantId }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error || 'Failed to generate summary');
      }

      const suggested: Suggestion[] =
        (payload.dispositions || []).map((item: any) => ({
          code: item.mappedCode || item.code || 'GENERAL_INQUIRY',
          title: item.mappedTitle || item.title || 'General Inquiry',
          score: typeof item.score === 'number' ? item.score : 0.5,
          id: typeof item.mappedId === 'number' ? item.mappedId : undefined,
          subDisposition: item.subDisposition || item.sub_disposition || undefined,
          subDispositionId: typeof item.subDispositionId === 'number' ? item.subDispositionId : undefined,
        }));

      const summary = payload.summary || {};
      const autoNotes = [
        summary.issue,
        summary.resolution,
        summary.next_steps,
      ]
        .filter((section: string | undefined) => section && section.trim().length > 0)
        .join('\n\n');

      const dispositionData = {
        suggested: suggested.length > 0 
          ? suggested 
          : [{ code: 'GENERAL_INQUIRY', title: 'General Inquiry', score: 0.1 }],
        autoNotes: autoNotes || 'No notes generated.',
      };

      setDispositionData(dispositionData);
      
      // Store demo result
      const result: DemoResult = {
        callId,
        tenantId,
        startedAt: callStartTimeRef.current?.toISOString() || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        disposition: dispositionData,
      };
      setDemoResult(result);
      
      // Save to localStorage
      try {
        const savedResults = JSON.parse(localStorage.getItem('demo_results') || '[]');
        savedResults.push(result);
        localStorage.setItem('demo_results', JSON.stringify(savedResults));
      } catch (err) {
        console.error('[Demo] Failed to save to localStorage:', err);
      }
      
      setDispositionOpen(true);
    } catch (err: any) {
      console.error('[Demo] Failed to generate summary', err);
      alert('Failed to generate summary: ' + (err?.message || 'Unknown error'));
    }
  };

  const exportDemoResult = () => {
    if (!demoResult) {
      alert('No demo result to export. Please complete a call first.');
      return;
    }

    const dataStr = JSON.stringify(demoResult, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `demo-result-${callId}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const stopCall = () => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    setIsCallActive(false);
    setCallEnded(true);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Bar - Matching Mock */}
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="text-blue-400 hover:text-blue-300" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h1 className="text-sm font-medium">Agent Assist 22</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-gray-400 hover:text-white" aria-label="Notifications">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-semibold">
              SM
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800"></span>
          </div>
        </div>
      </div>

      {/* Main Content - Three Column Layout */}
      <div className="flex h-[calc(100vh-40px)]">
        {/* Left Navigation Sidebar */}
        <div className="w-12 bg-gray-800 flex flex-col items-center py-4 gap-4">
          <button className="text-white hover:text-blue-400" aria-label="Home">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Next">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Headset">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Add">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center text-xs font-semibold text-gray-900">
            M
          </div>
          <button className="text-white hover:text-blue-400" aria-label="Calendar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Search">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button className="text-white hover:text-blue-400" aria-label="Settings">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Left Column: Call/Transcript Panel */}
        <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
          {/* Call Header */}
          <div className="bg-white border-b border-gray-200 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="font-medium text-sm">Manish</span>
                <span className="text-xs text-gray-500">01:33</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1 hover:bg-gray-100 rounded" aria-label="Previous">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button className="p-1 hover:bg-gray-100 rounded" aria-label="Next">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Call Controls */}
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-gray-100 rounded" aria-label="Microphone">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded" aria-label="Pause">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded" aria-label="Rewind">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
                </svg>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded" aria-label="Fast Forward">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0011 6v2.798l-5.445-3.63z" />
                </svg>
              </button>
              <button 
                className="p-2 hover:bg-gray-100 rounded text-red-600" 
                aria-label="Hang up and dispose call"
                onClick={disposeCall}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Transcript Section */}
          <div className="flex-1 overflow-y-auto bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Transcript</h2>
              <div className="flex items-center gap-2">
                <button className="text-gray-400 hover:text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
                <select className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                  <option>All</option>
                </select>
                <button className="text-gray-400 hover:text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Call Details */}
            <div className="text-xs text-gray-600 space-y-1 mb-4 pb-4 border-b border-gray-200">
              <div>Campaign: Service</div>
              <div>Queue: Card</div>
              <div>Call Type: Inbound</div>
              <div>DID: 080 XXXXXXXX</div>
            </div>
            {/* Transcript Messages */}
            <TranscriptPanel
              callId={callId}
              tenantId={tenantId}
              onOpenDisposition={(data) => {
                setDispositionData(data);
                setDispositionOpen(true);
              }}
            />
          </div>
        </div>

        {/* Center Column: Customer Details */}
        <div className="flex-1 bg-white overflow-y-auto">
          <div className="p-6">
            {/* Customer Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-semibold text-blue-700">
                  M
                </div>
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    Manish Jain
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-gray-100 rounded" aria-label="Phone">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </button>
                <button className="p-2 hover:bg-gray-100 rounded" aria-label="Edit">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-gray-200 mb-4">
              <button className="pb-2 px-1 border-b-2 border-blue-600 text-sm font-medium text-blue-600">
                Customer
              </button>
              <button className="pb-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700">
                LeadSquare
              </button>
            </div>

            {/* Customer Information Card */}
            <div className="bg-white rounded-xl card-shadow p-4 mb-4">
              <h3 className="text-sm font-semibold mb-3">Customer Information</h3>
              <div className="space-y-2 text-sm text-gray-700">
                <div>Phone Number: 9878786565</div>
                <div>Business Number: 9878786565</div>
                <div>Home Number: 9878786565</div>
                <div>Email ID: manish.j@gmail.com</div>
                <div>Instagram: @mj12</div>
                <div>Instagram: @mani12</div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-gray-700">Sentiment Trend</h4>
                  <select className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                    <option>Last 5 months</option>
                  </select>
                </div>
                <div className="h-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">
                  Sentiment graph placeholder
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-green-600 text-sm font-medium">Positive</span>
                </div>
              </div>
            </div>

            {/* Summary Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Summary</h3>
                <button className="px-3 py-1 text-xs border border-gray-200 rounded-md hover:bg-gray-50">
                  Last 5 Interaction
                </button>
              </div>
            </div>

            {/* Past Interactions */}
            <div className="bg-white rounded-xl card-shadow p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Past Interactions (4)</h3>
                <button className="text-gray-400 hover:text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">Intent: Complex Trade Execution Support</span>
                    <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">Neutral</span>
                  </div>
                  <p className="text-gray-600 text-xs mt-1">Manish had reported a fraudulent SMS and a small unauthorized debit card transaction in the past few months, leading to a new debit card issuance.</p>
                </div>
                <div className="border-l-2 border-blue-500 pl-3 py-2">
                  <div className="text-xs text-gray-500 mb-1">Case: 45678 | Delivery | Closed</div>
                  <p className="text-sm text-gray-700">A fraud specialist investigated and reversed the fraudulent transaction, issuing Manish a new debit card.</p>
                  <div className="text-xs text-gray-400 mt-1">06 Nov, 10:10</div>
                </div>
                <div className="border-l-2 border-blue-500 pl-3 py-2">
                  <div className="text-xs text-gray-500 mb-1">Case: 45656 | Fraud Awareness | Open</div>
                </div>
                <div className="border-l-2 border-blue-500 pl-3 py-2">
                  <div className="text-xs text-gray-500 mb-1">Case: 45677 | Security Measures | Closed</div>
                  <p className="text-sm text-gray-700">Priya from MoneyAssure Bank confirmed the SMS was fraudulent and advised Manish on security measures.</p>
                  <div className="text-xs text-gray-400 mt-1">04 Nov, 14:00</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Agent Assist Panel */}
        <div className="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto">
          <div className="p-4">
            <AgentAssistPanel
              callId={callId}
              articles={[]} // Start with empty - articles will appear only when intent is detected via SSE
              onFeedback={(articleId, liked) => {
                console.log('[Demo] Article feedback:', { articleId, liked });
              }}
            />
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      {isCallActive && (
        <div className="fixed top-16 left-0 right-0 z-40 bg-gray-800 text-white px-4 py-2">
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-medium">{Math.round(progress)}%</span>
          </div>
        </div>
      )}

      {/* Control Buttons - Floating */}
      <div className="fixed bottom-4 left-4 flex gap-2 z-50">
        {!isCallActive && !callEnded && (
          <button
            onClick={startCall}
            disabled={demoTranscript.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            ▶ Start Call
          </button>
        )}
        {isCallActive && (
          <>
            {isPaused ? (
              <button
                onClick={resumeCall}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 shadow-lg"
              >
                ▶ Resume
              </button>
            ) : (
              <button
                onClick={pauseCall}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 shadow-lg"
              >
                ⏸ Pause
              </button>
            )}
            <button
              onClick={stopCall}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 shadow-lg"
            >
              ⏹ Stop Call
            </button>
          </>
        )}
        {callEnded && (
          <>
            <button
              onClick={resetCall}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 shadow-lg"
            >
              🔄 Reset
            </button>
            {demoResult && (
              <button
                onClick={exportDemoResult}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 shadow-lg"
              >
                📥 Export JSON
              </button>
            )}
          </>
        )}
      </div>

      {/* Disposition Modal */}
      {dispositionData && (
        <AutoDispositionModal
          open={dispositionOpen}
          onClose={() => setDispositionOpen(false)}
          callId={callId}
          tenantId={tenantId}
          suggested={dispositionData.suggested}
          autoNotes={dispositionData.autoNotes}
        />
      )}

      {/* Toast Container */}
      <ToastContainer />
    </div>
  );
}

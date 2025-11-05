/**
 * POST /api/test/send-transcript
 * 
 * Test endpoint to send sample transcript lines to SSE stream
 * Useful for testing the TranscriptPanel component
 * 
 * Body: { callId: string, lines?: number }
 */

import { NextResponse } from 'next/server';
import { broadcastEvent } from '@/lib/realtime';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const callId = body?.callId || 'demo-call-001';
    const numLines = body?.lines || 5;

    console.info('[test][send-transcript] Sending test transcript lines', {
      callId,
      numLines,
    });

    const sampleLines = [
      { text: "Good morning! Thank you for calling. How may I help you today?", speaker: "Agent" },
      { text: "Hi, I'm calling about my account statement. I have some questions.", speaker: "Customer" },
      { text: "I'd be happy to help with that. Can you please provide your account number?", speaker: "Agent" },
      { text: "Sure, it's 1234567890.", speaker: "Customer" },
      { text: "Thank you. Let me pull up your account information. One moment please.", speaker: "Agent" },
      { text: "I can see your recent statement. What specific questions do you have?", speaker: "Agent" },
      { text: "I noticed a charge on November 5th that I don't recognize.", speaker: "Customer" },
      { text: "I understand your concern. Let me review that transaction for you.", speaker: "Agent" },
    ];

    // Send transcript lines with delays
    for (let i = 0; i < Math.min(numLines, sampleLines.length); i++) {
      const line = sampleLines[i];
      const seq = i + 1;
      const ts = new Date(Date.now() - (numLines - i) * 2000).toISOString();

      setTimeout(() => {
        broadcastEvent({
          type: 'transcript_line',
          callId,
          seq,
          ts,
          text: `${line.speaker}: ${line.text}`,
        });
        console.info('[test][send-transcript] Sent line', { seq, callId });
      }, i * 500); // 500ms delay between lines
    }

    // Send call_end event after all lines
    setTimeout(() => {
      broadcastEvent({
        type: 'call_end',
        callId,
      });
      console.info('[test][send-transcript] Sent call_end', { callId });
    }, numLines * 500 + 1000);

    return NextResponse.json({
      ok: true,
      message: `Sending ${numLines} test transcript lines to callId: ${callId}`,
      callId,
    });
  } catch (err: any) {
    console.error('[test][send-transcript] Error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Failed to send test transcript',
      },
      { status: 500 }
    );
  }
}


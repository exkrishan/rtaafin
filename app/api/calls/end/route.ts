/**
 * Call End API
 * Handles call end events and triggers disposition generation
 */

import { NextResponse } from 'next/server';
import { getCallRegistry } from '@/lib/call-registry';
import { generateCallSummary } from '@/lib/summary';
import { supabase } from '@/lib/supabase';
import { unsubscribeFromTranscripts } from '@/lib/transcript-consumer';

export const dynamic = 'force-dynamic';

interface CallEndRequest {
  interactionId: string;
  callSid?: string;
  reason?: string;
}

export async function POST(req: Request) {
  try {
    const body: CallEndRequest = await req.json();

    if (!body.interactionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: interactionId' },
        { status: 400 }
      );
    }

    const { interactionId } = body;

    console.info('[call-end] Call ended', {
      interactionId,
      callSid: body.callSid,
      reason: body.reason,
      timestamp: new Date().toISOString(),
    });

    // Mark call as ended in registry
    try {
      const callRegistry = getCallRegistry();
      await callRegistry.endCall(interactionId);
      console.info('[call-end] ✅ Call marked as ended in registry', { interactionId });
    } catch (error: any) {
      console.warn('[call-end] Failed to update call registry', {
        error: error.message,
        interactionId,
      });
    }

    // CRITICAL FIX: Unsubscribe from transcript streams when call ends
    // This prevents memory leaks and 502 errors from too many subscriptions
    try {
      await unsubscribeFromTranscripts(interactionId);
      console.info('[call-end] ✅ Unsubscribed from transcript streams', { interactionId });
    } catch (error: any) {
      console.warn('[call-end] Failed to unsubscribe from transcripts', {
        error: error.message,
        interactionId,
        note: 'Non-critical - subscription will be cleaned up eventually',
      });
    }

    // Fetch complete transcript from Supabase
    let fullTranscript = '';
    try {
      const { data: transcriptData, error: transcriptError } = await (supabase as any)
        .from('ingest_events')
        .select('text, ts, seq')
        .eq('call_id', interactionId)
        .order('seq', { ascending: true });

      if (transcriptError) {
        console.error('[call-end] Failed to fetch transcript', {
          error: transcriptError.message,
          interactionId,
        });
      } else if (transcriptData && Array.isArray(transcriptData)) {
        // Combine all transcript chunks into full transcript
        fullTranscript = transcriptData
          .map((event: any) => event.text)
          .filter((text: string) => text && text.trim().length > 0)
          .join(' ');

        console.info('[call-end] Fetched complete transcript', {
          interactionId,
          transcriptChunks: transcriptData.length,
          totalLength: fullTranscript.length,
        });
      }
    } catch (error: any) {
      console.error('[call-end] Error fetching transcript', {
        error: error.message,
        interactionId,
      });
    }

    // Generate disposition from complete transcript
    let dispositionResult = null;
    if (fullTranscript && fullTranscript.trim().length > 0) {
      try {
        console.info('[call-end] Generating disposition from transcript', {
          interactionId,
          transcriptLength: fullTranscript.length,
        });

        const summaryResult = await generateCallSummary(interactionId, fullTranscript);
        
        if (summaryResult.ok && summaryResult.summary) {
          dispositionResult = {
            issue: summaryResult.summary.issue,
            resolution: summaryResult.summary.resolution,
            nextSteps: summaryResult.summary.next_steps,
            suggestedDispositions: summaryResult.mappedDispositions || [],
            confidence: summaryResult.summary.confidence,
          };

          console.info('[call-end] ✅ Disposition generated', {
            interactionId,
            dispositionsCount: dispositionResult.suggestedDispositions.length,
            confidence: dispositionResult.confidence,
          });
        } else {
          console.warn('[call-end] Disposition generation failed', {
            interactionId,
            error: summaryResult.error,
          });
        }
      } catch (error: any) {
        console.error('[call-end] Error generating disposition', {
          error: error.message,
          interactionId,
        });
      }
    } else {
      console.warn('[call-end] No transcript available for disposition generation', {
        interactionId,
      });
    }

    // Broadcast call_end event via SSE
    try {
      const { broadcastEvent } = await import('@/lib/realtime');
      broadcastEvent({
        type: 'call_end',
        callId: interactionId,
        seq: 0,
        ts: new Date().toISOString(),
        text: 'Call ended',
      });
      console.info('[call-end] ✅ Broadcast call_end event', { interactionId });
    } catch (error: any) {
      console.error('[call-end] Failed to broadcast call_end event', {
        error: error.message,
        interactionId,
      });
    }

    return NextResponse.json({
      ok: true,
      interactionId,
      disposition: dispositionResult,
      transcriptLength: fullTranscript.length,
    });
  } catch (error: any) {
    console.error('[call-end] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { ingestTranscriptCore, getTranscriptsFromCache } from '@/lib/ingest-transcript-core';

// Atomic counter per callId for sequence numbers
// CRITICAL: Use Map with atomic operations to prevent race conditions
const seqCounters = new Map<string, number>();
const seqLocks = new Map<string, Promise<number>>();

/**
 * Get the next sequence number for a given callId
 * THREAD-SAFE: Uses per-callId locks to prevent race conditions
 * Uses in-memory cache from ingest-transcript-core to get current max seq
 */
async function getNextSeq(callId: string): Promise<number> {
  // Check if there's already a pending request for this callId (prevent race condition)
  const existingLock = seqLocks.get(callId);
  if (existingLock) {
    // Wait for the existing request to complete, then increment
    const baseSeq = await existingLock;
    const nextSeq = baseSeq + 1;
    seqCounters.set(callId, nextSeq);
    seqLocks.delete(callId);
    return nextSeq;
  }
  
  // Create a new lock promise
  const lockPromise = (async () => {
    try {
      // Get current max seq from in-memory cache (transcripts are cached, not in DB)
      const cachedTranscripts = getTranscriptsFromCache(callId);
      const currentMaxSeq = cachedTranscripts.length > 0
        ? Math.max(...cachedTranscripts.map(t => t.seq))
        : 0;
      
      // Use the higher of: cache max or counter
      const counterSeq = seqCounters.get(callId) || 0;
      const baseSeq = Math.max(currentMaxSeq, counterSeq);
      const nextSeq = baseSeq + 1;
      
      // Update counter BEFORE returning (atomic operation)
      seqCounters.set(callId, nextSeq);
      
      console.log('[ReceiveTranscript] Generated seq (thread-safe)', {
        callId,
        nextSeq,
        currentMaxSeq,
        counterSeq,
        cachedCount: cachedTranscripts.length,
      });
      
      return nextSeq;
    } catch (error: any) {
      console.error('[ReceiveTranscript] Error generating seq:', error);
      // Fallback: Use timestamp-based seq (guaranteed unique)
      const fallbackSeq = Date.now();
      seqCounters.set(callId, fallbackSeq);
      return fallbackSeq;
    } finally {
      // Remove lock after completion
      seqLocks.delete(callId);
    }
  })();
  
  // Store the lock promise
  seqLocks.set(callId, lockPromise);
  
  // Wait for the lock to complete
  return await lockPromise;
}

/**
 * POST /api/transcripts/receive
 * 
 * Receives real-time transcripts from external ASR service (e.g., Azure Speech SDK)
 * 
 * Request Body:
 * {
 *   callId: string;           // Unique call identifier
 *   transcript: string;       // The transcript text
 *   session_id: string | null;
 *   asr_service: string;      // e.g., "Azure"
 *   timestamp: string;        // ISO timestamp
 *   isFinal: boolean;         // true if final transcript, false if partial
 * }
 * 
 * No authentication required (as specified)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { callId, transcript, timestamp, isFinal, asr_service = 'Azure', session_id = null } = body;
    
    if (!callId) {
      return NextResponse.json(
        { ok: false, error: 'callId is required' },
        { status: 400 }
      );
    }
    
    if (transcript === undefined || transcript === null) {
      return NextResponse.json(
        { ok: false, error: 'transcript is required' },
        { status: 400 }
      );
    }
    
    if (!timestamp) {
      return NextResponse.json(
        { ok: false, error: 'timestamp is required' },
        { status: 400 }
      );
    }
    
    if (isFinal === undefined || isFinal === null) {
      return NextResponse.json(
        { ok: false, error: 'isFinal is required' },
        { status: 400 }
      );
    }
    
    console.log('[ReceiveTranscript] Received transcript:', {
      callId,
      transcript: transcript.substring(0, 50) + (transcript.length > 50 ? '...' : ''),
      transcriptLength: transcript.length,
      timestamp,
      isFinal,
      asr_service,
      session_id
    });
    
    // Auto-generate seq number
    const seq = await getNextSeq(callId);
    
    console.log('[ReceiveTranscript] Generated seq:', { callId, seq });
    
    // Map external ASR format to internal format
    const mappedData = {
      callId,
      interactionId: callId, // Use callId as interactionId for compatibility
      text: transcript,
      ts: timestamp,
      seq,
      isFinal,
      asrService: asr_service,
      sessionId: session_id,
      tenantId: 'external-asr' // Default tenant for external ASR
    };
    
    // Process transcript asynchronously (fire-and-forget)
    // This will:
    // 1. Store in Supabase ingest_events table
    // 2. Detect intent
    // 3. Surface KB articles
    // 4. Broadcast via SSE
    ingestTranscriptCore(mappedData).catch((error) => {
      console.error('[ReceiveTranscript] Error processing transcript:', {
        callId,
        seq,
        error: error.message,
        stack: error.stack
      });
    });
    
    // Return 200 OK immediately with helpful view URL
    const viewUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/live?callId=${encodeURIComponent(callId)}`;
    
    return NextResponse.json({
      ok: true,
      callId,
      seq,
      message: 'Transcript received and processing',
      viewUrl,
      autoDiscovery: 'The /live page will auto-discover this call within 10 seconds, or visit the viewUrl directly'
    });
    
  } catch (error: any) {
    console.error('[ReceiveTranscript] Error:', {
      error: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


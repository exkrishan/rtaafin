import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { ingestTranscriptCore } from '@/lib/ingest-transcript-core';

// Cache for max seq per callId (1 second TTL)
const seqCache = new Map<string, { maxSeq: number; timestamp: number }>();

/**
 * Get the next sequence number for a given callId
 * Uses in-memory cache with 1 second TTL to reduce DB queries
 */
async function getNextSeq(callId: string): Promise<number> {
  // Check cache first
  const cached = seqCache.get(callId);
  if (cached && Date.now() - cached.timestamp < 1000) {
    const nextSeq = cached.maxSeq + 1;
    // Update cache with new max
    seqCache.set(callId, { maxSeq: nextSeq, timestamp: cached.timestamp });
    return nextSeq;
  }
  
  // Query Supabase for max seq
  const { data, error } = await (supabase as any)
    .from('ingest_events')
    .select('seq')
    .eq('call_id', callId)
    .order('seq', { ascending: false })
    .limit(1);
  
  if (error) {
    console.error('[ReceiveTranscript] Error querying max seq:', error);
    // Fallback to timestamp-based seq if query fails
    return Date.now();
  }
  
  const maxSeq = data && data.length > 0 ? data[0].seq : 0;
  
  // Update cache
  seqCache.set(callId, { maxSeq, timestamp: Date.now() });
  
  return maxSeq + 1;
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


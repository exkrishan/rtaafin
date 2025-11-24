// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { getTranscriptConsumerStatus, startTranscriptConsumer } from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const status = getTranscriptConsumerStatus();
    
    // Auto-start consumer if not running (only in production/server)
    if (!status.isRunning && typeof window === 'undefined') {
      console.info('[health] Transcript consumer not running, attempting to start...');
      try {
        await startTranscriptConsumer();
        console.info('[health] ✅ Transcript consumer started via health check');
        // Get updated status
        const updatedStatus = getTranscriptConsumerStatus();
        return NextResponse.json({
          status: 'healthy',
          service: process.env.SERVICE_NAME || process.env.RENDER_SERVICE_NAME || 'frontend',
          transcriptConsumer: updatedStatus,
          autoStarted: true,
        });
      } catch (error: any) {
        console.error('[health] Failed to auto-start transcript consumer:', error.message);
        return NextResponse.json({
          status: 'degraded',
          service: process.env.SERVICE_NAME || process.env.RENDER_SERVICE_NAME || 'frontend',
          transcriptConsumer: status,
          autoStartError: error.message,
        });
      }
    }
    
    return NextResponse.json({
      status: status.isRunning ? 'healthy' : 'degraded',
      service: process.env.SERVICE_NAME || process.env.RENDER_SERVICE_NAME || 'frontend',
      transcriptConsumer: status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', error: error.message || String(error) },
      { status: 500 }
    );
  }
}


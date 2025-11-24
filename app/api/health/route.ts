// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { 
  getTranscriptConsumerStatus, 
  startTranscriptConsumer,
  triggerStreamDiscovery,
  getTranscriptConsumer 
} from '@/lib/transcript-consumer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const status = getTranscriptConsumerStatus();
    
    // CRITICAL FIX: Always ensure consumer is running (even if it says it is)
    // This handles cases where the service woke from sleep and consumer state is stale
    if (typeof window === 'undefined') {
      // Always try to start consumer (it will skip if already running)
      if (!status.isRunning) {
        console.info('[health] Transcript consumer not running, attempting to start...');
        try {
          await startTranscriptConsumer();
          console.info('[health] ✅ Transcript consumer started via health check');
        } catch (error: any) {
          console.error('[health] Failed to auto-start transcript consumer:', error.message);
        }
      }
      
      // CRITICAL: Always trigger stream discovery on health check
      // This ensures we discover new transcript streams even after service wake-up
      try {
        await triggerStreamDiscovery();
        console.info('[health] ✅ Stream discovery triggered');
      } catch (error: any) {
        console.warn('[health] Stream discovery failed (non-critical):', error.message);
      }
    }
    
    // Get updated status after potential restart
    const updatedStatus = getTranscriptConsumerStatus();
    
    // P2 FIX: Get comprehensive health status including connection validation
    let healthStatus: any = null;
    try {
      const consumer = getTranscriptConsumer();
      if (consumer && typeof (consumer as any).getHealthStatus === 'function') {
        healthStatus = await (consumer as any).getHealthStatus();
      }
    } catch (error: any) {
      console.warn('[health] Failed to get comprehensive health status:', error.message);
    }
    
    // Determine overall health status
    let overallStatus = 'healthy';
    if (!updatedStatus.isRunning) {
      overallStatus = 'degraded';
    } else if (healthStatus) {
      if (!healthStatus.redis.accessible || !healthStatus.api.accessible) {
        overallStatus = 'degraded';
      }
      if (healthStatus.deadLetterQueue.size > 100) {
        overallStatus = 'degraded'; // Too many failed transcripts
      }
    }
    
    return NextResponse.json({
      status: overallStatus,
      service: process.env.SERVICE_NAME || process.env.RENDER_SERVICE_NAME || 'frontend',
      transcriptConsumer: updatedStatus,
      // P2 FIX: Include comprehensive health status
      health: healthStatus ? {
        redis: healthStatus.redis,
        api: healthStatus.api,
        deadLetterQueue: healthStatus.deadLetterQueue,
        baseUrl: healthStatus.baseUrl,
        apiUrl: healthStatus.apiUrl,
      } : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', error: error.message || String(error) },
      { status: 500 }
    );
  }
}


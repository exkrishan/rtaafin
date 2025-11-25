// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { 
  getTranscriptConsumerStatus, 
  startTranscriptConsumer,
  triggerStreamDiscovery,
  getTranscriptConsumer 
} from '@/lib/transcript-consumer';
import { getCallRegistry } from '@/lib/call-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const status = getTranscriptConsumerStatus();
    
    // CRITICAL FIX: Health check must return quickly (< 2 seconds) to avoid timeout
    // Run heavy operations in background (non-blocking)
    if (typeof window === 'undefined') {
      // Start consumer if not running (non-blocking with timeout)
      if (!status.isRunning) {
        console.info('[health] Transcript consumer not running, attempting to start...');
        // Fire and forget - don't wait for it
        startTranscriptConsumer().catch((error: any) => {
          console.error('[health] Failed to auto-start transcript consumer:', error.message);
        });
      }
      
      // CRITICAL: Trigger stream discovery in background (non-blocking)
      // This ensures we discover new transcript streams even after service wake-up
      // But don't block the health check response
      triggerStreamDiscovery().catch((error: any) => {
        console.warn('[health] Stream discovery failed (non-critical):', error.message);
      });
    }
    
    // Get basic status immediately (fast, synchronous)
    const updatedStatus = getTranscriptConsumerStatus();
    
    // P2 FIX: Get comprehensive health status with timeout (max 1 second)
    // This prevents health check from hanging on slow connections
    let healthStatus: any = null;
    try {
      const consumer = getTranscriptConsumer();
      if (consumer && typeof (consumer as any).getHealthStatus === 'function') {
        // Use Promise.race to timeout after 1 second
        const healthPromise = (consumer as any).getHealthStatus();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 1000)
        );
        
        healthStatus = await Promise.race([healthPromise, timeoutPromise]);
      }
    } catch (error: any) {
      // Timeout or error - non-critical, just log and continue
      if (error.message !== 'Health check timeout') {
        console.warn('[health] Failed to get comprehensive health status:', error.message);
      }
    }
    
    // P2 FIX: Check call registry health (with timeout)
    let callRegistryHealth: any = null;
    try {
      const callRegistry = getCallRegistry();
      if (callRegistry && typeof (callRegistry as any).checkHealth === 'function') {
        const registryHealthPromise = (callRegistry as any).checkHealth();
        const registryTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Call registry health check timeout')), 1000)
        );
        callRegistryHealth = await Promise.race([registryHealthPromise, registryTimeoutPromise]);
      }
    } catch (error: any) {
      if (error.message !== 'Call registry health check timeout') {
        console.warn('[health] Failed to get call registry health:', error.message);
      }
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
    
    // Check call registry health
    if (callRegistryHealth && !callRegistryHealth.accessible) {
      overallStatus = 'degraded';
    }
    
    return NextResponse.json({
      status: overallStatus,
      service: process.env.SERVICE_NAME || process.env.RENDER_SERVICE_NAME || 'frontend',
      transcriptConsumer: updatedStatus,
      // P2 FIX: Include comprehensive health status (if available)
      health: healthStatus ? {
        redis: healthStatus.redis,
        api: healthStatus.api,
        deadLetterQueue: healthStatus.deadLetterQueue,
        baseUrl: healthStatus.baseUrl,
        apiUrl: healthStatus.apiUrl,
      } : null,
      // P2 FIX: Include call registry health status
      callRegistry: callRegistryHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', error: error.message || String(error) },
      { status: 500 }
    );
  }
}


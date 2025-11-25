/**
 * Get Active Calls API
 * Returns list of active calls from call registry
 */

import { NextResponse } from 'next/server';
import { getCallRegistry, type CallMetadata } from '@/lib/call-registry';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestStartTime = Date.now();
  
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    console.info('[active-calls] Fetching active calls', { limit });

    const callRegistry = getCallRegistry();
    
    // IMPROVEMENT: Reduced timeout to 3 seconds (cache will handle most requests faster)
    // With caching, most requests should be < 100ms, so 3s timeout is generous
    const activeCallsPromise = callRegistry.getActiveCalls(limit);
    const timeoutPromise = new Promise<typeof activeCallsPromise>((_, reject) => 
      setTimeout(() => reject(new Error('getActiveCalls timeout after 3 seconds')), 3000)
    );
    
    let activeCalls;
    try {
      activeCalls = await Promise.race([activeCallsPromise, timeoutPromise]);
      
      // IMPROVEMENT: Even on timeout, getActiveCalls may return fallback data
      // Check if we got any data (could be from cache or fallback)
      if (activeCalls && activeCalls.length > 0) {
        const requestDuration = Date.now() - requestStartTime;
        console.info('[active-calls] ✅ Fetched active calls', {
          count: activeCalls.length,
          latestCall: activeCalls[0]?.interactionId,
          duration: `${requestDuration}ms`,
          source: requestDuration < 100 ? 'cache' : 'redis',
        });
      }
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        // IMPROVEMENT: Try to get fallback data even on timeout
        // The getActiveCalls method may have returned fallback data before timing out
        try {
          // Give it one more quick try (might return cached/fallback data)
          const fallbackCalls = await Promise.race([
            callRegistry.getActiveCalls(limit),
            new Promise<CallMetadata[]>((resolve) => 
              setTimeout(() => resolve([]), 500) // Quick 500ms timeout for fallback
            ),
          ]);
          
          if (fallbackCalls && fallbackCalls.length > 0) {
            console.info('[active-calls] ✅ Got fallback data after timeout', {
              count: fallbackCalls.length,
              duration: Date.now() - requestStartTime,
            });
            activeCalls = fallbackCalls;
          } else {
            throw error; // No fallback available, throw original error
          }
        } catch {
          // FIX: Use warn instead of error to reduce log noise (timeouts are expected with slow Redis)
          console.warn('[active-calls] ⚠️ getActiveCalls() timed out after 3 seconds', {
            limit,
            duration: Date.now() - requestStartTime,
            timestamp: new Date().toISOString(),
          });
          // Fix 2.1: Return graceful error response (200 with error flag) instead of 503
          return NextResponse.json({
            ok: false,
            error: 'Request timeout - Redis operation took too long',
            calls: [],
            count: 0,
            timeout: true,
          }, { status: 200 }); // Return 200 so frontend can parse JSON
        }
      } else {
        throw error; // Re-throw if it's not a timeout
      }
    }

    // Get latest call (most recent activity)
    const latestCall = activeCalls.length > 0 ? activeCalls[0].interactionId : null;

    const requestDuration = Date.now() - requestStartTime;
    
    return NextResponse.json({
      ok: true,
      calls: activeCalls.map(call => ({
        interactionId: call.interactionId,
        callSid: call.callSid,
        from: call.from,
        to: call.to,
        tenantId: call.tenantId,
        startTime: call.startTime,
        lastActivity: call.lastActivity,
        status: call.status, // Include status for frontend filtering
      })),
      latestCall,
      count: activeCalls.length,
      cached: requestDuration < 100, // Indicate if response was from cache
      duration: requestDuration,
    });
  } catch (error: any) {
    const requestDuration = Date.now() - requestStartTime;
    console.error('[active-calls] Error:', {
      error: error.message || String(error),
      duration: `${requestDuration}ms`,
      timestamp: new Date().toISOString(),
    });
    
    // Fix 2.1: Return graceful error response (200 with error flag) instead of 500/503
    // This prevents JSON parsing errors in frontend
    return NextResponse.json({
      ok: false,
      error: error.message || 'Internal server error',
      calls: [],
      count: 0,
    }, { status: 200 }); // Return 200 so frontend can parse JSON
  }
}

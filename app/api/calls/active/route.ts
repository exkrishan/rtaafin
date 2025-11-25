/**
 * Get Active Calls API
 * Returns list of active calls from call registry
 */

import { NextResponse } from 'next/server';
import { getCallRegistry } from '@/lib/call-registry';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Fix 2.1: Add timeout protection (5 seconds max for entire request)
  const requestStartTime = Date.now();
  
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    console.info('[active-calls] Fetching active calls', { limit });

    const callRegistry = getCallRegistry();
    
    // Fix 2.1: Wrap getActiveCalls() in Promise.race with 4-second timeout
    const activeCallsPromise = callRegistry.getActiveCalls(limit);
    const timeoutPromise = new Promise<typeof activeCallsPromise>((_, reject) => 
      setTimeout(() => reject(new Error('getActiveCalls timeout after 4 seconds')), 4000)
    );
    
    let activeCalls;
    try {
      activeCalls = await Promise.race([activeCallsPromise, timeoutPromise]);
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        console.error('[active-calls] ⚠️ getActiveCalls() timed out after 4 seconds', {
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
      throw error; // Re-throw if it's not a timeout
    }

    // Get latest call (most recent activity)
    const latestCall = activeCalls.length > 0 ? activeCalls[0].interactionId : null;

    const requestDuration = Date.now() - requestStartTime;
    console.info('[active-calls] ✅ Fetched active calls', {
      count: activeCalls.length,
      latestCall,
      duration: `${requestDuration}ms`,
    });
    
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
      })),
      latestCall,
      count: activeCalls.length,
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

/**
 * Get Active Calls API
 * Returns list of active calls from call registry
 */

import { NextResponse } from 'next/server';
import { getCallRegistry } from '@/lib/call-registry';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    console.info('[active-calls] Fetching active calls', { limit });

    const callRegistry = getCallRegistry();
    const activeCalls = await callRegistry.getActiveCalls(limit);

    // Get latest call (most recent activity)
    const latestCall = activeCalls.length > 0 ? activeCalls[0].interactionId : null;

    console.info('[active-calls] ✅ Fetched active calls', {
      count: activeCalls.length,
      latestCall,
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
    console.error('[active-calls] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

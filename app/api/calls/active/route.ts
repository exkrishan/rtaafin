/**
 * GET /api/calls/active
 * 
 * Get list of active calls (from transcript streams in Redis)
 * Returns the most recent calls with their interaction IDs
 */

import { NextResponse } from 'next/server';
import { createPubSubAdapterFromEnv } from '@rtaa/pubsub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    
    // Get transcript consumer status which includes active subscriptions
    const { getTranscriptConsumerStatus } = await import('@/lib/transcript-consumer');
    const consumerStatus = getTranscriptConsumerStatus();
    
    // Also discover active streams from Redis directly
    let activeCalls: Array<{ interactionId: string; lastActivity?: string }> = [];
    
    try {
      const pubsub = createPubSubAdapterFromEnv();
      const redisAdapter = pubsub as any;
      
      if (redisAdapter.redis) {
        const redis = redisAdapter.redis;
        const discoveredStreams = new Set<string>();
        
        // Scan for transcript.* streams
        let cursor = '0';
        do {
          const result = await redis.scan(cursor, 'MATCH', 'transcript.*', 'COUNT', '100');
          const [nextCursor, keys] = Array.isArray(result) && result.length === 2
            ? result
            : [result[0], result[1] || []];
          cursor = nextCursor;
          
          if (Array.isArray(keys)) {
            for (const key of keys) {
              if (typeof key === 'string') {
                discoveredStreams.add(key);
              }
            }
          }
        } while (cursor !== '0');
        
        // Extract interaction IDs from stream names
        for (const streamKey of discoveredStreams) {
          const match = streamKey.match(/^transcript\.(.+)$/);
          if (match && match[1]) {
            const interactionId = match[1];
            
            // Get last message timestamp from stream
            try {
              const streamInfo = await redis.xinfo('STREAM', streamKey);
              const length = streamInfo[1] || 0; // Stream length
              
              if (length > 0) {
                // Get last message ID to determine recency
                const lastMessages = await redis.xrevrange(streamKey, '+', '-', 'COUNT', 1);
                if (lastMessages && lastMessages.length > 0) {
                  const lastMessageId = lastMessages[0][0];
                  // Message ID format: timestamp-sequence
                  const timestamp = lastMessageId.split('-')[0];
                  activeCalls.push({
                    interactionId,
                    lastActivity: timestamp,
                  });
                } else {
                  activeCalls.push({ interactionId });
                }
              }
            } catch (err) {
              // Stream might not exist or be empty, just add the ID
              activeCalls.push({ interactionId });
            }
          }
        }
        
        // Sort by last activity (most recent first)
        activeCalls.sort((a, b) => {
          if (!a.lastActivity) return 1;
          if (!b.lastActivity) return -1;
          return parseInt(b.lastActivity) - parseInt(a.lastActivity);
        });
        
        // Limit results
        activeCalls = activeCalls.slice(0, limit);
      }
    } catch (redisError: any) {
      console.warn('[api/calls/active] Redis discovery failed, using consumer status only:', redisError.message);
      // Fallback to consumer status subscriptions
      if (consumerStatus.subscriptions && Array.isArray(consumerStatus.subscriptions)) {
        activeCalls = consumerStatus.subscriptions.map((sub: any) => ({
          interactionId: sub.interactionId || sub.id || '',
        }));
      }
    }
    
    // Get the most recent call (first in sorted list)
    const latestCall = activeCalls.length > 0 ? activeCalls[0].interactionId : null;
    
    return NextResponse.json({
      ok: true,
      calls: activeCalls,
      latestCall,
      count: activeCalls.length,
      consumerStatus: {
        isRunning: consumerStatus.isRunning,
        subscriptionCount: consumerStatus.subscriptionCount,
      },
    });
  } catch (error: any) {
    console.error('[api/calls/active] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}


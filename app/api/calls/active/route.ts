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
            
            // Get last message timestamp from stream and check for non-empty transcripts
            try {
              const streamInfo = await redis.xinfo('STREAM', streamKey);
              const length = streamInfo[1] || 0; // Stream length
              
              if (length > 0) {
                // Get last few messages to check for non-empty transcripts
                const lastMessages = await redis.xrevrange(streamKey, '+', '-', 'COUNT', 10);
                if (lastMessages && lastMessages.length > 0) {
                  // Check if any of the recent messages have non-empty text
                  let hasNonEmptyTranscript = false;
                  let lastNonEmptyTimestamp: string | undefined;
                  
                  for (const [messageId, fields] of lastMessages) {
                    // Find text field in the message
                    const textIndex = fields.findIndex((f: any) => f === 'text' || (Array.isArray(f) && f[0] === 'text'));
                    if (textIndex >= 0 && textIndex < fields.length - 1) {
                      const textValue = fields[textIndex + 1];
                      if (textValue && typeof textValue === 'string' && textValue.trim().length > 0) {
                        hasNonEmptyTranscript = true;
                        if (!lastNonEmptyTimestamp) {
                          // Message ID format: timestamp-sequence
                          lastNonEmptyTimestamp = messageId.split('-')[0];
                        }
                        break; // Found non-empty transcript, no need to check more
                      }
                    }
                  }
                  
                  // Only include calls that have non-empty transcripts
                  if (hasNonEmptyTranscript && lastNonEmptyTimestamp) {
                    activeCalls.push({
                      interactionId,
                      lastActivity: lastNonEmptyTimestamp,
                    });
                  }
                }
              }
            } catch (err) {
              // Stream might not exist or be empty, skip it
              console.debug('[api/calls/active] Skipping stream (error or empty)', { streamKey, error: err });
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


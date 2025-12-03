#!/usr/bin/env tsx
/**
 * Redis Streams Monitoring Script
 * 
 * Monitors Redis streams for audio frames and transcripts in real-time.
 * 
 * Usage:
 *   npx tsx scripts/monitor-redis-streams.ts [options]
 * 
 * Environment Variables:
 *   REDIS_URL - Redis URL (required)
 *   INTERACTION_ID - Specific interaction ID to monitor (optional)
 *   DURATION_SEC - Duration to monitor (default: 60)
 * 
 * Options:
 *   --help - Show this help message
 *   --interaction-id <id> - Monitor specific interaction ID
 *   --duration <seconds> - Duration to monitor
 *   --audio-only - Monitor only audio_stream
 *   --transcript-only - Monitor only transcript topics
 */

import { createPubSubAdapterFromEnv } from '../lib/pubsub';
import { audioTopic, transcriptTopic, parseTopic } from '../lib/pubsub/topics';

interface StreamStats {
  topic: string;
  messageCount: number;
  firstMessageTime?: Date;
  lastMessageTime?: Date;
  messages: any[];
}

const REDIS_URL = process.env.REDIS_URL;
const INTERACTION_ID = process.env.INTERACTION_ID;
const DURATION_SEC = parseInt(process.env.DURATION_SEC || '60', 10);

let audioStats: StreamStats = {
  topic: 'audio_stream',
  messageCount: 0,
  messages: [],
};

const transcriptStats = new Map<string, StreamStats>();

function formatMessage(msg: any): string {
  const interactionId = msg.interaction_id || 'unknown';
  const seq = msg.seq || 'unknown';
  const timestamp = msg.timestamp_ms ? new Date(msg.timestamp_ms).toISOString() : 'unknown';
  
  if (msg.audio) {
    return `[${timestamp}] interaction=${interactionId}, seq=${seq}, audio=${msg.audio.length} bytes`;
  } else if (msg.text) {
    const textPreview = msg.text.substring(0, 50);
    return `[${timestamp}] interaction=${interactionId}, type=${msg.type}, text="${textPreview}${msg.text.length > 50 ? '...' : ''}"`;
  }
  
  return JSON.stringify(msg);
}

async function monitorAudioStream(pubsub: any, durationMs: number): Promise<void> {
  const audioTopicName = audioTopic({ useStreams: true });
  console.log(`📡 Monitoring audio stream: ${audioTopicName}`);
  
  const subscriptionHandle = await pubsub.subscribe(audioTopicName, async (msg: any) => {
    audioStats.messageCount++;
    const now = new Date();
    if (!audioStats.firstMessageTime) {
      audioStats.firstMessageTime = now;
    }
    audioStats.lastMessageTime = now;
    
    // Keep last 10 messages for display
    audioStats.messages.push(msg);
    if (audioStats.messages.length > 10) {
      audioStats.messages.shift();
    }
    
    console.log(`📨 [AUDIO] ${formatMessage(msg)}`);
  });
  
  console.log(`✅ Subscribed to ${audioTopicName}`);
  console.log(`   Monitoring for ${durationMs / 1000} seconds...`);
  console.log('');
  
  // Wait for duration
  await new Promise(resolve => setTimeout(resolve, durationMs));
  
  // Unsubscribe
  await subscriptionHandle.unsubscribe();
  
  console.log('');
  console.log('📊 Audio Stream Statistics:');
  console.log(`   Messages received: ${audioStats.messageCount}`);
  if (audioStats.firstMessageTime) {
    console.log(`   First message: ${audioStats.firstMessageTime.toISOString()}`);
  }
  if (audioStats.lastMessageTime) {
    console.log(`   Last message: ${audioStats.lastMessageTime.toISOString()}`);
  }
  if (audioStats.messageCount > 0 && audioStats.firstMessageTime && audioStats.lastMessageTime) {
    const duration = audioStats.lastMessageTime.getTime() - audioStats.firstMessageTime.getTime();
    const rate = (audioStats.messageCount / (duration / 1000)).toFixed(2);
    console.log(`   Average rate: ${rate} messages/second`);
  }
}

async function monitorTranscriptStreams(pubsub: any, durationMs: number, interactionId?: string): Promise<void> {
  if (interactionId) {
    // Monitor specific interaction
    const topic = transcriptTopic(interactionId);
    console.log(`📡 Monitoring transcript stream: ${topic}`);
    
    const stats: StreamStats = {
      topic,
      messageCount: 0,
      messages: [],
    };
    transcriptStats.set(interactionId, stats);
    
    const subscriptionHandle = await pubsub.subscribe(topic, async (msg: any) => {
      stats.messageCount++;
      const now = new Date();
      if (!stats.firstMessageTime) {
        stats.firstMessageTime = now;
      }
      stats.lastMessageTime = now;
      
      // Keep last 10 messages
      stats.messages.push(msg);
      if (stats.messages.length > 10) {
        stats.messages.shift();
      }
      
      console.log(`📝 [TRANSCRIPT] ${formatMessage(msg)}`);
    });
    
    console.log(`✅ Subscribed to ${topic}`);
    
    // Wait for duration
    await new Promise(resolve => setTimeout(resolve, durationMs));
    
    // Unsubscribe
    await subscriptionHandle.unsubscribe();
  } else {
    // Monitor all transcript.* streams using SCAN
    console.log(`📡 Monitoring all transcript streams (using SCAN)`);
    console.log(`   Note: This will discover existing streams and monitor for new ones`);
    console.log('');
    
    const redisAdapter = pubsub as any;
    if (redisAdapter.redis) {
      const redis = redisAdapter.redis;
      const discoveredStreams = new Set<string>();
      
      // Discover existing streams
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
      
      console.log(`   Discovered ${discoveredStreams.size} transcript stream(s)`);
      
      // Subscribe to all discovered streams
      const subscriptions: any[] = [];
      for (const topic of discoveredStreams) {
        const parsed = parseTopic(topic);
        if (parsed.interactionId) {
          const stats: StreamStats = {
            topic,
            messageCount: 0,
            messages: [],
          };
          transcriptStats.set(parsed.interactionId, stats);
          
          const subscriptionHandle = await pubsub.subscribe(topic, async (msg: any) => {
            stats.messageCount++;
            const now = new Date();
            if (!stats.firstMessageTime) {
              stats.firstMessageTime = now;
            }
            stats.lastMessageTime = now;
            
            stats.messages.push(msg);
            if (stats.messages.length > 10) {
              stats.messages.shift();
            }
            
            console.log(`📝 [TRANSCRIPT:${parsed.interactionId}] ${formatMessage(msg)}`);
          });
          
          subscriptions.push(subscriptionHandle);
          console.log(`   ✅ Subscribed to ${topic}`);
        }
      }
      
      // Wait for duration
      await new Promise(resolve => setTimeout(resolve, durationMs));
      
      // Unsubscribe all
      for (const sub of subscriptions) {
        await sub.unsubscribe();
      }
    } else {
      console.log('   ⚠️  Cannot use SCAN (Redis adapter not available)');
      console.log('   Please specify --interaction-id to monitor a specific stream');
    }
  }
  
  console.log('');
  console.log('📊 Transcript Stream Statistics:');
  for (const [id, stats] of transcriptStats.entries()) {
    console.log(`   ${id}:`);
    console.log(`      Messages: ${stats.messageCount}`);
    if (stats.firstMessageTime) {
      console.log(`      First: ${stats.firstMessageTime.toISOString()}`);
    }
    if (stats.lastMessageTime) {
      console.log(`      Last: ${stats.lastMessageTime.toISOString()}`);
    }
  }
}

async function runMonitoring(): Promise<void> {
  if (!REDIS_URL) {
    console.error('❌ REDIS_URL environment variable is required');
    process.exit(1);
  }
  
  const args = process.argv.slice(2);
  let monitorAudio = true;
  let monitorTranscripts = true;
  let interactionId = INTERACTION_ID;
  let duration = DURATION_SEC * 1000;
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(require('fs').readFileSync(__filename, 'utf8').match(/\/\*\*[\s\S]*?\*\//)?.[0] || '');
    process.exit(0);
  }
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interaction-id' && i + 1 < args.length) {
      interactionId = args[i + 1];
      i++;
    } else if (args[i] === '--duration' && i + 1 < args.length) {
      duration = parseInt(args[i + 1], 10) * 1000;
      i++;
    } else if (args[i] === '--audio-only') {
      monitorTranscripts = false;
    } else if (args[i] === '--transcript-only') {
      monitorAudio = false;
    }
  }
  
  console.log('🔍 Redis Streams Monitor');
  console.log('='.repeat(60));
  console.log(`   Redis URL: ${REDIS_URL.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`   Duration: ${duration / 1000} seconds`);
  if (interactionId) {
    console.log(`   Interaction ID: ${interactionId}`);
  }
  console.log(`   Monitor Audio: ${monitorAudio ? '✅' : '❌'}`);
  console.log(`   Monitor Transcripts: ${monitorTranscripts ? '✅' : '❌'}`);
  console.log('='.repeat(60));
  console.log('');
  
  const pubsub = createPubSubAdapterFromEnv();
  
  try {
    // Monitor audio stream
    if (monitorAudio) {
      await monitorAudioStream(pubsub, duration);
    }
    
    // Monitor transcript streams
    if (monitorTranscripts) {
      await monitorTranscriptStreams(pubsub, duration, interactionId);
    }
    
    // Final summary
    console.log('');
    console.log('='.repeat(60));
    console.log('📊 Final Summary');
    console.log('='.repeat(60));
    console.log(`   Audio messages: ${audioStats.messageCount}`);
    console.log(`   Transcript streams monitored: ${transcriptStats.size}`);
    let totalTranscripts = 0;
    for (const stats of transcriptStats.values()) {
      totalTranscripts += stats.messageCount;
    }
    console.log(`   Total transcript messages: ${totalTranscripts}`);
    console.log('='.repeat(60));
    
  } finally {
    await pubsub.close();
  }
}

// Run if executed directly
if (require.main === module) {
  runMonitoring().catch((error) => {
    console.error('❌ Monitoring error:', error);
    process.exit(1);
  });
}

export { runMonitoring };


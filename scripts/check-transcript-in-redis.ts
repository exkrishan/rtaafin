#!/usr/bin/env tsx
/**
 * Check if transcripts exist in Redis for a specific interaction ID
 * Usage: npx tsx scripts/check-transcript-in-redis.ts <interactionId>
 */

import Redis from 'ioredis';

const INTERACTION_ID = process.argv[2] || 'call_4a39b1a4946a1c7e0bc01a1c2fa17ced';
const REDIS_URL = process.env.REDIS_URL || process.env.REDISCLOUD_URL;

if (!REDIS_URL) {
  console.error('❌ REDIS_URL environment variable not set');
  console.error('   Set it with: export REDIS_URL="redis://..."');
  process.exit(1);
}

async function checkTranscriptStream() {
  console.log('🔍 Checking Transcript Stream in Redis');
  console.log('='.repeat(60));
  console.log(`Interaction ID: ${INTERACTION_ID}`);
  console.log(`Redis URL: ${REDIS_URL.replace(/:[^:@]+@/, ':****@')}`); // Hide password
  console.log('');

  const client = new Redis(REDIS_URL);
  
  try {
    // ioredis connects automatically
    console.log('✅ Connected to Redis');
    console.log('');

    const streamName = `transcript.${INTERACTION_ID}`;
    console.log(`📋 Checking stream: ${streamName}`);
    console.log('');

    // Check if stream exists - xinfo returns an array with stream info
    const streamInfoArray = await client.xinfo('STREAM', streamName).catch(() => null);
    
    // Parse stream info from array format: ['length', 5, 'first-entry', [...], 'last-entry', [...]]
    let streamInfo: any = null;
    if (streamInfoArray && Array.isArray(streamInfoArray)) {
      streamInfo = {
        length: streamInfoArray[streamInfoArray.indexOf('length') + 1] || 0,
        firstEntry: null,
        lastEntry: null,
      };
      
      const firstEntryIdx = streamInfoArray.indexOf('first-entry');
      const lastEntryIdx = streamInfoArray.indexOf('last-entry');
      
      if (firstEntryIdx >= 0 && firstEntryIdx + 1 < streamInfoArray.length) {
        const firstEntryData = streamInfoArray[firstEntryIdx + 1];
        if (Array.isArray(firstEntryData) && firstEntryData.length > 0) {
          streamInfo.firstEntry = { id: firstEntryData[0] };
        }
      }
      
      if (lastEntryIdx >= 0 && lastEntryIdx + 1 < streamInfoArray.length) {
        const lastEntryData = streamInfoArray[lastEntryIdx + 1];
        if (Array.isArray(lastEntryData) && lastEntryData.length > 0) {
          streamInfo.lastEntry = { id: lastEntryData[0] };
        }
      }
    }
    
    if (!streamInfo) {
      console.log('❌ Stream does not exist in Redis');
      console.log('');
      console.log('💡 This means:');
      console.log('   - ASR worker has not published any transcripts yet');
      console.log('   - Audio may not have been processed');
      console.log('   - Call may not have been registered');
      console.log('');
      console.log('📝 Check ASR worker logs for:');
      console.log('   - "[ASRWorker] 📨 Message received" for this interaction ID');
      console.log('   - "[ASRWorker] ✅ Published ... transcript"');
      console.log('   - "[ElevenLabsProvider] 📝 Transcript"');
      return;
    }

    console.log('✅ Stream exists!');
    console.log('');
    console.log('Stream Info:');
    console.log(`  Length: ${streamInfo.length} messages`);
    console.log(`  First Entry ID: ${streamInfo.firstEntry?.id || 'none'}`);
    console.log(`  Last Entry ID: ${streamInfo.lastEntry?.id || 'none'}`);
    console.log('');

    // Read recent messages
    const messages = await client.xread('COUNT', 10, 'STREAMS', streamName, '0').catch(() => []);

    if (!messages || messages.length === 0) {
      console.log('⚠️  No messages found in stream');
      return;
    }

    // ioredis xread returns: [[streamName, [[msgId, [field, value, ...]], ...]]]
    const streamData = messages[0];
    if (!streamData || streamData.length < 2) {
      console.log('⚠️  Invalid message format');
      return;
    }

    const [streamNameFromRedis, messageList] = streamData;
    const messageArray = messageList as any[];
    
    console.log(`📨 Found ${messageArray.length} message(s) in stream`);
    console.log('');

    for (const messageEntry of messageArray.slice(0, 5)) {
      // Parse message: [msgId, [field, value, ...]]
      if (!Array.isArray(messageEntry) || messageEntry.length < 2) {
        continue;
      }
      
      const [msgId, fields] = messageEntry;
      
      // Find 'data' field
      let dataStr = '';
      if (Array.isArray(fields)) {
        const dataIndex = fields.findIndex((f: string) => f === 'data');
        if (dataIndex >= 0 && dataIndex + 1 < fields.length) {
          dataStr = fields[dataIndex + 1];
        }
      }
      
      let data: any;
      try {
        data = typeof dataStr === 'string' ? JSON.parse(dataStr) : { raw: dataStr };
      } catch {
        data = { raw: dataStr };
      }

      console.log(`  Message ID: ${msgId}`);
      console.log(`  Type: ${data.type || 'unknown'}`);
      console.log(`  Text: ${data.text ? (data.text.substring(0, 100) + (data.text.length > 100 ? '...' : '')) : '(empty)'}`);
      console.log(`  Text Length: ${data.text?.length || 0}`);
      console.log(`  Seq: ${data.seq || 'unknown'}`);
      console.log('');
    }

    if (messageArray.length > 5) {
      console.log(`  ... and ${messageArray.length - 5} more message(s)`);
      console.log('');
    }

    console.log('✅ Transcripts found in Redis!');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Transcript consumer should auto-discover this stream');
    console.log('   2. Check transcript consumer status:');
    console.log(`      curl "${process.env.UI_URL || 'https://frontend-8jdd.onrender.com'}/api/transcripts/status"`);
    console.log('   3. If not subscribed, the consumer will discover it in the next scan');
    console.log('   4. Transcripts should appear in the UI once consumed');

  } catch (error: any) {
    console.error('❌ Error checking Redis:', error.message);
    if (error.message.includes('NOAUTH')) {
      console.error('   Authentication failed - check Redis password');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('   Connection refused - check Redis URL and network');
    }
  } finally {
    client.disconnect();
    console.log('🔌 Disconnected from Redis');
  }
}

async function checkCallRegistry() {
  console.log('\n📋 Checking Call Registry...');
  console.log('='.repeat(60));

  const client = new Redis(REDIS_URL);
  
  try {
    // ioredis connects automatically
    
    const registryKey = `call:metadata:${INTERACTION_ID}`;
    const metadata = await client.get(registryKey);
    
    if (metadata) {
      const callData = JSON.parse(metadata);
      console.log('✅ Call is registered in call registry');
      console.log('');
      console.log('Call Metadata:');
      console.log(`  Interaction ID: ${callData.interactionId}`);
      console.log(`  Status: ${callData.status}`);
      console.log(`  Start Time: ${new Date(callData.startTime).toISOString()}`);
      console.log(`  Last Activity: ${new Date(callData.lastActivity).toISOString()}`);
      console.log(`  Call SID: ${callData.callSid || 'unknown'}`);
    } else {
      console.log('❌ Call is NOT registered in call registry');
      console.log('');
      console.log('💡 This means:');
      console.log('   - Ingest service failed to register the call');
      console.log('   - Check ingest service logs for registration errors');
      console.log('   - Verify call-registry module is loaded correctly');
    }
  } catch (error: any) {
    console.error('❌ Error checking call registry:', error.message);
  } finally {
    client.disconnect();
  }
}

async function main() {
  try {
    await checkTranscriptStream();
    await checkCallRegistry();
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();


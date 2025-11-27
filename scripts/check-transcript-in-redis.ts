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
  console.log('🔍 Checking Transcript List in Redis');
  console.log('='.repeat(60));
  console.log(`Interaction ID: ${INTERACTION_ID}`);
  console.log(`Redis URL: ${REDIS_URL!.replace(/:[^:@]+@/, ':****@')}`); // Hide password
  console.log('');

  const client = new Redis(REDIS_URL!);
  
  try {
    // ioredis connects automatically
    console.log('✅ Connected to Redis');
    console.log('');

    const listKey = `transcripts:${INTERACTION_ID}`;
    console.log(`📋 Checking list: ${listKey}`);
    console.log('');

    // Check list length
    const length = await client.llen(listKey);
    
    if (length === 0) {
      console.log('❌ List does not exist or is empty in Redis');
      console.log('');
      console.log('💡 This means:');
      console.log('   - ASR worker has not pushed any transcripts yet');
      console.log('   - Audio may not have been processed');
      console.log('   - Call may not have been registered');
      console.log('');
      console.log('📝 Check ASR worker logs for:');
      console.log('   - "[ASRWorker] 📥 Buffered chunk"');
      console.log('   - "[ASRWORKER] 📤 Pushed transcript to Redis List"');
      return;
    }

    console.log('✅ List exists!');
    console.log('');
    console.log(`  Length: ${length} messages`);
    console.log('');

    // Read recent messages (last 5)
    const messages = await client.lrange(listKey, -5, -1);

    if (!messages || messages.length === 0) {
      console.log('⚠️  No messages found in list (unexpected)');
      return;
    }

    console.log(`📨 Found ${length} message(s) in list (showing last ${messages.length})`);
    console.log('');

    for (const messageStr of messages) {
      let data: any;
      try {
        data = JSON.parse(messageStr);
      } catch {
        data = { raw: messageStr };
      }

      console.log(`  Type: ${data.type || 'unknown'}`);
      console.log(`  Text: ${data.text ? (data.text.substring(0, 100) + (data.text.length > 100 ? '...' : '')) : '(empty)'}`);
      console.log(`  Text Length: ${data.text?.length || 0}`);
      console.log(`  Seq: ${data.seq || 'unknown'}`);
      console.log(`  Timestamp: ${new Date(data.timestamp_ms).toISOString()}`);
      console.log('');
    }

    if (length > 5) {
      console.log(`  ... and ${length - 5} previous message(s)`);
      console.log('');
    }

    console.log('✅ Transcripts found in Redis List!');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. The API /api/transcripts/latest should return these');
    console.log(`      curl "${process.env.UI_URL || 'https://frontend-8jdd.onrender.com'}/api/transcripts/latest?callId=${INTERACTION_ID}"`);
    console.log('   2. Frontend should poll and display them');

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

  const client = new Redis(REDIS_URL!);
  
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


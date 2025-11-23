#!/usr/bin/env npx tsx
/**
 * Test script to verify Redis Streams adapter validation fixes
 * 
 * Usage:
 *   REDIS_URL=redis://... npx tsx scripts/test-redis-validation.ts
 */

import { RedisStreamsAdapter } from '../lib/pubsub/adapters/redisStreamsAdapter';
import { MessageEnvelope } from '../lib/pubsub/types';

async function testValidation() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  console.log('🧪 Testing Redis Streams Adapter Validation Fixes');
  console.log('================================================');
  console.log(`Redis URL: ${redisUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log('');

  const adapter = new RedisStreamsAdapter({
    url: redisUrl,
  });

  try {
    // Test 1: Subscribe to a test topic (adapter initializes automatically)
    const testTopic = 'transcript.test-validation';
    let receivedMessages: MessageEnvelope[] = [];

    const handler = async (msg: MessageEnvelope) => {
      console.log('✅ Received valid message:', {
        interaction_id: msg.interaction_id,
        text: (msg as any).text?.substring(0, 50),
        seq: (msg as any).seq,
      });
      receivedMessages.push(msg);
    };

    console.log('📡 Subscribing to test topic...');
    const subscription = await adapter.subscribe(testTopic, handler);
    console.log(`✅ Subscribed to ${testTopic}`);
    console.log('   (Adapter connects to Redis automatically)');
    console.log('');

    // Wait a bit for subscription to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Publish a valid message
    console.log('📤 Publishing valid message...');
    await adapter.publish(testTopic, {
      interaction_id: 'test-validation',
      tenant_id: 'test-tenant',
      text: 'This is a test message to verify validation works',
      seq: 1,
      type: 'partial',
      timestamp_ms: Date.now(),
    });
    console.log('✅ Published valid message');
    console.log('');

    // Wait for processing
    console.log('⏳ Waiting for message processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify message was received
    if (receivedMessages.length > 0) {
      console.log(`✅ SUCCESS: Received ${receivedMessages.length} message(s)`);
      console.log('   Validation is working correctly!');
    } else {
      console.log('⚠️  WARNING: No messages received');
      console.log('   This might indicate:');
      console.log('   - Consumer group issue');
      console.log('   - Message format issue');
      console.log('   - Timing issue (try increasing wait time)');
    }
    console.log('');

    // Cleanup
    await subscription.unsubscribe();
    await adapter.close();
    console.log('✅ Test complete');
    console.log('');

    // Summary
    console.log('📊 Test Summary:');
    console.log('================');
    console.log(`✅ Connection: Success`);
    console.log(`✅ Subscription: Success`);
    console.log(`✅ Publishing: Success`);
    console.log(`${receivedMessages.length > 0 ? '✅' : '⚠️ '} Message Reception: ${receivedMessages.length > 0 ? 'Success' : 'No messages received'}`);
    console.log('');

    if (receivedMessages.length > 0) {
      console.log('🎉 All tests passed! Validation fixes are working.');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests had issues. Check logs above.');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Test failed:', error);
    console.error('');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    });
    process.exit(1);
  }
}

// Run test
testValidation().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


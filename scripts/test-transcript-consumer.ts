#!/usr/bin/env tsx
/**
 * Test script for Transcript Consumer
 * 
 * Tests the transcript consumer by:
 * 1. Checking if consumer is running
 * 2. Publishing a test transcript to Redis
 * 3. Verifying it's consumed and forwarded
 */

import { createPubSubAdapterFromEnv } from '../lib/pubsub';
import { transcriptTopic } from '../lib/pubsub/topics';

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

async function main() {
  console.log('🧪 Testing Transcript Consumer');
  console.log('');

  const testInteractionId = `test-${Date.now()}`;
  const testTopic = transcriptTopic(testInteractionId);

  console.log('📋 Test Configuration:');
  console.log(`  Interaction ID: ${testInteractionId}`);
  console.log(`  Topic: ${testTopic}`);
  console.log('');

  // Create pub/sub adapter
  console.log('🔌 Connecting to Redis...');
  const adapter = createPubSubAdapterFromEnv();
  console.log('✅ Connected to Redis');
  console.log('');

  // Publish test transcript
  console.log('📤 Publishing test transcript...');
  const testTranscript = {
    interaction_id: testInteractionId,
    tenant_id: 'test-tenant',
    seq: 1,
    type: 'final' as const,
    text: 'This is a test transcript message to verify the consumer is working.',
    confidence: 0.95,
    timestamp_ms: Date.now(),
  };

  try {
    const msgId = await adapter.publish(testTopic, testTranscript);
    console.log('✅ Published test transcript');
    console.log(`  Message ID: ${msgId}`);
    console.log('');

    console.log('⏳ Waiting for consumer to process...');
    console.log('  (Check Next.js logs to see if transcript was forwarded)');
    console.log('');

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check status
    console.log('📊 Checking consumer status...');
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const statusUrl = `${baseUrl}/api/transcripts/status`;
      
      const response = await fetch(statusUrl);
      if (response.ok) {
        const status = await response.json();
        console.log('✅ Consumer Status:');
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.warn('⚠️  Could not fetch status (consumer may not be running)');
      }
    } catch (error: any) {
      console.warn('⚠️  Could not check status:', error.message);
    }

    console.log('');
    console.log('✅ Test complete!');
    console.log('');
    console.log('📝 Next Steps:');
    console.log('  1. Check Next.js server logs for transcript processing');
    console.log('  2. Verify /api/calls/ingest-transcript was called');
    console.log('  3. Check if intent detection was triggered');
    console.log('  4. Verify SSE broadcast to frontend');
    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await adapter.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


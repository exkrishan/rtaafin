#!/usr/bin/env ts-node
/**
 * Demo script showing publish -> subscribe flow for Redis Streams
 * 
 * Usage:
 *   REDIS_URL=redis://localhost:6379 ts-node scripts/pubsub_demo.ts
 */

import { createPubSubAdapterFromEnv } from '../lib/pubsub';
import { audioTopic, transcriptTopic } from '../lib/pubsub/topics';

async function main() {
  console.log('🚀 Pub/Sub Demo - Redis Streams');
  console.log('');

  // Create adapter
  const adapter = createPubSubAdapterFromEnv();
  console.log('✅ Created pub/sub adapter');

  // Subscribe to audio topic
  const audioTopicName = audioTopic({ useStreams: true });
  console.log(`📡 Subscribing to: ${audioTopicName}`);

  const audioHandle = await adapter.subscribe(audioTopicName, async (msg) => {
    console.log(`📨 Received audio message:`, {
      interaction_id: msg.interaction_id,
      tenant_id: msg.tenant_id,
      timestamp_ms: msg.timestamp_ms,
      seq: (msg as any).seq,
    });
  });

  // Subscribe to transcript topic
  const interactionId = 'demo-int-123';
  const transcriptTopicName = transcriptTopic(interactionId);
  console.log(`📡 Subscribing to: ${transcriptTopicName}`);

  const transcriptHandle = await adapter.subscribe(transcriptTopicName, async (msg) => {
    console.log(`📨 Received transcript message:`, {
      interaction_id: msg.interaction_id,
      tenant_id: msg.tenant_id,
      text: (msg as any).text?.substring(0, 50),
    });
  });

  // Wait a bit for subscriptions to be ready
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Publish some messages
  console.log('');
  console.log('📤 Publishing messages...');

  // Publish audio frames
  for (let i = 1; i <= 5; i++) {
    const msgId = await adapter.publish(audioTopicName, {
      interaction_id: interactionId,
      tenant_id: 'demo-tenant',
      seq: i,
      sample_rate: 24000,
      encoding: 'pcm16',
      audio: Buffer.alloc(9600).toString('base64'),
    });
    console.log(`  ✓ Published audio frame ${i} (msgId: ${msgId})`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Publish transcript updates
  await adapter.publish(transcriptTopicName, {
    interaction_id: interactionId,
    tenant_id: 'demo-tenant',
    text: 'Hello, I need help with my credit card.',
    speaker: 'customer',
  });
  console.log(`  ✓ Published transcript update`);

  await adapter.publish(transcriptTopicName, {
    interaction_id: interactionId,
    tenant_id: 'demo-tenant',
    text: 'I can help you with that. What seems to be the issue?',
    speaker: 'agent',
  });
  console.log(`  ✓ Published transcript update`);

  // Wait for messages to be delivered
  console.log('');
  console.log('⏳ Waiting for messages to be delivered...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Cleanup
  console.log('');
  console.log('🧹 Cleaning up...');
  await audioHandle.unsubscribe();
  await transcriptHandle.unsubscribe();
  await adapter.close();

  console.log('');
  console.log('✅ Demo complete!');
}

main().catch((error) => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});


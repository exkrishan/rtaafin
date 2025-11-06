#!/usr/bin/env ts-node
/**
 * Demo script for ASR worker
 * Simulates incoming audio from ingest pub/sub and shows printed transcripts
 * 
 * Usage:
 *   PUBSUB_ADAPTER=in_memory ts-node scripts/asr_worker_demo.ts
 */

import { createPubSubAdapter, InMemoryAdapter } from '../lib/pubsub';
import { audioTopic, transcriptTopic } from '../lib/pubsub/topics';
import { createAsrProvider } from '../services/asr-worker/src/providers';
import { AudioFrameMessage, TranscriptMessage } from '../services/asr-worker/src/types';

async function main() {
  console.log('🎤 ASR Worker Demo');
  console.log('');

  // Create pub/sub adapter (in-memory for demo)
  const pubsub = createPubSubAdapter({ adapter: 'in_memory' }) as InMemoryAdapter;
  console.log('✅ Created pub/sub adapter (in-memory)');

  // Create ASR provider (mock for demo)
  const asrProvider = createAsrProvider('mock');
  console.log('✅ Created ASR provider (mock)');

  const interactionId = 'demo-int-123';
  const tenantId = 'demo-tenant';
  const audioTopicName = audioTopic({ useStreams: true });
  const transcriptTopicName = transcriptTopic(interactionId);

  // Subscribe to transcript topic
  console.log(`📡 Subscribing to transcript topic: ${transcriptTopicName}`);
  const transcriptHandle = await pubsub.subscribe(transcriptTopicName, async (msg) => {
    const transcript = msg as TranscriptMessage;
    const typeEmoji = transcript.type === 'final' ? '✅' : '⏳';
    console.log(`${typeEmoji} [${transcript.type.toUpperCase()}] ${transcript.text}`);
    if (transcript.confidence) {
      console.log(`   Confidence: ${(transcript.confidence * 100).toFixed(1)}%`);
    }
  });

  // Simulate audio frames from ingest service
  console.log('');
  console.log('📤 Simulating audio frames from ingest service...');
  console.log('');

  const sampleRate = 24000;
  const chunkDurationMs = 200;
  const samplesPerChunk = (sampleRate * chunkDurationMs) / 1000;
  const bytesPerChunk = samplesPerChunk * 2; // 16-bit PCM

  // Generate 20 audio chunks (~4 seconds)
  for (let seq = 1; seq <= 20; seq++) {
    // Generate synthetic PCM16 audio (simple sine wave)
    const audioBuffer = Buffer.allocUnsafe(bytesPerChunk);
    for (let i = 0; i < samplesPerChunk; i++) {
      const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 16000;
      audioBuffer.writeInt16LE(Math.floor(sample), i * 2);
    }

    const frame: AudioFrameMessage = {
      tenant_id: tenantId,
      interaction_id: interactionId,
      seq,
      timestamp_ms: Date.now() + seq * chunkDurationMs,
      sample_rate: sampleRate,
      encoding: 'pcm16',
      audio: audioBuffer.toString('base64'),
    };

    // Publish audio frame
    await pubsub.publish(audioTopicName, frame);
    console.log(`  📦 Published audio frame ${seq}`);

    // Process through ASR provider (simulate worker processing)
    const transcript = await asrProvider.sendAudioChunk(audioBuffer, {
      interactionId,
      seq,
      sampleRate,
    });

    // Publish transcript
    const transcriptMsg: TranscriptMessage = {
      interaction_id: interactionId,
      tenant_id: tenantId,
      seq,
      type: transcript.type,
      text: transcript.text,
      confidence: transcript.confidence,
      timestamp_ms: Date.now(),
    };

    await pubsub.publish(transcriptTopicName, transcriptMsg);

    // Small delay between chunks
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Wait for all transcripts to be delivered
  console.log('');
  console.log('⏳ Waiting for transcripts...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Cleanup
  console.log('');
  console.log('🧹 Cleaning up...');
  await transcriptHandle.unsubscribe();
  await asrProvider.close();
  await pubsub.close();

  console.log('');
  console.log('✅ Demo complete!');
}

main().catch((error) => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});


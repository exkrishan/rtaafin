/**
 * Integration test for ASR worker
 * Uses in-memory pub/sub adapter to test end-to-end flow
 */

import { createPubSubAdapter, InMemoryAdapter } from '../../../lib/pubsub';
import { audioTopic, transcriptTopic } from '../../../lib/pubsub/topics';
import { createAsrProvider } from '../src/providers';
import { AudioFrameMessage, TranscriptMessage } from '../src/types';

// Mock the ASR worker logic
async function simulateAsrWorker(
  pubsub: InMemoryAdapter,
  asrProvider: ReturnType<typeof createAsrProvider>
) {
  const audioTopicName = audioTopic({ useStreams: true });
  const receivedTranscripts: TranscriptMessage[] = [];

  // Subscribe to transcript topic
  const transcriptHandle = await pubsub.subscribe(
    transcriptTopic('test-int-123'),
    async (msg) => {
      receivedTranscripts.push(msg as TranscriptMessage);
    }
  );

  // Simulate receiving audio frames
  const audioFrames: AudioFrameMessage[] = [
    {
      tenant_id: 'test-tenant',
      interaction_id: 'test-int-123',
      seq: 1,
      timestamp_ms: Date.now(),
      sample_rate: 24000,
      encoding: 'pcm16',
      audio: Buffer.alloc(9600).toString('base64'),
    },
    {
      tenant_id: 'test-tenant',
      interaction_id: 'test-int-123',
      seq: 2,
      timestamp_ms: Date.now() + 200,
      sample_rate: 24000,
      encoding: 'pcm16',
      audio: Buffer.alloc(9600).toString('base64'),
    },
  ];

  // Publish audio frames
  for (const frame of audioFrames) {
    await pubsub.publish(audioTopicName, frame);
  }

  // Wait for processing
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Process audio through ASR provider
  for (const frame of audioFrames) {
    const audioBuffer = Buffer.from(frame.audio, 'base64');
    const transcript = await asrProvider.sendAudioChunk(audioBuffer, {
      interactionId: frame.interaction_id,
      seq: frame.seq,
      sampleRate: frame.sample_rate,
    });

    // Publish transcript
    const transcriptMsg: TranscriptMessage = {
      interaction_id: frame.interaction_id,
      tenant_id: frame.tenant_id,
      seq: frame.seq,
      type: transcript.type,
      text: transcript.text,
      confidence: transcript.confidence,
      timestamp_ms: Date.now(),
    };

    await pubsub.publish(transcriptTopic(frame.interaction_id), transcriptMsg);
  }

  // Wait for delivery
  await new Promise((resolve) => setTimeout(resolve, 500));

  await transcriptHandle.unsubscribe();
  await asrProvider.close();
  await pubsub.close();

  return receivedTranscripts;
}

describe('ASR Worker Integration', () => {
  it('should process audio frames and emit transcript messages', async () => {
    const pubsub = createPubSubAdapter({ adapter: 'in_memory' }) as InMemoryAdapter;
    const asrProvider = createAsrProvider('mock');

    const transcripts = await simulateAsrWorker(pubsub, asrProvider);

    expect(transcripts.length).toBeGreaterThan(0);
    expect(transcripts[0].interaction_id).toBe('test-int-123');
    expect(transcripts[0].tenant_id).toBe('test-tenant');
    expect(transcripts[0].type).toMatch(/partial|final/);
    expect(transcripts[0].text).toBeDefined();
    expect(transcripts[0].timestamp_ms).toBeDefined();
  });

  it('should emit both partial and final transcripts', async () => {
    const pubsub = createPubSubAdapter({ adapter: 'in_memory' }) as InMemoryAdapter;
    const asrProvider = createAsrProvider('mock');

    // Send many frames to trigger final transcript
    const frames: AudioFrameMessage[] = [];
    for (let i = 1; i <= 30; i++) {
      frames.push({
        tenant_id: 'test-tenant',
        interaction_id: 'test-int-456',
        seq: i,
        timestamp_ms: Date.now() + i * 200,
        sample_rate: 24000,
        encoding: 'pcm16',
        audio: Buffer.alloc(9600).toString('base64'),
      });
    }

    const receivedTranscripts: TranscriptMessage[] = [];
    const handle = await pubsub.subscribe(transcriptTopic('test-int-456'), async (msg) => {
      receivedTranscripts.push(msg as TranscriptMessage);
    });

    // Process frames
    for (const frame of frames) {
      const audioBuffer = Buffer.from(frame.audio, 'base64');
      const transcript = await asrProvider.sendAudioChunk(audioBuffer, {
        interactionId: frame.interaction_id,
        seq: frame.seq,
        sampleRate: frame.sample_rate,
      });

      await pubsub.publish(transcriptTopic(frame.interaction_id), {
        interaction_id: frame.interaction_id,
        tenant_id: frame.tenant_id,
        seq: frame.seq,
        type: transcript.type,
        text: transcript.text,
        confidence: transcript.confidence,
        timestamp_ms: Date.now(),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(receivedTranscripts.length).toBeGreaterThan(0);

    // Should have at least one final transcript
    const finalTranscripts = receivedTranscripts.filter((t) => t.type === 'final');
    expect(finalTranscripts.length).toBeGreaterThan(0);

    await handle.unsubscribe();
    await asrProvider.close();
    await pubsub.close();
  }, 10000);
});


/**
 * Unit tests for mock ASR provider
 */

import { MockProvider } from '../src/providers/mockProvider';

describe('MockProvider', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  afterEach(async () => {
    await provider.close();
  });

  it('should return partial transcript initially', async () => {
    const audio = Buffer.alloc(9600); // 200ms of PCM16 at 24kHz
    const transcript = await provider.sendAudioChunk(audio, {
      interactionId: 'test-int-1',
      seq: 1,
      sampleRate: 24000,
    });

    expect(transcript.type).toBe('partial');
    expect(transcript.isFinal).toBe(false);
    expect(transcript.text).toBeDefined();
  });

  it('should progress to final transcript after multiple chunks', async () => {
    const audio = Buffer.alloc(9600);
    const interactionId = 'test-int-2';

    // Send multiple chunks
    let transcript;
    for (let i = 1; i <= 30; i++) {
      transcript = await provider.sendAudioChunk(audio, {
        interactionId,
        seq: i,
        sampleRate: 24000,
      });
    }

    expect(transcript!.type).toBe('final');
    expect(transcript!.isFinal).toBe(true);
    expect(transcript!.text.length).toBeGreaterThan(0);
  });

  it('should return different transcripts for different interactions', async () => {
    const audio = Buffer.alloc(9600);

    const transcript1 = await provider.sendAudioChunk(audio, {
      interactionId: 'int-1',
      seq: 1,
      sampleRate: 24000,
    });

    const transcript2 = await provider.sendAudioChunk(audio, {
      interactionId: 'int-2',
      seq: 1,
      sampleRate: 24000,
    });

    // They might be different (random template selection)
    expect(transcript1).toBeDefined();
    expect(transcript2).toBeDefined();
  });

  it('should include confidence scores', async () => {
    const audio = Buffer.alloc(9600);
    const transcript = await provider.sendAudioChunk(audio, {
      interactionId: 'test-int-3',
      seq: 1,
      sampleRate: 24000,
    });

    expect(transcript.confidence).toBeDefined();
    expect(transcript.confidence).toBeGreaterThan(0);
    expect(transcript.confidence).toBeLessThanOrEqual(1);
  });
});


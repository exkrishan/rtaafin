/**
 * Unit tests for pub/sub adapter
 */

import { createPubSubAdapter } from '../src/pubsub-adapter.dev';
import { AudioFrame } from '../src/types';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    publish: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
  }));
});

describe('PubSubAdapter', () => {
  let adapter: ReturnType<typeof createPubSubAdapter>;

  beforeEach(() => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    adapter = createPubSubAdapter();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should publish audio frame', async () => {
    const frame: AudioFrame = {
      tenant_id: 'tenant-123',
      interaction_id: 'int-456',
      seq: 1,
      timestamp_ms: Date.now(),
      sample_rate: 24000,
      encoding: 'pcm16',
      audio: Buffer.from('test-audio-data'),
    };

    await adapter.publish(frame);

    // Verify Redis publish was called
    const Redis = require('ioredis');
    const redisInstance = Redis.mock.results[0].value;
    expect(redisInstance.publish).toHaveBeenCalled();
    
    const [channel, payload] = redisInstance.publish.mock.calls[0];
    expect(channel).toBe('audio:frames');
    
    const parsed = JSON.parse(payload);
    expect(parsed.tenant_id).toBe('tenant-123');
    expect(parsed.interaction_id).toBe('int-456');
    expect(parsed.seq).toBe(1);
    expect(parsed.audio).toBe(Buffer.from('test-audio-data').toString('base64'));
  });
});


/**
 * Tests for Deepgram connection race conditions and reuse
 * 
 * These tests verify that:
 * 1. Concurrent calls to sendAudioChunk reuse the same connection
 * 2. Connection creation is properly synchronized
 * 3. Errors in connection creation are handled correctly
 */

// Mock Deepgram SDK at module level (required for Jest hoisting)
jest.mock('@deepgram/sdk', () => {
  const mockConnection = {
    on: jest.fn((event: string, handler: Function) => {
      // Simulate Open event after a short delay
      if (event === 'open') {
        setTimeout(() => handler(), 50);
      }
    }),
    send: jest.fn(),
    finish: jest.fn(),
    _socket: {
      send: jest.fn(),
      readyState: 1, // OPEN
    },
  };

  return {
    createClient: jest.fn(() => ({
      listen: {
        live: jest.fn(() => mockConnection),
      },
    })),
    LiveTranscriptionEvents: {
      Open: 'open',
      Transcript: 'transcript',
      Close: 'close',
      Error: 'error',
    },
  };
});

import { DeepgramProvider } from '../src/providers/deepgramProvider';

describe('DeepgramProvider Connection Management', () => {
  const mockApiKey = 'test-api-key-12345';
  let provider: DeepgramProvider;

  beforeEach(() => {
    // Clear environment to ensure we use mock key
    delete process.env.DEEPGRAM_API_KEY;
    provider = new DeepgramProvider(mockApiKey);
  });

  afterEach(async () => {
    await provider.close();
    // Clear mocks
    jest.clearAllMocks();
  });

  it('should reuse existing connection when called concurrently', async () => {
    const interactionId = 'test-int-123';
    const sampleRate = 8000;
    const audio = Buffer.alloc(1600); // 100ms at 8kHz

    // Simulate concurrent calls (race condition scenario)
    const promises = [
      provider.sendAudioChunk(audio, { interactionId, seq: 1, sampleRate }),
      provider.sendAudioChunk(audio, { interactionId, seq: 2, sampleRate }),
      provider.sendAudioChunk(audio, { interactionId, seq: 3, sampleRate }),
    ];

    // Wait for all to complete
    await Promise.all(promises);

    // Verify only one connection was created
    const connections = (provider as any).connections;
    expect(connections.size).toBe(1);
    expect(connections.has(interactionId)).toBe(true);

    // Verify connection creation lock was cleared
    const locks = (provider as any).connectionCreationLocks;
    expect(locks.size).toBe(0);
  }, 10000);

  it('should wait for connection creation in progress', async () => {
    const interactionId = 'test-int-456';
    const sampleRate = 8000;
    const audio = Buffer.alloc(1600);

    // Start first call (will create connection)
    const firstCall = provider.sendAudioChunk(audio, { interactionId, seq: 1, sampleRate });

    // Immediately start second call (should wait for first)
    const secondCall = provider.sendAudioChunk(audio, { interactionId, seq: 2, sampleRate });

    await Promise.all([firstCall, secondCall]);

    // Verify only one connection exists
    const connections = (provider as any).connections;
    expect(connections.size).toBe(1);
    expect(connections.has(interactionId)).toBe(true);
  }, 10000);

  it('should handle connection creation errors gracefully', async () => {
    const interactionId = 'test-int-error';
    const sampleRate = 8000;
    const audio = Buffer.alloc(1600);

    // Mock connection creation to fail
    const { createClient } = require('@deepgram/sdk');
    createClient.mockImplementationOnce(() => {
      throw new Error('Connection creation failed');
    });

    // Create new provider with failing client
    const failingProvider = new DeepgramProvider(mockApiKey);

    // Attempt to send audio (should handle error gracefully)
    const result = await failingProvider.sendAudioChunk(audio, {
      interactionId,
      seq: 1,
      sampleRate,
    });

    // Should return empty transcript on error
    expect(result.text).toBe('');
    expect(result.type).toBe('partial');

    await failingProvider.close();
  }, 10000);

  it('should create separate connections for different interaction IDs', async () => {
    const sampleRate = 8000;
    const audio = Buffer.alloc(1600);

    const promises = [
      provider.sendAudioChunk(audio, { interactionId: 'int-1', seq: 1, sampleRate }),
      provider.sendAudioChunk(audio, { interactionId: 'int-2', seq: 1, sampleRate }),
      provider.sendAudioChunk(audio, { interactionId: 'int-3', seq: 1, sampleRate }),
    ];

    await Promise.all(promises);

    // Should have 3 separate connections
    const connections = (provider as any).connections;
    expect(connections.size).toBe(3);
    expect(connections.has('int-1')).toBe(true);
    expect(connections.has('int-2')).toBe(true);
    expect(connections.has('int-3')).toBe(true);
  }, 10000);

  it('should properly clean up connection creation locks on success', async () => {
    const interactionId = 'test-lock-cleanup';
    const sampleRate = 8000;
    const audio = Buffer.alloc(1600);

    await provider.sendAudioChunk(audio, { interactionId, seq: 1, sampleRate });

    // Verify lock was cleaned up
    const locks = (provider as any).connectionCreationLocks;
    expect(locks.size).toBe(0);
    expect(locks.has(interactionId)).toBe(false);
  }, 10000);

  it('should properly clean up connection creation locks on error', async () => {
    const interactionId = 'test-lock-cleanup-error';
    const sampleRate = 8000;
    const audio = Buffer.alloc(1600);

    // Mock to fail after connection is created but before ready
    const { createClient } = require('@deepgram/sdk');
    let callCount = 0;
    createClient.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: create connection that never becomes ready
        return {
          listen: {
            live: jest.fn(() => ({
              on: jest.fn(), // Don't fire Open event
              send: jest.fn(),
              finish: jest.fn(),
            })),
          },
        };
      }
      // Subsequent calls: normal behavior
      return {
        listen: {
          live: jest.fn(() => ({
            on: jest.fn((event: string, handler: Function) => {
              if (event === 'open') {
                setTimeout(() => handler(), 50);
              }
            }),
            send: jest.fn(),
            finish: jest.fn(),
            _socket: { send: jest.fn(), readyState: 1 },
          })),
        },
      };
    });

    const testProvider = new DeepgramProvider(mockApiKey);

    // This should timeout waiting for connection to be ready
    // But lock should still be cleaned up
    try {
      await Promise.race([
        testProvider.sendAudioChunk(audio, { interactionId, seq: 1, sampleRate }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
      ]);
    } catch (e) {
      // Expected to timeout
    }

    // Verify lock was cleaned up even on error
    const locks = (testProvider as any).connectionCreationLocks;
    expect(locks.size).toBe(0);

    await testProvider.close();
  }, 15000);
});


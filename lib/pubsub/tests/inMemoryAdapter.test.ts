/**
 * Unit tests for in-memory adapter
 */

import { InMemoryAdapter } from '../adapters/inMemoryAdapter';
import { MessageEnvelope } from '../types';

describe('InMemoryAdapter', () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('publish', () => {
    it('should publish message and return message ID', async () => {
      const msgId = await adapter.publish('test-topic', {
        interaction_id: 'int-123',
        tenant_id: 'tenant-abc',
        data: 'test',
      });

      expect(msgId).toBeDefined();
      expect(typeof msgId).toBe('string');
    });

    it('should add timestamp_ms if not provided', async () => {
      const before = Date.now();
      await adapter.publish('test-topic', {
        interaction_id: 'int-123',
        tenant_id: 'tenant-abc',
      });
      const after = Date.now();

      const messages = adapter.getMessages('test-topic');
      expect(messages.length).toBe(1);
      expect(messages[0].timestamp_ms).toBeGreaterThanOrEqual(before);
      expect(messages[0].timestamp_ms).toBeLessThanOrEqual(after);
    });
  });

  describe('subscribe', () => {
    it('should deliver messages to subscribers', async () => {
      const received: MessageEnvelope[] = [];
      const handle = await adapter.subscribe('test-topic', async (msg) => {
        received.push(msg);
      });

      await adapter.publish('test-topic', {
        interaction_id: 'int-123',
        tenant_id: 'tenant-abc',
        data: 'test1',
      });

      await adapter.publish('test-topic', {
        interaction_id: 'int-456',
        tenant_id: 'tenant-xyz',
        data: 'test2',
      });

      // Wait a bit for async delivery
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received.length).toBe(2);
      expect(received[0].interaction_id).toBe('int-123');
      expect(received[1].interaction_id).toBe('int-456');

      await handle.unsubscribe();
    });

    it('should allow multiple subscribers', async () => {
      const received1: MessageEnvelope[] = [];
      const received2: MessageEnvelope[] = [];

      const handle1 = await adapter.subscribe('test-topic', async (msg) => {
        received1.push(msg);
      });
      const handle2 = await adapter.subscribe('test-topic', async (msg) => {
        received2.push(msg);
      });

      await adapter.publish('test-topic', {
        interaction_id: 'int-123',
        tenant_id: 'tenant-abc',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received1.length).toBe(1);
      expect(received2.length).toBe(1);

      await handle1.unsubscribe();
      await handle2.unsubscribe();
    });
  });

  describe('unsubscribe', () => {
    it('should stop delivering messages after unsubscribe', async () => {
      const received: MessageEnvelope[] = [];
      const handle = await adapter.subscribe('test-topic', async (msg) => {
        received.push(msg);
      });

      await adapter.publish('test-topic', {
        interaction_id: 'int-123',
        tenant_id: 'tenant-abc',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(received.length).toBe(1);

      await handle.unsubscribe();

      await adapter.publish('test-topic', {
        interaction_id: 'int-456',
        tenant_id: 'tenant-xyz',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(received.length).toBe(1); // Should not receive new message
    });
  });

  describe('ack', () => {
    it('should be a no-op for in-memory adapter', async () => {
      const handle = await adapter.subscribe('test-topic', async () => {});
      await adapter.ack(handle, 'msg-123');
      // Should not throw
      await handle.unsubscribe();
    });
  });

  describe('close', () => {
    it('should cleanup all subscriptions and messages', async () => {
      await adapter.subscribe('test-topic', async () => {});
      await adapter.publish('test-topic', { interaction_id: 'int-123', tenant_id: 'tenant-abc' });

      expect(adapter.getMessageCount('test-topic')).toBe(1);

      await adapter.close();

      expect(adapter.getMessageCount('test-topic')).toBe(0);
    });
  });
});


"use strict";
/**
 * Integration tests for Redis Streams adapter
 * Requires Redis to be running (docker-compose or local)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const redisStreamsAdapter_1 = require("../adapters/redisStreamsAdapter");
const ioredis_1 = __importDefault(require("ioredis"));
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
describe('RedisStreamsAdapter', () => {
    let adapter;
    let testRedis;
    const TEST_TOPIC = `test:stream:${Date.now()}`;
    const TEST_GROUP = 'test-group';
    beforeAll(async () => {
        // Test Redis connection
        testRedis = new ioredis_1.default(REDIS_URL);
        try {
            await Promise.race([
                testRedis.ping(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
            ]);
            global.__REDIS_AVAILABLE__ = true;
        }
        catch (error) {
            console.warn('Redis not available, skipping integration tests');
            await testRedis.quit();
            global.__REDIS_AVAILABLE__ = false;
        }
    }, 5000);
    beforeEach(async () => {
        if (global.__REDIS_AVAILABLE__ === false) {
            return; // Skip if Redis not available
        }
        adapter = new redisStreamsAdapter_1.RedisStreamsAdapter({
            url: REDIS_URL,
            consumerGroup: TEST_GROUP,
            consumerName: `test-consumer-${Date.now()}`,
        });
        // Clean up test stream
        try {
            await testRedis.del(TEST_TOPIC);
        }
        catch {
            // Ignore if stream doesn't exist
        }
    });
    afterEach(async () => {
        if (global.__REDIS_AVAILABLE__ === false) {
            return;
        }
        if (adapter) {
            await adapter.close();
        }
        try {
            await testRedis.del(TEST_TOPIC);
        }
        catch {
            // Ignore
        }
    }, 5000);
    afterAll(async () => {
        if (testRedis && global.__REDIS_AVAILABLE__ !== false) {
            await testRedis.quit();
        }
    }, 5000);
    it('should publish message to Redis stream', async () => {
        if (global.__REDIS_AVAILABLE__ === false) {
            return;
        }
        const msgId = await adapter.publish(TEST_TOPIC, {
            interaction_id: 'int-123',
            tenant_id: 'tenant-abc',
            data: 'test',
        });
        expect(msgId).toBeDefined();
        expect(typeof msgId).toBe('string');
        // Verify message in Redis
        const stream = await testRedis.xrange(TEST_TOPIC, '-', '+', 'COUNT', 1);
        expect(stream.length).toBe(1);
        expect(stream[0][0]).toBe(msgId);
    });
    it('should subscribe and receive messages', async () => {
        if (global.__REDIS_AVAILABLE__ === false) {
            return;
        }
        const received = [];
        const handle = await adapter.subscribe(TEST_TOPIC, async (msg) => {
            received.push(msg);
        });
        // Wait a bit for subscription to be ready
        await new Promise((resolve) => setTimeout(resolve, 500));
        // Publish message
        const msgId = await adapter.publish(TEST_TOPIC, {
            interaction_id: 'int-123',
            tenant_id: 'tenant-abc',
            data: 'test',
        });
        // Wait for message to be delivered
        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(received.length).toBeGreaterThan(0);
        expect(received[0].interaction_id).toBe('int-123');
        expect(received[0].tenant_id).toBe('tenant-abc');
        await handle.unsubscribe();
    }, 10000);
    it('should ack messages', async () => {
        if (global.__REDIS_AVAILABLE__ === false) {
            return;
        }
        const handle = await adapter.subscribe(TEST_TOPIC, async () => {
            // Handler
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        const msgId = await adapter.publish(TEST_TOPIC, {
            interaction_id: 'int-123',
            tenant_id: 'tenant-abc',
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // ACK the message
        await adapter.ack(handle, msgId);
        // Verify message is acked (check pending list)
        const pending = await testRedis.xpending(TEST_TOPIC, TEST_GROUP, '-', '+', 10);
        // Pending should be empty or not include our message
        const hasPending = pending.some((p) => p[0] === msgId);
        expect(hasPending).toBe(false);
        await handle.unsubscribe();
    }, 10000);
});

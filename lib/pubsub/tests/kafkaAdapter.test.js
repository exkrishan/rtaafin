"use strict";
/**
 * Smoke tests for Kafka adapter
 * Mocks Kafka if not available in CI
 */
Object.defineProperty(exports, "__esModule", { value: true });
const kafkaAdapter_1 = require("../adapters/kafkaAdapter");
// Mock kafkajs if not available
jest.mock('kafkajs', () => {
    const mockKafka = {
        producer: jest.fn(() => ({
            connect: jest.fn().mockResolvedValue(undefined),
            send: jest.fn().mockResolvedValue([
                {
                    partitionInfos: [{ offset: '123' }],
                },
            ]),
            disconnect: jest.fn().mockResolvedValue(undefined),
        })),
        consumer: jest.fn(() => ({
            connect: jest.fn().mockResolvedValue(undefined),
            subscribe: jest.fn().mockResolvedValue(undefined),
            run: jest.fn().mockResolvedValue(undefined),
            disconnect: jest.fn().mockResolvedValue(undefined),
        })),
    };
    return {
        Kafka: jest.fn(() => mockKafka),
    };
});
describe('KafkaAdapter', () => {
    let adapter;
    beforeEach(() => {
        adapter = new kafkaAdapter_1.KafkaAdapter({
            brokers: ['localhost:9092'],
            clientId: 'test-client',
            consumerGroup: 'test-group',
        });
    });
    afterEach(async () => {
        if (adapter) {
            await adapter.close();
        }
    });
    it('should create adapter with config', () => {
        expect(adapter).toBeDefined();
    });
    it('should publish message', async () => {
        const msgId = await adapter.publish('test-topic', {
            interaction_id: 'int-123',
            tenant_id: 'tenant-abc',
            data: 'test',
        });
        expect(msgId).toBeDefined();
    });
    it('should subscribe to topic', async () => {
        const handle = await adapter.subscribe('test-topic', async () => {
            // Handler
        });
        expect(handle).toBeDefined();
        expect(handle.id).toBeDefined();
        expect(handle.topic).toBe('test-topic');
        await handle.unsubscribe();
    });
    it('should close adapter', async () => {
        await adapter.close();
        // Should not throw
    });
});

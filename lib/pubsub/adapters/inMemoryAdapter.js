"use strict";
/**
 * In-memory pub/sub adapter for unit tests
 * Stores messages in memory for fast, isolated testing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryAdapter = void 0;
class InMemoryAdapter {
    constructor() {
        this.subscriptions = new Map();
        this.messages = new Map();
        this.messageIds = new Map();
        this.nextId = 1;
    }
    async publish(topic, message) {
        const envelope = {
            ...message,
            timestamp_ms: message.timestamp_ms || Date.now(),
        };
        // Store message
        if (!this.messages.has(topic)) {
            this.messages.set(topic, []);
            this.messageIds.set(topic, []);
        }
        const msgId = `msg-${this.nextId++}`;
        this.messages.get(topic).push(envelope);
        this.messageIds.get(topic).push(msgId);
        // Deliver to subscribers synchronously
        const subs = this.subscriptions.get(topic) || [];
        for (const sub of subs) {
            // Fire and forget (async)
            sub.handler(envelope).catch((err) => {
                console.error(`[InMemoryAdapter] Handler error for ${sub.id}:`, err);
            });
        }
        return msgId;
    }
    async subscribe(topic, handler) {
        const id = `sub-${Date.now()}-${Math.random()}`;
        const subscription = {
            id,
            topic,
            handler,
        };
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, []);
        }
        this.subscriptions.get(topic).push(subscription);
        return {
            id,
            topic,
            unsubscribe: async () => {
                const subs = this.subscriptions.get(topic) || [];
                const index = subs.findIndex((s) => s.id === id);
                if (index >= 0) {
                    subs.splice(index, 1);
                }
            },
        };
    }
    async ack(handle, msgId) {
        // In-memory adapter doesn't need explicit ack
        // Messages are delivered immediately
        // This is a no-op for testing
    }
    async close() {
        this.subscriptions.clear();
        this.messages.clear();
        this.messageIds.clear();
    }
    // Test helpers
    getMessages(topic) {
        return this.messages.get(topic) || [];
    }
    getMessageCount(topic) {
        return this.messages.get(topic)?.length || 0;
    }
    clear() {
        this.messages.clear();
        this.messageIds.clear();
    }
}
exports.InMemoryAdapter = InMemoryAdapter;

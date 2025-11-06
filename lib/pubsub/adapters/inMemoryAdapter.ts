/**
 * In-memory pub/sub adapter for unit tests
 * Stores messages in memory for fast, isolated testing
 */

import { PubSubAdapter, MessageEnvelope, SubscriptionHandle } from '../types';

interface Subscription {
  id: string;
  topic: string;
  handler: (msg: MessageEnvelope) => Promise<void>;
}

export class InMemoryAdapter implements PubSubAdapter {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private messages: Map<string, MessageEnvelope[]> = new Map();
  private messageIds: Map<string, string[]> = new Map();
  private nextId = 1;

  async publish(topic: string, message: any): Promise<string | void> {
    const envelope: MessageEnvelope = {
      ...message,
      timestamp_ms: message.timestamp_ms || Date.now(),
    };

    // Store message
    if (!this.messages.has(topic)) {
      this.messages.set(topic, []);
      this.messageIds.set(topic, []);
    }

    const msgId = `msg-${this.nextId++}`;
    this.messages.get(topic)!.push(envelope);
    this.messageIds.get(topic)!.push(msgId);

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

  async subscribe(
    topic: string,
    handler: (msg: MessageEnvelope) => Promise<void>
  ): Promise<SubscriptionHandle> {
    const id = `sub-${Date.now()}-${Math.random()}`;
    const subscription: Subscription = {
      id,
      topic,
      handler,
    };

    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
    }
    this.subscriptions.get(topic)!.push(subscription);

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

  async ack(handle: SubscriptionHandle, msgId: string): Promise<void> {
    // In-memory adapter doesn't need explicit ack
    // Messages are delivered immediately
    // This is a no-op for testing
  }

  async close(): Promise<void> {
    this.subscriptions.clear();
    this.messages.clear();
    this.messageIds.clear();
  }

  // Test helpers
  getMessages(topic: string): MessageEnvelope[] {
    return this.messages.get(topic) || [];
  }

  getMessageCount(topic: string): number {
    return this.messages.get(topic)?.length || 0;
  }

  clear(): void {
    this.messages.clear();
    this.messageIds.clear();
  }
}


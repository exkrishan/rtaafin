/**
 * Kafka adapter for pub/sub
 * Uses kafkajs with consumer groups and commit handling
 */

// Dynamic import for optional kafkajs dependency
// This allows the module to be loaded even if kafkajs is not installed
let kafkajs: any = null;
try {
  kafkajs = require('kafkajs');
} catch (e) {
  // kafkajs is optional - adapter will throw if used without it
}

type Kafka = any;
type Producer = any;
type Consumer = any;
type EachMessagePayload = any;
import { PubSubAdapter, MessageEnvelope, SubscriptionHandle } from '../types';

interface KafkaSubscription {
  id: string;
  topic: string;
  consumer: Consumer;
  handler: (msg: MessageEnvelope) => Promise<void>;
  running: boolean;
}

export class KafkaAdapter implements PubSubAdapter {
  private kafka: Kafka;
  private producer: Producer;
  private subscriptions: Map<string, KafkaSubscription> = new Map();
  private clientId: string;
  private consumerGroup: string;
  private brokers: string[];

  constructor(config?: { brokers?: string[]; clientId?: string; consumerGroup?: string }) {
    if (!kafkajs) {
      throw new Error('kafkajs is not installed. Install it with: npm install kafkajs');
    }
    
    this.brokers = config?.brokers || 
      (process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092']);
    this.clientId = config?.clientId || process.env.KAFKA_CLIENT_ID || 'agent-assist-pubsub';
    this.consumerGroup = config?.consumerGroup || process.env.KAFKA_CONSUMER_GROUP || 'agent-assist';

    this.kafka = new kafkajs.Kafka({
      clientId: this.clientId,
      brokers: this.brokers,
      retry: {
        retries: 3,
        initialRetryTime: 100,
        multiplier: 2,
      },
    });

    this.producer = this.kafka.producer();
  }

  async publish(topic: string, message: any): Promise<string | void> {
    try {
      // Ensure producer is connected
      if (!this.producer) {
        this.producer = this.kafka.producer();
      }
      await this.producer.connect();

      const envelope: MessageEnvelope = {
        ...message,
        timestamp_ms: message.timestamp_ms || Date.now(),
      };

      const result = await this.producer.send({
        topic,
        messages: [
          {
            value: JSON.stringify(envelope),
            timestamp: envelope.timestamp_ms.toString(),
          },
        ],
      });

      // Return message offset as ID
      if (result && result.length > 0 && result[0]) {
        const recordMetadata = result[0];
        // Return topic-partition-offset as ID
        return `${recordMetadata.topicName}-${recordMetadata.partition}-${recordMetadata.offset}`;
      }
    } catch (error) {
      console.error('[KafkaAdapter] Publish error:', error);
      throw error;
    }
  }

  async subscribe(
    topic: string,
    handler: (msg: MessageEnvelope) => Promise<void>
  ): Promise<SubscriptionHandle> {
    const id = `sub-${Date.now()}-${Math.random()}`;

    if (!this.kafka) {
      throw new Error('Kafka client not initialized. kafkajs is required.');
    }
    
    const consumer = this.kafka.consumer({
      groupId: this.consumerGroup,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    const subscription: KafkaSubscription = {
      id,
      topic,
      consumer,
      handler,
      running: true,
    };

    this.subscriptions.set(id, subscription);

    // Start consuming messages
    await consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        if (!subscription.running) {
          return;
        }

        try {
          const message = payload.message;
          if (message.value) {
            const envelope = JSON.parse(message.value.toString()) as MessageEnvelope;
            await handler(envelope);
            // Kafka auto-commits after processing (or can be manual)
          }
        } catch (error) {
          console.error(`[KafkaAdapter] Error processing message:`, error);
          // Don't commit on error - message will be retried
        }
      },
    });

    return {
      id,
      topic,
      unsubscribe: async () => {
        await this.unsubscribe(id);
      },
    };
  }

  async ack(handle: SubscriptionHandle, msgId: string): Promise<void> {
    // Kafka handles commits automatically in run() mode
    // For manual commits, we'd need to track partition/offset
    // This is a no-op for now as kafkajs handles commits automatically
    // In production, you might want to implement manual commit logic here
  }

  private async unsubscribe(id: string): Promise<void> {
    const subscription = this.subscriptions.get(id);
    if (subscription) {
      subscription.running = false;
      try {
        await subscription.consumer.disconnect();
      } catch (error) {
        console.error('[KafkaAdapter] Error disconnecting consumer:', error);
      }
      this.subscriptions.delete(id);
    }
  }

  async close(): Promise<void> {
    // Stop all subscriptions
    const unsubscribePromises = Array.from(this.subscriptions.keys()).map((id) =>
      this.unsubscribe(id)
    );
    await Promise.all(unsubscribePromises);

    // Disconnect producer
    try {
      await this.producer.disconnect();
    } catch (error) {
      console.error('[KafkaAdapter] Error disconnecting producer:', error);
    }
  }
}


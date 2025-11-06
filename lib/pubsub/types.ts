/**
 * Core types for pub/sub abstraction
 */

export interface MessageEnvelope {
  trace_id?: string;
  interaction_id: string;
  tenant_id: string;
  timestamp_ms: number;
  [key: string]: any;
}

export interface SubscriptionHandle {
  id: string;
  topic: string;
  unsubscribe: () => Promise<void>;
}

export interface PubSubAdapter {
  /**
   * Publish a message to a topic
   * @param topic Topic name
   * @param message Message payload (will be wrapped in envelope)
   * @returns Message ID (for streams) or void
   */
  publish(topic: string, message: any): Promise<string | void>;

  /**
   * Subscribe to a topic
   * @param topic Topic name
   * @param handler Message handler function
   * @returns Subscription handle for unsubscribing
   */
  subscribe(
    topic: string,
    handler: (msg: MessageEnvelope) => Promise<void>
  ): Promise<SubscriptionHandle>;

  /**
   * Acknowledge a message (for streams with ack semantics)
   * @param handle Subscription handle
   * @param msgId Message ID to acknowledge
   */
  ack(handle: SubscriptionHandle, msgId: string): Promise<void>;

  /**
   * Close the adapter and cleanup resources
   */
  close(): Promise<void>;
}

export interface PubSubConfig {
  adapter: 'redis_streams' | 'kafka' | 'in_memory';
  redis?: {
    url?: string;
    consumerGroup?: string;
    consumerName?: string;
  };
  kafka?: {
    brokers?: string[];
    clientId?: string;
    consumerGroup?: string;
  };
}


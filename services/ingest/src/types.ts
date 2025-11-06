/**
 * Core types for the ingestion service
 */

export interface StartEvent {
  event: 'start';
  interaction_id: string;
  tenant_id: string;
  sample_rate: number;
  encoding: 'pcm16';
}

export interface AckEvent {
  event: 'ack';
  seq: number;
}

export interface AudioFrame {
  tenant_id: string;
  interaction_id: string;
  seq: number;
  timestamp_ms: number;
  sample_rate: number;
  encoding: 'pcm16';
  audio: Buffer;
}

export interface ConnectionState {
  interactionId: string;
  tenantId: string;
  sampleRate: number;
  encoding: 'pcm16';
  seq: number;
  frameBuffer: Buffer[];
  bufferStartTime: number;
  lastAckSeq: number;
}

export interface PubSubAdapter {
  publish(event: AudioFrame): Promise<void>;
}

export interface JWTPayload {
  tenant_id?: string;
  interaction_id?: string;
  exp?: number;
  iat?: number;
  [key: string]: any;
}


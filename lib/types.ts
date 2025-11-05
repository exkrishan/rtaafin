/**
 * Shared TypeScript types for RTAA
 * Used across ingest, intent detection, realtime, and UI modules
 */

/**
 * KB Article from knowledge base search
 */
export interface KBArticle {
  id: string;
  title: string;
  snippet: string;
  url?: string;
  tags?: string[];
}

/**
 * Intent detection result from LLM
 */
export interface IntentResult {
  intent: string;
  confidence: number;
}

/**
 * Transcript chunk from ingestion
 */
export interface IngestChunk {
  callId: string;
  seq: number;
  ts: string;
  text: string;
}

/**
 * Real-time event types for SSE/WebSocket broadcast
 */
export type RealtimeEventType = 'intent_update' | 'transcript_line' | 'call_end';

/**
 * Real-time event payload
 */
export interface RealtimeEvent {
  type: RealtimeEventType;
  callId: string;
  seq?: number;

  // For transcript_line events
  text?: string;
  ts?: string;

  // For intent_update events
  intent?: string;
  confidence?: number;
  articles?: KBArticle[];
}

/**
 * SSE client connection metadata
 */
export interface SseClient {
  id: string;
  callId: string | null; // null for global subscription
  send: (event: RealtimeEvent) => void;
  close: () => void;
}

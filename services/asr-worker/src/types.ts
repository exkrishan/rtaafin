/**
 * Core types for ASR worker
 */

export interface PartialTranscript {
  type: 'partial';
  text: string;
  confidence?: number;
  isFinal: false;
}

export interface FinalTranscript {
  type: 'final';
  text: string;
  confidence?: number;
  isFinal: true;
}

export type Transcript = PartialTranscript | FinalTranscript;

export interface AsrProvider {
  /**
   * Send audio chunk to ASR provider
   * @param audio Audio buffer (PCM16)
   * @param opts Options including interaction ID, sequence, sample rate
   * @returns Partial or final transcript
   */
  sendAudioChunk(
    audio: Buffer,
    opts: {
      interactionId: string;
      seq: number;
      sampleRate: number;
    }
  ): Promise<Transcript>;

  /**
   * Close the provider and cleanup resources
   */
  close(): Promise<void>;
}

export interface AudioFrameMessage {
  tenant_id: string;
  interaction_id: string;
  seq: number;
  timestamp_ms: number;
  sample_rate: number;
  encoding: 'pcm16';
  audio: string; // base64 encoded
}

export interface TranscriptMessage {
  interaction_id: string;
  tenant_id: string;
  seq: number;
  type: 'partial' | 'final';
  text: string;
  confidence?: number;
  timestamp_ms: number;
}

export interface Metrics {
  audioChunksProcessed: number;
  firstPartialLatencyMs: number | null;
  errors: number;
  lastError: string | null;
}


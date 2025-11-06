/**
 * Metrics collection for ASR worker
 * Exposes Prometheus-compatible metrics
 */

import { Metrics } from './types';

export class MetricsCollector {
  private metrics: Metrics = {
    audioChunksProcessed: 0,
    firstPartialLatencyMs: null,
    errors: 0,
    lastError: null,
  };

  private startTimes: Map<string, number> = new Map(); // interactionId -> start time

  recordAudioChunk(interactionId: string): void {
    this.metrics.audioChunksProcessed++;

    // Track first chunk time for latency calculation
    if (!this.startTimes.has(interactionId)) {
      this.startTimes.set(interactionId, Date.now());
    }
  }

  recordFirstPartial(interactionId: string): void {
    const startTime = this.startTimes.get(interactionId);
    if (startTime && this.metrics.firstPartialLatencyMs === null) {
      this.metrics.firstPartialLatencyMs = Date.now() - startTime;
    }
  }

  recordError(error: string): void {
    this.metrics.errors++;
    this.metrics.lastError = error;
  }

  resetInteraction(interactionId: string): void {
    this.startTimes.delete(interactionId);
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  /**
   * Export metrics in Prometheus text format
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Counter: total audio chunks processed
    lines.push(`# HELP asr_audio_chunks_processed_total Total number of audio chunks processed`);
    lines.push(`# TYPE asr_audio_chunks_processed_total counter`);
    lines.push(`asr_audio_chunks_processed_total ${this.metrics.audioChunksProcessed}`);

    // Gauge: first partial latency
    if (this.metrics.firstPartialLatencyMs !== null) {
      lines.push(`# HELP asr_first_partial_latency_ms Latency to first partial transcript in milliseconds`);
      lines.push(`# TYPE asr_first_partial_latency_ms gauge`);
      lines.push(`asr_first_partial_latency_ms ${this.metrics.firstPartialLatencyMs}`);
    }

    // Counter: total errors
    lines.push(`# HELP asr_errors_total Total number of ASR errors`);
    lines.push(`# TYPE asr_errors_total counter`);
    lines.push(`asr_errors_total ${this.metrics.errors}`);

    // Info: last error (as a label on error counter)
    if (this.metrics.lastError) {
      lines.push(`# HELP asr_last_error Last error message`);
      lines.push(`# TYPE asr_last_error gauge`);
      lines.push(`asr_last_error{error="${this.metrics.lastError.replace(/"/g, '\\"')}"} 1`);
    }

    return lines.join('\n') + '\n';
  }

  reset(): void {
    this.metrics = {
      audioChunksProcessed: 0,
      firstPartialLatencyMs: null,
      errors: 0,
      lastError: null,
    };
    this.startTimes.clear();
  }
}


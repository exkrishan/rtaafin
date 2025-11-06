/**
 * Unit tests for metrics collector
 */

import { MetricsCollector } from '../src/metrics';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  it('should record audio chunks', () => {
    collector.recordAudioChunk('int-1');
    collector.recordAudioChunk('int-1');
    collector.recordAudioChunk('int-2');

    const metrics = collector.getMetrics();
    expect(metrics.audioChunksProcessed).toBe(3);
  });

  it('should record first partial latency', () => {
    const interactionId = 'int-1';
    collector.recordAudioChunk(interactionId);

    // Wait a bit
    const start = Date.now();
    while (Date.now() - start < 10) {
      // Small delay
    }

    collector.recordFirstPartial(interactionId);

    const metrics = collector.getMetrics();
    expect(metrics.firstPartialLatencyMs).toBeGreaterThan(0);
  });

  it('should record errors', () => {
    collector.recordError('Test error');
    collector.recordError('Another error');

    const metrics = collector.getMetrics();
    expect(metrics.errors).toBe(2);
    expect(metrics.lastError).toBe('Another error');
  });

  it('should export Prometheus format', () => {
    collector.recordAudioChunk('int-1');
    collector.recordError('Test error');

    const prometheus = collector.exportPrometheus();

    expect(prometheus).toContain('asr_audio_chunks_processed_total');
    expect(prometheus).toContain('asr_errors_total');
    expect(prometheus).toContain('# TYPE');
    expect(prometheus).toContain('# HELP');
  });

  it('should reset metrics', () => {
    collector.recordAudioChunk('int-1');
    collector.recordError('Test error');

    collector.reset();

    const metrics = collector.getMetrics();
    expect(metrics.audioChunksProcessed).toBe(0);
    expect(metrics.errors).toBe(0);
    expect(metrics.firstPartialLatencyMs).toBeNull();
  });
});


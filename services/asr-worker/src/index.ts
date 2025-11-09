/**
 * ASR Worker - Streaming speech recognition service
 * 
 * Subscribes to audio topics, processes audio through ASR provider,
 * and publishes transcript events to transcript topics.
 */

import { createServer } from 'http';
import { createPubSubAdapterFromEnv } from '@rtaa/pubsub';
import { audioTopic, transcriptTopic, callEndTopic } from '@rtaa/pubsub/topics';
import { createAsrProvider } from './providers';
import { AudioFrameMessage, TranscriptMessage } from './types';
import { MetricsCollector } from './metrics';

// Load environment variables from project root .env.local
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env.local') });

const PORT = parseInt(process.env.PORT || '3001', 10);

// Deepgram-optimized chunk sizing configuration
// Deepgram recommends 20-250ms chunks for optimal real-time performance
// CRITICAL: Minimum chunk size for reliable transcription is 100ms (not 20ms)
// 20ms is the absolute minimum Deepgram accepts, but 100ms+ is needed for accuracy
// Initial chunk: 200ms minimum for reliable transcription start
const INITIAL_CHUNK_DURATION_MS = parseInt(process.env.INITIAL_CHUNK_DURATION_MS || '200', 10);
// Continuous chunks: 100ms for real-time streaming
const CONTINUOUS_CHUNK_DURATION_MS = parseInt(process.env.CONTINUOUS_CHUNK_DURATION_MS || '100', 10);
// Maximum chunk size: 250ms per Deepgram recommendation
const MAX_CHUNK_DURATION_MS = parseInt(process.env.MAX_CHUNK_DURATION_MS || '250', 10);
// Minimum audio duration before processing (reduced from 500ms to 200ms)
const MIN_AUDIO_DURATION_MS = parseInt(process.env.MIN_AUDIO_DURATION_MS || '200', 10);
// CRITICAL: Minimum chunk size for continuous streaming (increased from 20ms to 100ms)
// Deepgram needs at least 100ms of contiguous audio for reliable transcription
const ASR_CHUNK_MIN_MS = parseInt(process.env.ASR_CHUNK_MIN_MS || '100', 10);

// Legacy buffer window (kept for backward compatibility, but not used for Deepgram)
const BUFFER_WINDOW_MS = parseInt(process.env.BUFFER_WINDOW_MS || '1000', 10);
// Stale buffer timeout: if no new audio arrives for this duration, clean up the buffer
// This prevents processing old audio after a call has ended
const STALE_BUFFER_TIMEOUT_MS = parseInt(process.env.STALE_BUFFER_TIMEOUT_MS || '5000', 10); // 5 seconds
const ASR_PROVIDER = (process.env.ASR_PROVIDER || 'mock') as 'mock' | 'deepgram' | 'whisper';

interface AudioBuffer {
  interactionId: string;
  tenantId: string;
  sampleRate: number;
  chunks: Buffer[];
  timestamps: number[];
  lastProcessed: number;
  lastChunkReceived: number; // Timestamp of last audio chunk received
  hasSentInitialChunk: boolean; // Track if we've sent the initial 500ms chunk
  isProcessing: boolean; // Prevent concurrent processing of the same buffer
  lastContinuousSendTime: number; // Timestamp of last continuous chunk send (doesn't reset on buffer clear)
  processTimer?: NodeJS.Timeout; // Timer for periodic processing (ensures sends every 200ms)
}

class AsrWorker {
  private pubsub: ReturnType<typeof createPubSubAdapterFromEnv>;
  private asrProvider: ReturnType<typeof createAsrProvider>;
  private buffers: Map<string, AudioBuffer> = new Map();
  private metrics: MetricsCollector;
  private server: ReturnType<typeof createServer>;
  private subscriptions: any[] = [];
  private bufferTimers: Map<string, NodeJS.Timeout> = new Map(); // Track timers per buffer for cleanup

  constructor() {
    this.pubsub = createPubSubAdapterFromEnv();
    
    // Validate provider configuration before creating
    // This ensures we fail fast if required env vars are missing
    if (ASR_PROVIDER === 'deepgram' && !process.env.DEEPGRAM_API_KEY) {
      console.error('[ASRWorker] ❌ CRITICAL: ASR_PROVIDER=deepgram but DEEPGRAM_API_KEY is not set!');
      console.error('[ASRWorker] The system will NOT fall back to mock provider.');
      console.error('[ASRWorker] Please set DEEPGRAM_API_KEY environment variable or change ASR_PROVIDER to "mock".');
      throw new Error(
        'DEEPGRAM_API_KEY is required when ASR_PROVIDER=deepgram. ' +
        'No fallback to mock provider - this ensures proper testing.'
      );
    }
    
    try {
      this.asrProvider = createAsrProvider(ASR_PROVIDER);
    } catch (error: any) {
      console.error('[ASRWorker] ❌ Failed to create ASR provider:', error.message);
      console.error('[ASRWorker] Provider type:', ASR_PROVIDER);
      console.error('[ASRWorker] This is a fatal error - service will not start.');
      throw error; // Re-throw to fail fast
    }
    
    this.metrics = new MetricsCollector();

    // Create HTTP server for metrics endpoint
    this.server = createServer((req, res) => {
      if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(this.metrics.exportPrometheus());
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Type-safe health check - check if provider has connections map
        const health: any = {
          status: 'ok',
          service: 'asr-worker',
          provider: ASR_PROVIDER,
          activeBuffers: this.buffers.size,
        };
        
        // Safely check for Deepgram provider connections and metrics
        try {
          const providerAny = this.asrProvider as any;
          if (providerAny.connections && typeof providerAny.connections.size === 'number') {
            health.activeConnections = providerAny.connections.size;
          } else {
            health.activeConnections = 'N/A';
          }
          
          // Add Deepgram metrics if available
          if (providerAny.getMetrics && typeof providerAny.getMetrics === 'function') {
            const deepgramMetrics = providerAny.getMetrics();
            health.deepgramMetrics = {
              connectionsCreated: deepgramMetrics.connectionsCreated,
              connectionsReused: deepgramMetrics.connectionsReused,
              connectionsClosed: deepgramMetrics.connectionsClosed,
              audioChunksSent: deepgramMetrics.audioChunksSent,
              transcriptsReceived: deepgramMetrics.transcriptsReceived,
              emptyTranscriptsReceived: deepgramMetrics.emptyTranscriptsReceived,
              emptyTranscriptRate: deepgramMetrics.transcriptsReceived > 0
                ? ((deepgramMetrics.emptyTranscriptsReceived / deepgramMetrics.transcriptsReceived) * 100).toFixed(1) + '%'
                : '0%',
              errors: deepgramMetrics.errors,
              keepAliveSuccess: deepgramMetrics.keepAliveSuccess,
              keepAliveFailures: deepgramMetrics.keepAliveFailures,
              keepAliveSuccessRate: (deepgramMetrics.keepAliveSuccess + deepgramMetrics.keepAliveFailures) > 0
                ? ((deepgramMetrics.keepAliveSuccess / (deepgramMetrics.keepAliveSuccess + deepgramMetrics.keepAliveFailures)) * 100).toFixed(1) + '%'
                : 'N/A',
              averageChunkSizeMs: deepgramMetrics.averageChunkSizeMs.toFixed(0) + 'ms',
            };
          }
        } catch (e) {
          health.activeConnections = 'N/A';
        }
        
        res.end(JSON.stringify(health));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // Log which ASR provider is active (required for cloud deployment)
    console.info('[ASRWorker] Initialized', {
      provider: ASR_PROVIDER,
      bufferWindowMs: BUFFER_WINDOW_MS,
      minAudioDurationMs: MIN_AUDIO_DURATION_MS,
      port: PORT,
    });
    console.info(`[ASRWorker] Using ASR provider: ${ASR_PROVIDER}`);
  }

  async start(): Promise<void> {
    // Subscribe to audio topics
    // For POC, subscribe to audio_stream (shared stream)
    // In production, would subscribe to audio.{tenant_id} per tenant
    const audioTopicName = audioTopic({ useStreams: true });
    console.info(`[ASRWorker] Subscribing to audio topic: ${audioTopicName}`);

    const audioHandle = await this.pubsub.subscribe(audioTopicName, async (msg) => {
      await this.handleAudioFrame(msg as any);
    });

    this.subscriptions.push(audioHandle);

    // Subscribe to call end events to clean up buffers
    const callEndTopicName = callEndTopic();
    console.info(`[ASRWorker] Subscribing to call end topic: ${callEndTopicName}`);

    const callEndHandle = await this.pubsub.subscribe(callEndTopicName, async (msg) => {
      await this.handleCallEnd(msg as any);
    });

    this.subscriptions.push(callEndHandle);

    // Start periodic stale buffer cleanup
    this.startStaleBufferCleanup();

    // Start HTTP server
    this.server.listen(PORT, () => {
      console.info(`[ASRWorker] Server listening on port ${PORT}`);
      console.info(`[ASRWorker] Metrics: http://localhost:${PORT}/metrics`);
      console.info(`[ASRWorker] Health: http://localhost:${PORT}/health`);
    });
  }

  private async handleAudioFrame(msg: any): Promise<void> {
    try {
      // Validate audio field exists and is a string
      if (!msg.audio || typeof msg.audio !== 'string') {
        console.error('[ASRWorker] ❌ Invalid audio field in message:', {
          interaction_id: msg.interaction_id,
          seq: msg.seq,
          audio_type: typeof msg.audio,
          audio_length: msg.audio?.length,
          msg_keys: Object.keys(msg),
        });
        return;
      }

      // Log raw audio field for first few frames to debug
      if (msg.seq === undefined || msg.seq < 3) {
        console.info('[ASRWorker] 🔍 Raw audio field received:', {
          interaction_id: msg.interaction_id,
          seq: msg.seq,
          audio_type: typeof msg.audio,
          audio_length: msg.audio?.length,
          audio_preview: msg.audio?.substring(0, 100),
          first_20_chars: msg.audio?.substring(0, 20),
        });
      }

      // CRITICAL: Check if audio field contains JSON instead of base64
      const audioPreview = msg.audio.substring(0, 20).trim();
      if (audioPreview.startsWith('{') || audioPreview.startsWith('[')) {
        console.error('[ASRWorker] ❌ CRITICAL: Audio field contains JSON text, not base64!', {
          interaction_id: msg.interaction_id,
          seq: msg.seq,
          audio_preview: msg.audio.substring(0, 200),
          full_msg: JSON.stringify(msg).substring(0, 500),
        });
        return;
      }

      // Validate base64 format
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(msg.audio)) {
        console.error('[ASRWorker] ❌ Invalid base64 format in audio field:', {
          interaction_id: msg.interaction_id,
          seq: msg.seq,
          audio_preview: msg.audio.substring(0, 100),
        });
        return;
      }

      // Parse audio frame message
      const frame: AudioFrameMessage = {
        tenant_id: msg.tenant_id,
        interaction_id: msg.interaction_id,
        seq: msg.seq,
        timestamp_ms: msg.timestamp_ms || Date.now(),
        sample_rate: msg.sample_rate || 24000,
        encoding: msg.encoding || 'pcm16',
        audio: msg.audio, // base64 string
      };

      const { interaction_id, tenant_id, seq, sample_rate, audio } = frame;

      // Get or create buffer for this interaction
      let buffer = this.buffers.get(interaction_id);
      if (!buffer) {
        buffer = {
          interactionId: interaction_id,
          tenantId: tenant_id,
          sampleRate: sample_rate,
          chunks: [],
          timestamps: [],
          lastProcessed: Date.now(),
          lastChunkReceived: Date.now(),
          hasSentInitialChunk: false, // Haven't sent initial chunk yet
          isProcessing: false, // Not currently processing
          lastContinuousSendTime: 0, // Will be set after initial chunk
        };
        this.buffers.set(interaction_id, buffer);
      }

      // Update last chunk received timestamp
      buffer.lastChunkReceived = Date.now();

      // Decode base64 audio
      let audioBuffer: Buffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (error: any) {
        console.error('[ASRWorker] ❌ Failed to decode base64 audio:', {
          interaction_id,
          seq,
          error: error.message,
          audio_preview: audio.substring(0, 100),
        });
        return;
      }

      // Validate decoded buffer is not empty and looks like audio (not JSON)
      if (audioBuffer.length === 0) {
        console.warn('[ASRWorker] ⚠️ Empty audio buffer decoded:', {
          interaction_id,
          seq,
        });
        return;
      }

      // Check first few bytes - should be binary audio, not JSON text
      const firstBytes = Array.from(audioBuffer.slice(0, Math.min(8, audioBuffer.length)));
      if (firstBytes[0] === 0x7b || firstBytes[0] === 0x5b) { // '{' or '['
        const firstBytesHex = firstBytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ');
        
        // Try to parse as JSON to see what Exotel is actually sending
        try {
          const jsonText = audioBuffer.toString('utf8');
          const parsedJson = JSON.parse(jsonText);
          
          // Log detailed error with parsed JSON structure
          console.error('[ASRWorker] ❌ CRITICAL: Decoded audio buffer contains JSON text!', {
            interaction_id,
            seq,
            first_bytes_hex: firstBytesHex,
            buffer_length: audioBuffer.length,
            audio_field_length: audio.length,
            parsed_json_keys: Object.keys(parsedJson),
            parsed_json_event: parsedJson.event,
            parsed_json_structure: JSON.stringify(parsedJson).substring(0, 1000),
            note: 'This indicates Exotel is sending base64-encoded JSON instead of base64-encoded audio. Check Ingest service logs for [exotel] errors.',
          });
          
          // Log this only once per interaction to avoid spam
          if (seq === 1 || seq === 2) {
            console.error('[ASRWorker] 🔍 Full parsed JSON (first occurrence):', {
              interaction_id,
              seq,
              full_json: JSON.stringify(parsedJson, null, 2),
            });
          }
        } catch (parseError) {
          console.error('[ASRWorker] ❌ CRITICAL: Decoded audio buffer contains JSON text (but not valid JSON)!', {
            interaction_id,
            seq,
            first_bytes_hex: firstBytesHex,
            buffer_length: audioBuffer.length,
            audio_field_length: audio.length,
            buffer_preview: audioBuffer.toString('utf8').substring(0, 200),
            parse_error: parseError instanceof Error ? parseError.message : String(parseError),
          });
        }
        return;
      }

      // COMPREHENSIVE VALIDATION: Verify PCM16 format (16-bit signed integers, little-endian)
      // This ensures audio is valid before sending to Deepgram
      if (audioBuffer.length >= 2) {
        const sampleCount = Math.min(20, Math.floor(audioBuffer.length / 2));
        let validSamples = 0;
        let invalidSamples = 0;
        let allZeros = true;
        const sampleValues: number[] = [];
        
        for (let i = 0; i < sampleCount; i++) {
          const offset = i * 2;
          if (offset + 1 >= audioBuffer.length) break;
          
          // Read as little-endian signed 16-bit integer
          const sample = (audioBuffer[offset] | (audioBuffer[offset + 1] << 8)) << 16 >> 16;
          sampleValues.push(sample);
          
          // Validate range: PCM16 should be in range [-32768, 32767]
          if (sample >= -32768 && sample <= 32767) {
            validSamples++;
            if (sample !== 0) allZeros = false;
          } else {
            invalidSamples++;
          }
        }
        
        // Log warning if format issues detected (only for first few chunks)
        if (invalidSamples > 0 && seq <= 5) {
          console.error('[ASRWorker] ❌ CRITICAL: Audio format validation failed - not valid PCM16!', {
            interaction_id,
            seq,
            validSamples,
            invalidSamples,
            totalChecked: sampleCount,
            sampleValues: sampleValues.slice(0, 10),
            firstBytes: Array.from(audioBuffer.slice(0, 4)).map(b => `0x${b.toString(16).padStart(2, '0')}`),
            note: 'Audio may not be PCM16 format. Expected 16-bit signed integers in range [-32768, 32767].',
          });
          // Don't return - allow it to proceed but log the issue
        }
        
        // Validate sample rate calculation makes sense
        const bytesPerSample = 2; // 16-bit = 2 bytes
        const samples = audioBuffer.length / bytesPerSample;
        const calculatedDurationMs = (samples / sample_rate) * 1000;
        const expectedBytesFor20ms = (sample_rate * 0.02) * 2; // 20ms at declared sample rate
        
        // Warn if audio duration doesn't match expected for declared sample rate
        if (seq <= 5 && Math.abs((expectedBytesFor20ms / audioBuffer.length) * calculatedDurationMs - 20) > 5) {
          console.warn('[ASRWorker] ⚠️ Sample rate validation warning', {
            interaction_id,
            seq,
            declaredSampleRate: sample_rate,
            audioLength: audioBuffer.length,
            calculatedDurationMs: calculatedDurationMs.toFixed(2),
            expectedBytesFor20ms: expectedBytesFor20ms.toFixed(0),
            note: 'Audio duration may not match declared sample rate. Verify actual audio sample rate.',
          });
        }
        
        // Warn if audio is all zeros (silence) - this is normal but worth noting
        if (allZeros && seq <= 3) {
          console.debug('[ASRWorker] ℹ️ Audio appears to be silence (all zeros)', {
            interaction_id,
            seq,
            samplesChecked: sampleCount,
            note: 'This is normal for silence, but may cause empty transcripts from Deepgram.',
          });
        }
      }

      buffer.chunks.push(audioBuffer);
      buffer.timestamps.push(frame.timestamp_ms);
      buffer.lastChunkReceived = Date.now(); // Update last chunk received time

      // CRITICAL: Start/restart processing timer to ensure frequent sends
      // This ensures we check every 200ms if we should send, regardless of chunk arrival frequency
      this.startBufferProcessingTimer(interaction_id);

      // Calculate current audio duration in buffer
      const totalSamples = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / 2; // 16-bit = 2 bytes per sample
      const currentAudioDurationMs = (totalSamples / sample_rate) * 1000;
      
      // Log new chunk arrival to verify new audio is coming in
      console.info(`[ASRWorker] 📥 Received audio chunk:`, {
        interaction_id,
        seq,
        audioSize: audioBuffer.length,
        chunkDurationMs: ((audioBuffer.length / 2) / sample_rate) * 1000,
        totalChunksInBuffer: buffer.chunks.length,
        totalAudioDurationMs: currentAudioDurationMs.toFixed(0),
        bufferAge: Date.now() - buffer.lastProcessed,
        meetsMinimum: currentAudioDurationMs >= MIN_AUDIO_DURATION_MS,
      });

      // Record metrics
      this.metrics.recordAudioChunk(interaction_id);

      // CRITICAL: Deepgram streaming requires CONTINUOUS audio flow
      // Strategy:
      // 1. First chunk: Wait for 500ms minimum before sending (initial chunk)
      // 2. After initial chunk: Send continuously - process every 500-1000ms OR when we have 200ms+ of new audio
      // This ensures Deepgram receives continuous audio, not one chunk then silence
      
      const bufferAge = Date.now() - buffer.lastProcessed;
      
      // Prevent concurrent processing of the same buffer (race condition fix)
      if (buffer.isProcessing) {
        console.debug(`[ASRWorker] ⏸️ Buffer already processing, skipping for ${interaction_id}`);
        return;
      }
      
        if (!buffer.hasSentInitialChunk) {
        // First chunk: Wait for initial chunk duration (200ms, reduced from 500ms)
        // CRITICAL: Also check time since buffer creation to prevent long delays
        // If audio arrives slowly, don't wait forever - send after 1 second max
        const timeSinceBufferCreation = Date.now() - buffer.lastProcessed;
        const MAX_INITIAL_WAIT_MS = 1000; // Send first chunk within 1 second max
        const hasEnoughAudio = currentAudioDurationMs >= INITIAL_CHUNK_DURATION_MS;
        const hasWaitedTooLong = timeSinceBufferCreation >= MAX_INITIAL_WAIT_MS;
        
        // Send if we have enough audio OR if we've waited too long (prevent timeout)
        if (hasEnoughAudio || (hasWaitedTooLong && currentAudioDurationMs >= 20)) {
          // CRITICAL: Don't await processBuffer - it sends audio asynchronously
          // This prevents buffer from being locked during 5-second transcript wait
          buffer.isProcessing = true;
          this.processBuffer(buffer, hasWaitedTooLong).then(() => {
            // Clear processing flag after send completes (not after transcript arrives)
            buffer.isProcessing = false;
            buffer.lastProcessed = Date.now();
            buffer.hasSentInitialChunk = true;
            buffer.lastContinuousSendTime = Date.now();
            if (hasWaitedTooLong) {
              console.warn(`[ASRWorker] ⚠️ First chunk sent early (${currentAudioDurationMs.toFixed(0)}ms) due to timeout risk (${timeSinceBufferCreation}ms wait)`, {
                interaction_id,
                audioDuration: currentAudioDurationMs.toFixed(0),
                waitTime: timeSinceBufferCreation,
              });
            }
          }).catch((error: any) => {
            buffer.isProcessing = false;
            console.error(`[ASRWorker] Error processing initial chunk for ${interaction_id}:`, error);
            this.metrics.recordError(error.message || String(error));
          });
        }
      } else {
        // After initial chunk: Stream continuously with Deepgram-optimized sizing
        // CRITICAL: Timer-based processing handles ALL continuous streaming
        // Event-driven processing is DISABLED for continuous mode to avoid race conditions
        // The timer checks every 200ms and sends when needed, ensuring continuous audio flow
        
        // Initialize lastContinuousSendTime if needed (for timer to calculate time since last send)
        if (buffer.lastContinuousSendTime === 0) {
          buffer.lastContinuousSendTime = buffer.lastProcessed;
        }
        
        // Just log that chunk was received - timer will handle all sending
        const timeSinceLastSend = buffer.lastContinuousSendTime > 0 ? Date.now() - buffer.lastContinuousSendTime : 'never';
        console.debug(`[ASRWorker] 📥 Chunk received (continuous mode) - timer will handle sending for ${interaction_id}`, {
          chunksCount: buffer.chunks.length,
          totalAudioDurationMs: currentAudioDurationMs.toFixed(0),
          timeSinceLastSend: timeSinceLastSend,
          note: 'Timer checks every 200ms and sends when needed',
        });
      }
    } catch (error: any) {
      console.error('[ASRWorker] Error handling audio frame:', error);
      this.metrics.recordError(error.message || String(error));
    }
  }

  private async handleCallEnd(msg: any): Promise<void> {
    try {
      const interactionId = msg.interaction_id;
      if (!interactionId) {
        console.warn('[ASRWorker] Call end event missing interaction_id:', msg);
        return;
      }

      console.info('[ASRWorker] Call end event received', {
        interaction_id: interactionId,
        reason: msg.reason,
        call_sid: msg.call_sid,
      });

      // Clean up buffer for this interaction
      const buffer = this.buffers.get(interactionId);
      if (buffer) {
        console.info('[ASRWorker] Cleaning up buffer for ended call', {
          interaction_id: interactionId,
          chunksCount: buffer.chunks.length,
        });
        
        // CRITICAL: Clear processing timer
        const timer = this.bufferTimers.get(interactionId);
        if (timer) {
          clearInterval(timer);
          this.bufferTimers.delete(interactionId);
        }
        
        this.buffers.delete(interactionId);
        this.metrics.resetInteraction(interactionId);
        
        // Close ASR provider connection for this specific interaction if supported
        try {
          // Check if provider supports closing a specific connection (e.g., Deepgram)
          if (typeof (this.asrProvider as any).closeConnection === 'function') {
            await (this.asrProvider as any).closeConnection(interactionId);
          }
        } catch (error: any) {
          console.warn('[ASRWorker] Error closing ASR provider connection:', error.message);
        }
      } else {
        console.debug('[ASRWorker] No buffer found for ended call', {
          interaction_id: interactionId,
        });
      }
    } catch (error: any) {
      console.error('[ASRWorker] Error handling call end event:', error);
      this.metrics.recordError(error.message || String(error));
    }
  }

  private startStaleBufferCleanup(): void {
    // Check for stale buffers every 2 seconds
    setInterval(() => {
      const now = Date.now();
      const staleBuffers: string[] = [];

      for (const [interactionId, buffer] of this.buffers.entries()) {
        const timeSinceLastChunk = now - buffer.lastChunkReceived;
        // CRITICAL: Don't clean up buffers that have sent initial chunk but are waiting for continuous streaming
        // Only clean up if no audio received AND no initial chunk sent (call never started)
        // OR if no audio received for a very long time (call definitely ended)
        const isStale = timeSinceLastChunk >= STALE_BUFFER_TIMEOUT_MS;
        const hasNoInitialChunk = !buffer.hasSentInitialChunk;
        const isVeryStale = timeSinceLastChunk >= (STALE_BUFFER_TIMEOUT_MS * 2); // 10 seconds
        
        if (isStale && (hasNoInitialChunk || isVeryStale)) {
          staleBuffers.push(interactionId);
        }
      }

      // Clean up stale buffers
      for (const interactionId of staleBuffers) {
        const buffer = this.buffers.get(interactionId);
        if (buffer) {
          console.warn('[ASRWorker] Cleaning up stale buffer (no audio received)', {
            interaction_id: interactionId,
            timeSinceLastChunk: now - buffer.lastChunkReceived,
            chunksCount: buffer.chunks.length,
          });
          
          // CRITICAL: Clear processing timer
          const timer = this.bufferTimers.get(interactionId);
          if (timer) {
            clearInterval(timer);
            this.bufferTimers.delete(interactionId);
          }
          
          this.buffers.delete(interactionId);
          this.metrics.resetInteraction(interactionId);
        }
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * CRITICAL: Timer-based processing to ensure audio is sent every 200ms
   * This prevents Deepgram timeouts (1011) when chunks arrive slowly
   * 
   * The timer checks every 200ms if we should send audio, regardless of when chunks arrive.
   * This ensures continuous audio flow even if chunks arrive every 3 seconds.
   */
  private startBufferProcessingTimer(interactionId: string): void {
    // Clear existing timer if any
    const existingTimer = this.bufferTimers.get(interactionId);
    if (existingTimer) {
      clearInterval(existingTimer);
      console.debug(`[ASRWorker] 🔄 Restarting timer for ${interactionId}`);
    } else {
      console.info(`[ASRWorker] 🚀 Starting timer for ${interactionId} (checks every 200ms)`);
    }

    // Start new timer: check every 200ms
    const PROCESSING_TIMER_INTERVAL_MS = 200; // Check every 200ms
    const timer = setInterval(async () => {
      const buffer = this.buffers.get(interactionId);
      if (!buffer) {
        // Buffer was cleaned up, clear timer
        clearInterval(timer);
        this.bufferTimers.delete(interactionId);
        return;
      }

      // Skip if already processing or no chunks
      if (buffer.isProcessing || buffer.chunks.length === 0) {
        if (buffer.chunks.length === 0) {
          // Log when timer runs but buffer is empty (for debugging)
          console.debug(`[ASRWorker] ⏸️ Timer tick: buffer empty for ${interactionId}`, {
            timeSinceLastSend: buffer.lastContinuousSendTime > 0 ? Date.now() - buffer.lastContinuousSendTime : 'never',
            hasSentInitialChunk: buffer.hasSentInitialChunk,
          });
        }
        return;
      }

      // Only process if we've sent initial chunk (continuous mode)
      // Initial chunk logic is handled in handleAudioFrame
      if (!buffer.hasSentInitialChunk) {
        return;
      }
      
      // Log timer tick for debugging
      console.debug(`[ASRWorker] ⏰ Timer tick for ${interactionId}`, {
        chunksCount: buffer.chunks.length,
        isProcessing: buffer.isProcessing,
        hasSentInitialChunk: buffer.hasSentInitialChunk,
      });

      // Calculate current audio duration
      const totalSamples = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / 2;
      const currentAudioDurationMs = (totalSamples / buffer.sampleRate) * 1000;

      // Initialize lastContinuousSendTime if needed
      if (buffer.lastContinuousSendTime === 0) {
        buffer.lastContinuousSendTime = buffer.lastProcessed;
      }

      const timeSinceLastContinuousSend = Date.now() - buffer.lastContinuousSendTime;
      
      // CRITICAL FIX: Updated thresholds for aggregation
      // Minimum 100ms chunks, max 200ms gaps (prevents 8-9s gaps)
      // These values are optimized for Deepgram's requirements:
      // - Deepgram recommends 20-250ms chunks
      // - Minimum 100ms ensures reliable transcription
      // - Max 200ms gaps prevent timeouts (Deepgram closes after ~5-10s inactivity)
      const MIN_CHUNK_DURATION_MS = 100; // Minimum chunk size for reliable transcription
      const MAX_TIME_BETWEEN_SENDS_MS = 200; // Maximum gap between sends (prevents timeout)
      const MIN_CHUNK_FOR_TIMEOUT_PREVENTION_MS = 20; // Minimum for timeout prevention (Deepgram's absolute minimum)
      
      const isTooLongSinceLastSend = timeSinceLastContinuousSend >= MAX_TIME_BETWEEN_SENDS_MS;
      const hasMinimumChunkSize = currentAudioDurationMs >= MIN_CHUNK_DURATION_MS;
      const hasEnoughForTimeoutPrevention = currentAudioDurationMs >= MIN_CHUNK_FOR_TIMEOUT_PREVENTION_MS;
      const exceedsMaxChunkSize = currentAudioDurationMs >= MAX_CHUNK_DURATION_MS;

      // Process if:
      // 1. Gap > 200ms AND we have at least 20ms (timeout risk) - FORCE SEND
      // 2. We have >= 100ms (normal case) - SEND
      // 3. Buffer exceeds max chunk size (250ms) - SEND (split)
      const shouldProcess = 
        (isTooLongSinceLastSend && hasEnoughForTimeoutPrevention) ||
        hasMinimumChunkSize ||
        exceedsMaxChunkSize;

      // Minimum chunk for send: 20ms if timeout risk, 100ms normally
      const minChunkForSend = isTooLongSinceLastSend ? MIN_CHUNK_FOR_TIMEOUT_PREVENTION_MS : MIN_CHUNK_DURATION_MS;
      
      if (shouldProcess && currentAudioDurationMs >= minChunkForSend) {
        // Enhanced logging for chunk aggregation decisions
        console.debug(`[ASRWorker] 🎯 Timer: Processing buffer for ${interactionId}`, {
          currentAudioDurationMs: currentAudioDurationMs.toFixed(0),
          timeSinceLastSend: timeSinceLastContinuousSend,
          chunksCount: buffer.chunks.length,
          reason: isTooLongSinceLastSend ? 'timeout-prevention' : (exceedsMaxChunkSize ? 'max-size' : 'optimal-chunk'),
          minRequired: minChunkForSend,
        });
        // CRITICAL: Don't await processBuffer - it sends audio asynchronously
        // This prevents buffer from being locked during 5-second transcript wait
        buffer.isProcessing = true;
        const chunksBeforeProcessing = buffer.chunks.length;
        const audioDurationBeforeProcessing = currentAudioDurationMs;
        
        // Fire and forget - processBuffer handles async transcript response
        this.processBuffer(buffer, isTooLongSinceLastSend).then(() => {
          // Clear processing flag after send completes (not after transcript arrives)
          buffer.isProcessing = false;
          
          if (buffer.chunks.length < chunksBeforeProcessing) {
            buffer.lastProcessed = Date.now();
            buffer.lastContinuousSendTime = Date.now();
            console.info(`[ASRWorker] ✅ Timer-triggered send completed for ${interactionId}`, {
              timeSinceLastSend: timeSinceLastContinuousSend,
              audioDuration: audioDurationBeforeProcessing.toFixed(0),
              chunksCount: chunksBeforeProcessing,
              chunksRemaining: buffer.chunks.length,
              strategy: isTooLongSinceLastSend ? 'timeout-prevention' : 'optimal-chunk',
            });
          }
        }).catch((error: any) => {
          buffer.isProcessing = false;
          console.error(`[ASRWorker] Error in timer-based processing for ${interactionId}:`, error);
          this.metrics.recordError(error.message || String(error));
        });
      }
    }, PROCESSING_TIMER_INTERVAL_MS);

    this.bufferTimers.set(interactionId, timer);
  }

  /**
   * Helper method to send audio to ASR provider
   * Extracted for reuse in chunk splitting logic
   */
  private async sendToAsrProvider(
    audio: Buffer,
    buffer: AudioBuffer,
    seq: number
  ): Promise<any> {
    return await this.asrProvider.sendAudioChunk(audio, {
      interactionId: buffer.interactionId,
      seq,
      sampleRate: buffer.sampleRate,
    });
  }

  private async processBuffer(buffer: AudioBuffer, isTimeoutRisk: boolean = false): Promise<void> {
    if (buffer.chunks.length === 0) {
      return;
    }

    try {
      // CRITICAL FIX: Aggregation to prevent 20ms chunks with 8-9s gaps
      // Deepgram requires continuous stream with <500ms gaps
      // Strategy: Aggregate to minimum 100ms chunks, send after max 200ms wait
      const MIN_CHUNK_DURATION_MS = 100; // Minimum 100ms for reliable transcription
      const MAX_WAIT_MS = 200; // Maximum 200ms between sends (prevents gaps)
      const INITIAL_BURST_MS = 250; // Initial burst 200-300ms for faster first transcript
      
      // Calculate total audio in buffer
      const totalBytes = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const totalSamples = totalBytes / 2;
      const totalAudioDurationMs = (totalSamples / buffer.sampleRate) * 1000;
      
      // Calculate time since last send
      const timeSinceLastSend = buffer.lastContinuousSendTime > 0 
        ? Date.now() - buffer.lastContinuousSendTime 
        : (buffer.hasSentInitialChunk ? Date.now() - buffer.lastProcessed : 0);
      
      // Calculate time since buffer creation (for initial chunk)
      const timeSinceBufferCreation = Date.now() - buffer.lastProcessed;
      
      // Determine required duration based on mode
      let requiredDuration: number;
      if (!buffer.hasSentInitialChunk) {
        // Initial chunk: Require 250ms burst OR send after 1s max wait
        const MAX_INITIAL_WAIT_MS = 1000;
        if (timeSinceBufferCreation >= MAX_INITIAL_WAIT_MS && totalAudioDurationMs >= 20) {
          // Force send if waited too long (prevent timeout)
          requiredDuration = 20;
        } else {
          requiredDuration = INITIAL_BURST_MS;
        }
      } else {
        // Continuous mode: Send if we have 100ms OR if 200ms has passed (prevent gaps)
        if (timeSinceLastSend >= MAX_WAIT_MS && totalAudioDurationMs >= 20) {
          // Force send to prevent gap > 200ms (timeout risk)
          requiredDuration = 20;
        } else {
          // Normal case: wait for 100ms minimum
          requiredDuration = MIN_CHUNK_DURATION_MS;
        }
      }
      
      // Calculate how many bytes we need
      const requiredSamples = Math.floor((requiredDuration * buffer.sampleRate) / 1000);
      const requiredBytes = requiredSamples * 2; // 16-bit = 2 bytes per sample
      
      // Check if we have enough audio OR if timeout risk forces send
      const hasEnoughAudio = totalBytes >= requiredBytes;
      const isTimeoutRisk = timeSinceLastSend >= MAX_WAIT_MS && totalAudioDurationMs >= 20;
      
      if (!hasEnoughAudio && !isTimeoutRisk) {
        console.debug(`[ASRWorker] ⏳ Buffer too small (${totalAudioDurationMs.toFixed(0)}ms < ${requiredDuration}ms), waiting for more audio`, {
          interaction_id: buffer.interactionId,
          chunksCount: buffer.chunks.length,
          audioDurationMs: totalAudioDurationMs.toFixed(0),
          minimumRequired: requiredDuration,
          timeSinceLastSend: timeSinceLastSend > 0 ? timeSinceLastSend + 'ms' : 'never',
          mode: buffer.hasSentInitialChunk ? 'continuous' : 'initial',
        });
        return; // Don't process yet - wait for more audio
      }
      
      // CRITICAL: Only send the required amount, keep remaining chunks in buffer
      // This allows chunks to accumulate while we wait for transcript
      let bytesToSend = 0;
      let chunksToSend: Buffer[] = [];
      let timestampsToSend: number[] = [];
      
      // Collect chunks until we have enough audio
      for (let i = 0; i < buffer.chunks.length; i++) {
        const chunk = buffer.chunks[i];
        if (bytesToSend + chunk.length <= requiredBytes || chunksToSend.length === 0) {
          // Include this chunk (or first chunk even if it exceeds limit)
          chunksToSend.push(chunk);
          timestampsToSend.push(buffer.timestamps[i]);
          bytesToSend += chunk.length;
        } else {
          break; // Keep remaining chunks in buffer
        }
      }
      
      if (chunksToSend.length === 0) {
        return;
      }
      
      // Combine chunks to send
      const audioToSend = Buffer.concat(chunksToSend);
      const audioDurationToSend = (audioToSend.length / 2 / buffer.sampleRate) * 1000;
      const seq = chunksToSend.length;
      
      // Log audio details before sending
      console.info(`[ASRWorker] Processing audio buffer:`, {
        interaction_id: buffer.interactionId,
        seq,
        sampleRate: buffer.sampleRate,
        audioSize: audioToSend.length,
        audioDurationMs: audioDurationToSend.toFixed(0),
        chunksToSend: chunksToSend.length,
        chunksRemaining: buffer.chunks.length - chunksToSend.length,
        totalChunksInBuffer: buffer.chunks.length,
        bufferAge: Date.now() - buffer.lastProcessed,
      });

      // CRITICAL: Send audio and handle transcript asynchronously
      // Don't wait for transcript - this prevents buffer from being locked
      // Send audio immediately, then handle transcript response when it arrives
      this.sendToAsrProvider(audioToSend, buffer, seq).then((transcript) => {
        // Handle transcript asynchronously (don't block buffer processing)
        this.handleTranscriptResponse(buffer, transcript, seq);
      }).catch((error) => {
        console.error(`[ASRWorker] Error sending audio for ${buffer.interactionId}:`, error);
      });
      
      // CRITICAL: Remove sent chunks from buffer immediately (don't wait for transcript)
      // This allows new chunks to accumulate while we wait for transcript
      buffer.chunks = buffer.chunks.slice(chunksToSend.length);
      buffer.timestamps = buffer.timestamps.slice(timestampsToSend.length);
      
      // Update last processed time
      buffer.lastProcessed = Date.now();
      
      // CRITICAL: Mark initial chunk sent (for continuous streaming mode)
      if (!buffer.hasSentInitialChunk) {
        buffer.hasSentInitialChunk = true;
      }
      
    } catch (error: any) {
      console.error(`[ASRWorker] Error processing buffer:`, error);
      throw error;
    }
  }
  
  /**
   * Handle transcript response asynchronously (doesn't block buffer processing)
   */
  private async handleTranscriptResponse(
    buffer: AudioBuffer,
    transcript: any,
    seq: number
  ): Promise<void> {
    try {
      // CRITICAL FIX: Handle undefined/null transcript gracefully
      if (!transcript) {
        console.warn(`[ASRWorker] ⚠️ Received undefined/null transcript for ${buffer.interactionId}, seq ${seq}`, {
          interaction_id: buffer.interactionId,
          seq,
          transcriptType: typeof transcript,
        });
        return; // Skip processing if transcript is undefined
      }
      
      // Validate transcript has required fields
      if (typeof transcript.type === 'undefined') {
        console.warn(`[ASRWorker] ⚠️ Transcript missing 'type' field for ${buffer.interactionId}, seq ${seq}`, {
          interaction_id: buffer.interactionId,
          seq,
          transcriptKeys: transcript ? Object.keys(transcript) : [],
          transcriptValue: transcript,
        });
        return; // Skip processing if transcript is invalid
      }
      
      // Record first partial latency
      if (transcript.type === 'partial' && !transcript.isFinal) {
        this.metrics.recordFirstPartial(buffer.interactionId);
      }

      // Publish transcript message
      const transcriptMsg: TranscriptMessage = {
        interaction_id: buffer.interactionId,
        tenant_id: buffer.tenantId,
        seq,
        type: transcript.type,
        text: transcript.text || '',
        confidence: transcript.confidence || 0.9,
        timestamp_ms: Date.now(),
      };

      const topic = transcriptTopic(buffer.interactionId);
      await this.pubsub.publish(topic, transcriptMsg);

      // Enhanced logging to debug empty text issue
      const textPreview = transcript.text ? transcript.text.substring(0, 50) : '(EMPTY)';
      console.info(`[ASRWorker] Published ${transcript.type} transcript`, {
        interaction_id: buffer.interactionId,
        text: textPreview,
        textLength: transcript.text?.length || 0,
        seq,
        provider: process.env.ASR_PROVIDER || 'mock',
      });
      
      // Warn if text is empty
      if (!transcript.text || transcript.text.trim().length === 0) {
        console.warn(`[ASRWorker] ⚠️ WARNING: Published transcript with EMPTY text!`, {
          interaction_id: buffer.interactionId,
          seq,
          type: transcript.type,
          provider: process.env.ASR_PROVIDER || 'mock',
        });
      }
    } catch (error: any) {
      console.error(`[ASRWorker] Error handling transcript response:`, error);
      this.metrics.recordError(error.message || String(error));
    }
  }

  async stop(): Promise<void> {
    // Unsubscribe from all topics
    for (const handle of this.subscriptions) {
      await handle.unsubscribe();
    }

    // Close ASR provider
    await this.asrProvider.close();

    // Close pub/sub adapter
    await this.pubsub.close();

    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        console.info('[ASRWorker] Server stopped');
        resolve();
      });
    });
  }
}

// Start worker
const worker = new AsrWorker();
worker.start().catch((error) => {
  console.error('[ASRWorker] Failed to start:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.info('[ASRWorker] SIGTERM received, shutting down gracefully');
  await worker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.info('[ASRWorker] SIGINT received, shutting down gracefully');
  await worker.stop();
  process.exit(0);
});


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
}

class AsrWorker {
  private pubsub: ReturnType<typeof createPubSubAdapterFromEnv>;
  private asrProvider: ReturnType<typeof createAsrProvider>;
  private buffers: Map<string, AudioBuffer> = new Map();
  private metrics: MetricsCollector;
  private server: ReturnType<typeof createServer>;
  private subscriptions: any[] = [];

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

      buffer.chunks.push(audioBuffer);
      buffer.timestamps.push(frame.timestamp_ms);

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
        if (currentAudioDurationMs >= INITIAL_CHUNK_DURATION_MS) {
          buffer.isProcessing = true;
          try {
            await this.processBuffer(buffer);
            buffer.lastProcessed = Date.now();
            buffer.hasSentInitialChunk = true;
            buffer.lastContinuousSendTime = Date.now();
          } finally {
            buffer.isProcessing = false;
          }
        }
      } else {
        // After initial chunk: Stream continuously with Deepgram-optimized sizing
        // CRITICAL: Use lastContinuousSendTime which doesn't reset when buffer is cleared
        // This ensures continuous streaming works even after buffer is cleared
        
        // CRITICAL FIX: Initialize lastContinuousSendTime to buffer creation time if not set
        // This prevents the age calculation from being wrong when buffer is old
        if (buffer.lastContinuousSendTime === 0) {
          // Use lastProcessed (buffer creation time) instead of current time
          // This ensures timeSinceLastContinuousSend is calculated correctly
          buffer.lastContinuousSendTime = buffer.lastProcessed;
        }
        
        // Calculate time since last continuous send (this doesn't reset on buffer clear)
        const timeSinceLastContinuousSend = Date.now() - buffer.lastContinuousSendTime;
        
        // CRITICAL FIX: For continuous streaming, we need to send audio more aggressively
        // Deepgram requires continuous audio flow - even small chunks are better than silence
        // The key is to send audio FREQUENTLY (every 50-100ms), not wait for large chunks
        // Process if:
        // 1. Enough time has passed since last continuous send (100ms) AND we have ANY audio, OR
        // 2. We have accumulated enough audio (100ms), OR
        // 3. We've accumulated too much audio (250ms max - force send), OR
        // 4. Time-based trigger: Send every 50ms if we have at least 100ms of audio
        const MIN_CONTINUOUS_TIME_MS = 50; // Minimum time between sends (even for tiny chunks)
        // CRITICAL FIX: Increased from 20ms to 100ms for reliable Deepgram transcription
        const MIN_CONTINUOUS_AUDIO_MS = ASR_CHUNK_MIN_MS; // Minimum audio to send in continuous mode (100ms for reliable transcription)
        
        // CRITICAL: Also check if buffer age is too high (stale buffer)
        // If buffer hasn't been processed in a while, force process to prevent Deepgram timeout
        const MAX_BUFFER_AGE_MS = 500; // Force process if buffer is older than 500ms
        const isBufferStale = timeSinceLastContinuousSend >= MAX_BUFFER_AGE_MS;
        
        const shouldProcess = 
          isBufferStale || // Force process if buffer is stale (prevents Deepgram timeout)
          (timeSinceLastContinuousSend >= CONTINUOUS_CHUNK_DURATION_MS && currentAudioDurationMs >= MIN_CONTINUOUS_AUDIO_MS) || // Time-based: 100ms elapsed + 20ms audio
          (timeSinceLastContinuousSend >= MIN_CONTINUOUS_TIME_MS && currentAudioDurationMs >= CONTINUOUS_CHUNK_DURATION_MS) || // Audio-based: 50ms elapsed + 100ms audio
          currentAudioDurationMs >= MAX_CHUNK_DURATION_MS; // Force send if too large
        
        if (shouldProcess && currentAudioDurationMs > 0) {
          buffer.isProcessing = true;
          try {
            await this.processBuffer(buffer);
            buffer.lastProcessed = Date.now();
            // Update lastContinuousSendTime to track continuous streaming (doesn't reset on buffer clear)
            buffer.lastContinuousSendTime = Date.now();
            console.info(`[ASRWorker] ✅ Sent continuous chunk for ${interaction_id}`, {
              timeSinceLastSend: timeSinceLastContinuousSend,
              audioDuration: currentAudioDurationMs.toFixed(0),
              chunksCount: buffer.chunks.length,
            });
          } finally {
            buffer.isProcessing = false;
          }
        } else {
          // Log why we're not processing (for debugging)
          // CRITICAL: Log warning if buffer is getting stale
          if (timeSinceLastContinuousSend > 1000) {
            console.warn(`[ASRWorker] ⚠️ Buffer getting stale (${timeSinceLastContinuousSend}ms since last send)`, {
              interaction_id,
              timeSinceLastContinuousSend,
              bufferAge,
              currentAudioDurationMs: currentAudioDurationMs.toFixed(0),
              chunksCount: buffer.chunks.length,
              needsTime: Math.max(0, CONTINUOUS_CHUNK_DURATION_MS - timeSinceLastContinuousSend),
              needsAudio: Math.max(0, CONTINUOUS_CHUNK_DURATION_MS - currentAudioDurationMs),
              maxChunkSize: MAX_CHUNK_DURATION_MS,
            });
          } else {
            console.debug(`[ASRWorker] ⏸️ Continuous streaming: waiting`, {
              interaction_id,
              timeSinceLastContinuousSend,
              bufferAge,
              currentAudioDurationMs: currentAudioDurationMs.toFixed(0),
              chunksCount: buffer.chunks.length,
              needsTime: Math.max(0, CONTINUOUS_CHUNK_DURATION_MS - timeSinceLastContinuousSend),
              needsAudio: Math.max(0, CONTINUOUS_CHUNK_DURATION_MS - currentAudioDurationMs),
              maxChunkSize: MAX_CHUNK_DURATION_MS,
            });
          }
        }
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
          this.buffers.delete(interactionId);
          this.metrics.resetInteraction(interactionId);
        }
      }
    }, 2000); // Check every 2 seconds
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

  private async processBuffer(buffer: AudioBuffer): Promise<void> {
    if (buffer.chunks.length === 0) {
      return;
    }

    try {
      // Concatenate audio chunks
      const combinedAudio = Buffer.concat(buffer.chunks);
      const seq = buffer.chunks.length;
      
      // Calculate total audio duration
      const totalSamples = combinedAudio.length / 2; // 16-bit = 2 bytes per sample
      const audioDurationMs = (totalSamples / buffer.sampleRate) * 1000;
      
      // CRITICAL: Enforce maximum chunk size (250ms per Deepgram recommendation)
      // If buffer is too large, split into multiple chunks
      if (audioDurationMs > MAX_CHUNK_DURATION_MS) {
        console.warn(`[ASRWorker] ⚠️ Buffer too large (${audioDurationMs.toFixed(0)}ms > ${MAX_CHUNK_DURATION_MS}ms), splitting into chunks`, {
          interaction_id: buffer.interactionId,
          audioDurationMs: audioDurationMs.toFixed(0),
          maxChunkSize: MAX_CHUNK_DURATION_MS,
        });
        
        // Split into multiple chunks
        const maxSamples = Math.floor((MAX_CHUNK_DURATION_MS * buffer.sampleRate) / 1000);
        const maxBytes = maxSamples * 2; // 16-bit = 2 bytes per sample
        
        // Process first chunk
        const firstChunk = combinedAudio.slice(0, maxBytes);
        await this.sendToAsrProvider(firstChunk, buffer, seq);
        
        // Process remaining chunks if any
        if (combinedAudio.length > maxBytes) {
          const remainingChunk = combinedAudio.slice(maxBytes);
          await this.sendToAsrProvider(remainingChunk, buffer, seq + 1);
        }
        
        // Clear all processed chunks
        buffer.chunks = [];
        buffer.timestamps = [];
        return;
      }
      
      // CRITICAL: Audio duration check depends on streaming mode
      // - Initial chunk: Require 200ms minimum (reduced from 500ms)
      // - Continuous streaming: Require 100ms minimum for reliable Deepgram transcription
      //   Deepgram can technically accept 20ms, but 100ms+ is needed for accuracy
      const requiredDuration = buffer.hasSentInitialChunk 
        ? ASR_CHUNK_MIN_MS  // Continuous mode: Require 100ms minimum for reliable transcription
        : INITIAL_CHUNK_DURATION_MS;    // Initial chunk: 200ms
      
      if (audioDurationMs < requiredDuration) {
        console.debug(`[ASRWorker] ⏳ Buffer too small (${audioDurationMs.toFixed(0)}ms < ${requiredDuration}ms), waiting for more audio`, {
          interaction_id: buffer.interactionId,
          chunksCount: buffer.chunks.length,
          audioDurationMs: audioDurationMs.toFixed(0),
          minimumRequired: requiredDuration,
          mode: buffer.hasSentInitialChunk ? 'continuous' : 'initial',
        });
        return; // Don't process yet - wait for more audio
      }

      // Log audio details before sending to ASR
      console.info(`[ASRWorker] Processing audio buffer:`, {
        interaction_id: buffer.interactionId,
        seq,
        sampleRate: buffer.sampleRate,
        audioSize: combinedAudio.length,
        audioDurationMs: audioDurationMs.toFixed(0),
        chunksCount: buffer.chunks.length,
        bufferAge: Date.now() - buffer.lastProcessed,
        meetsMinimum: audioDurationMs >= MIN_AUDIO_DURATION_MS,
      });

      // Send to ASR provider (extracted to helper for chunk splitting)
      const transcript = await this.sendToAsrProvider(combinedAudio, buffer, seq);

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
        text: transcript.text,
        confidence: transcript.confidence,
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

      // Mark that we've sent the initial chunk (for continuous streaming)
      buffer.hasSentInitialChunk = true;
      
      // Clear buffer if final transcript
      if (transcript.isFinal) {
        this.buffers.delete(buffer.interactionId);
        this.metrics.resetInteraction(buffer.interactionId);
      } else {
        // Clear ALL processed chunks to prevent reprocessing
        // The buffer will accumulate new chunks for continuous streaming
        // This prevents infinite loop of processing same chunks
        const clearedChunksCount = buffer.chunks.length;
        buffer.chunks = [];
        buffer.timestamps = [];
        
        console.info(`[ASRWorker] ✅ Cleared ${clearedChunksCount} chunks from buffer for ${buffer.interactionId} after processing`, {
          hasSentInitialChunk: buffer.hasSentInitialChunk,
          note: 'Will now stream continuously as new chunks arrive',
        });
      }
    } catch (error: any) {
      console.error('[ASRWorker] Error processing buffer:', error);
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


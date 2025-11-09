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
// Increase buffer window to send larger chunks to Deepgram
// Deepgram needs continuous audio streams, not tiny chunks
// Increased to 1000ms to accumulate at least 200-500ms of audio before processing
// Buffer window: time-based trigger for processing
// Increased to 2000ms to accumulate more audio chunks
const BUFFER_WINDOW_MS = parseInt(process.env.BUFFER_WINDOW_MS || '2000', 10);
// Minimum audio duration: must have at least this much audio before processing
// Deepgram requires minimum 200-500ms of audio for reliable transcription
const MIN_AUDIO_DURATION_MS = parseInt(process.env.MIN_AUDIO_DURATION_MS || '500', 10);
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
        res.end(JSON.stringify({ status: 'ok', service: 'asr-worker' }));
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
        };
        this.buffers.set(interaction_id, buffer);
      }

      // Update last chunk received timestamp
      buffer.lastChunkReceived = Date.now();

      // Decode base64 audio
      const audioBuffer = Buffer.from(audio, 'base64');
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
      // 2. After initial chunk: Send new chunks continuously as they arrive (streaming mode)
      // This ensures Deepgram receives continuous audio, not one chunk then silence
      
      const bufferAge = Date.now() - buffer.lastProcessed;
      const shouldProcess = 
        // If we haven't sent initial chunk, wait for minimum duration
        (!buffer.hasSentInitialChunk && currentAudioDurationMs >= MIN_AUDIO_DURATION_MS) ||
        // If we've sent initial chunk, process on time-based trigger (continuous streaming)
        (buffer.hasSentInitialChunk && bufferAge >= BUFFER_WINDOW_MS);
      
      if (shouldProcess) {
        await this.processBuffer(buffer);
        buffer.lastProcessed = Date.now();
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
        if (timeSinceLastChunk >= STALE_BUFFER_TIMEOUT_MS) {
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
      
      // CRITICAL: Only process if we have minimum audio duration
      // Deepgram requires at least 200-500ms of audio for reliable transcription
      if (audioDurationMs < MIN_AUDIO_DURATION_MS) {
        console.debug(`[ASRWorker] ⏳ Buffer too small (${audioDurationMs.toFixed(0)}ms < ${MIN_AUDIO_DURATION_MS}ms), waiting for more audio`, {
          interaction_id: buffer.interactionId,
          chunksCount: buffer.chunks.length,
          audioDurationMs: audioDurationMs.toFixed(0),
          minimumRequired: MIN_AUDIO_DURATION_MS,
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

      // Send to ASR provider
      const transcript = await this.asrProvider.sendAudioChunk(combinedAudio, {
        interactionId: buffer.interactionId,
        seq,
        sampleRate: buffer.sampleRate,
      });

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


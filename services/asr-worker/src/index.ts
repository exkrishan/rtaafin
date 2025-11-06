/**
 * ASR Worker - Streaming speech recognition service
 * 
 * Subscribes to audio topics, processes audio through ASR provider,
 * and publishes transcript events to transcript topics.
 */

import { createServer } from 'http';
import { createPubSubAdapterFromEnv } from '@rtaa/pubsub';
import { audioTopic, transcriptTopic } from '@rtaa/pubsub/topics';
import { createAsrProvider } from './providers';
import { AudioFrameMessage, TranscriptMessage } from './types';
import { MetricsCollector } from './metrics';

// Load environment variables from project root .env.local
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env.local') });

const PORT = parseInt(process.env.PORT || '3001', 10);
const BUFFER_WINDOW_MS = parseInt(process.env.BUFFER_WINDOW_MS || '300', 10); // 200-500ms
const ASR_PROVIDER = (process.env.ASR_PROVIDER || 'mock') as 'mock' | 'deepgram' | 'whisper';

interface AudioBuffer {
  interactionId: string;
  tenantId: string;
  sampleRate: number;
  chunks: Buffer[];
  timestamps: number[];
  lastProcessed: number;
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
    this.asrProvider = createAsrProvider(ASR_PROVIDER);
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

    const handle = await this.pubsub.subscribe(audioTopicName, async (msg) => {
      await this.handleAudioFrame(msg as any);
    });

    this.subscriptions.push(handle);

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
        };
        this.buffers.set(interaction_id, buffer);
      }

      // Decode base64 audio
      const audioBuffer = Buffer.from(audio, 'base64');
      buffer.chunks.push(audioBuffer);
      buffer.timestamps.push(frame.timestamp_ms);

      // Record metrics
      this.metrics.recordAudioChunk(interaction_id);

      // Check if we should process the buffer
      const bufferAge = Date.now() - buffer.lastProcessed;
      if (bufferAge >= BUFFER_WINDOW_MS) {
        await this.processBuffer(buffer);
        buffer.lastProcessed = Date.now();
      }
    } catch (error: any) {
      console.error('[ASRWorker] Error handling audio frame:', error);
      this.metrics.recordError(error.message || String(error));
    }
  }

  private async processBuffer(buffer: AudioBuffer): Promise<void> {
    if (buffer.chunks.length === 0) {
      return;
    }

    try {
      // Concatenate audio chunks
      const combinedAudio = Buffer.concat(buffer.chunks);
      const seq = buffer.chunks.length;

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

      console.info(`[ASRWorker] Published ${transcript.type} transcript`, {
        interaction_id: buffer.interactionId,
        text: transcript.text.substring(0, 50),
        seq,
      });

      // Clear buffer if final transcript
      if (transcript.isFinal) {
        this.buffers.delete(buffer.interactionId);
        this.metrics.resetInteraction(buffer.interactionId);
      } else {
        // Keep some chunks for next buffer window
        // Keep last 2 chunks to maintain continuity
        if (buffer.chunks.length > 2) {
          buffer.chunks = buffer.chunks.slice(-2);
          buffer.timestamps = buffer.timestamps.slice(-2);
        }
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


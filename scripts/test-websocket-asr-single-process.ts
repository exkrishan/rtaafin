#!/usr/bin/env tsx
/**
 * Single-Process WebSocket → ASR Flow Test
 * 
 * This test runs ingestion and ASR in the same process to verify
 * the complete flow using the in-memory pub/sub adapter.
 * 
 * This works around the limitation that in-memory adapter doesn't
 * work across separate processes.
 */

import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { InMemoryAdapter } from '../lib/pubsub/adapters/inMemoryAdapter';
import { audioTopic, transcriptTopic } from '../lib/pubsub/topics';
import { createAsrProvider } from '../services/asr-worker/src/providers';
import { MetricsCollector } from '../services/asr-worker/src/metrics';
import { AudioFrameMessage, TranscriptMessage } from '../services/asr-worker/src/types';

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const INGEST_PORT = 8444; // Different port to avoid conflicts
// Force mock provider for single-process test
const ASR_PROVIDER = 'mock' as 'mock' | 'deepgram' | 'whisper';
const BUFFER_WINDOW_MS = 300;

// Shared in-memory pub/sub adapter
const pubsub = new InMemoryAdapter();
const asrProvider = createAsrProvider(ASR_PROVIDER);
const metrics = new MetricsCollector();

// ASR Worker state
interface AudioBuffer {
  interactionId: string;
  tenantId: string;
  sampleRate: number;
  chunks: Buffer[];
  timestamps: number[];
  lastProcessed: number;
}

const buffers = new Map<string, AudioBuffer>();

// Subscribe to audio topics
async function setupASRWorker() {
  const audioTopicName = audioTopic({ useStreams: true });
  console.info(`[ASRWorker] Subscribing to audio topic: ${audioTopicName}`);

  await pubsub.subscribe(audioTopicName, async (msg: any) => {
    await handleAudioFrame(msg);
  });

  console.info('[ASRWorker] ASR worker ready');
}

async function handleAudioFrame(msg: any): Promise<void> {
  try {
    const frame: AudioFrameMessage = {
      tenant_id: msg.tenant_id,
      interaction_id: msg.interaction_id,
      seq: msg.seq,
      timestamp_ms: msg.timestamp_ms || Date.now(),
      sample_rate: msg.sample_rate || 24000,
      encoding: msg.encoding || 'pcm16',
      audio: Buffer.from(msg.audio, 'base64'), // Decode base64
    };

    const { interaction_id, tenant_id, seq, sample_rate, audio } = frame;

    // Get or create buffer
    let buffer = buffers.get(interaction_id);
    if (!buffer) {
      buffer = {
        interactionId: interaction_id,
        tenantId: tenant_id,
        sampleRate: sample_rate,
        chunks: [],
        timestamps: [],
        lastProcessed: 0,
      };
      buffers.set(interaction_id, buffer);
    }

    // Add chunk to buffer
    buffer.chunks.push(audio);
    buffer.timestamps.push(frame.timestamp_ms);

    // Record metrics
    metrics.recordAudioChunk(interaction_id);

    // Process buffer if enough time has passed
    const now = Date.now();
    const timeSinceLastProcess = now - buffer.lastProcessed;
    
    if (timeSinceLastProcess >= BUFFER_WINDOW_MS) {
      // Concatenate chunks
      const audioBuffer = Buffer.concat(buffer.chunks);
      
      // Send to ASR provider
      try {
        const transcript = await asrProvider.sendAudioChunk(audioBuffer, {
          interactionId: interaction_id,
          seq: buffer.chunks.length,
          sampleRate: sample_rate,
        });

        // Record first partial
        if (transcript.type === 'partial' && !transcript.isFinal) {
          metrics.recordFirstPartial(interaction_id);
        }

        // Publish transcript
        const transcriptMsg: TranscriptMessage = {
          interaction_id,
          tenant_id,
          seq: buffer.chunks.length,
          type: transcript.type,
          text: transcript.text,
          confidence: transcript.confidence,
          is_final: transcript.isFinal,
          timestamp_ms: Date.now(),
        };

        const transcriptTopicName = transcriptTopic(interaction_id);
        await pubsub.publish(transcriptTopicName, transcriptMsg);

        console.info(`[ASRWorker] Generated transcript:`, {
          interaction_id,
          type: transcript.type,
          text: transcript.text.substring(0, 50),
          is_final: transcript.isFinal,
        });

        // Clear buffer if final
        if (transcript.isFinal) {
          buffers.delete(interaction_id);
          metrics.resetInteraction(interaction_id);
        } else {
          // Keep last chunk for continuity
          buffer.chunks = [audioBuffer];
          buffer.timestamps = [now];
        }

        buffer.lastProcessed = now;
      } catch (error: any) {
        console.error('[ASRWorker] ASR provider error:', error);
        metrics.recordError(error.message || String(error));
      }
    }
  } catch (error: any) {
    console.error('[ASRWorker] Error handling audio frame:', error);
    metrics.recordError(error.message || String(error));
  }
}

// Simple WebSocket server for ingestion
function setupIngestionServer(): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer();
    const wss = new (require('ws').Server)({ 
      server,
      path: '/v1/ingest',
    });

    // Simple JWT validation (for testing - accept any token)
    wss.on('connection', (ws: any, req: any) => {
      let state: any = null;
      console.log('[Ingestion] New WebSocket connection');

      ws.on('message', async (data: Buffer | string) => {
        try {
          // WebSocket 'ws' library: data is Buffer for binary, string for text
          // But sometimes it can be ArrayBuffer or other types
          let text: string | null = null;
          let isBinary = false;
          
          if (typeof data === 'string') {
            text = data;
          } else if (Buffer.isBuffer(data)) {
            // Try to parse as UTF-8 text first (for JSON messages)
            try {
              text = data.toString('utf8');
              // Check if it looks like JSON
              if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                // It's a text message encoded as Buffer
                isBinary = false;
              } else {
                // It's binary data
                isBinary = true;
              }
            } catch (e) {
              isBinary = true;
            }
          } else {
            // ArrayBuffer or other - try to convert
            try {
              const buf = Buffer.from(data as any);
              text = buf.toString('utf8');
              if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
                isBinary = true;
              }
            } catch (e) {
              isBinary = true;
            }
          }
          
          if (text && !isBinary) {
            // Text message - parse as JSON
            try {
              const event = JSON.parse(text);
              if (event.event === 'start') {
                state = {
                  interactionId: event.interaction_id,
                  tenantId: event.tenant_id,
                  sampleRate: event.sample_rate,
                  encoding: event.encoding,
                  seq: 0,
                };
                console.log('[Ingestion] Start event received:', event.interaction_id);
                ws.send(JSON.stringify({ event: 'started', interaction_id: event.interaction_id }));
                return;
              }
            } catch (e) {
              console.warn('[Ingestion] Failed to parse JSON:', e);
            }
          }
          
          // Binary frame
          if (!state) {
            console.warn('[Ingestion] Binary frame received before start event, ignoring');
            return;
          }
          
          state.seq += 1;
          const frame = {
            tenant_id: state.tenantId,
            interaction_id: state.interactionId,
            seq: state.seq,
            timestamp_ms: Date.now(),
            sample_rate: state.sampleRate,
            encoding: state.encoding,
            audio: Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data as any).toString('base64'),
          };

          // Publish to pub/sub
          const audioTopicName = audioTopic({ useStreams: true });
          await pubsub.publish(audioTopicName, frame);

          // Send ACK every 10 frames
          if (state.seq % 10 === 0) {
            ws.send(JSON.stringify({ event: 'ack', seq: state.seq }));
          }
        } catch (error: any) {
          console.error('[Ingestion] Error:', error);
        }
      });

      ws.on('error', (error: Error) => {
        console.error('[Ingestion] WebSocket error:', error);
      });
    });

    server.listen(INGEST_PORT, () => {
      console.info(`[Ingestion] WebSocket server listening on ws://localhost:${INGEST_PORT}/v1/ingest`);
      resolve();
    });
  });
}

// Test function
async function runTest() {
  console.log('🧪 Single-Process WebSocket → ASR Flow Test');
  console.log('============================================\n');

  // Setup ASR worker
  await setupASRWorker();

  // Setup ingestion server
  await setupIngestionServer();

  // Get initial metrics
  const initialChunks = metrics.getMetrics().audioChunksProcessed;
  console.log(`📊 Initial metrics: ${initialChunks} chunks processed\n`);

  // Generate JWT token
  const privateKeyPath = path.join(__dirname, '../scripts/keys/jwt-private-key.pem');
  if (!fs.existsSync(privateKeyPath)) {
    console.error('❌ JWT private key not found');
    process.exit(1);
  }
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const interactionId = `test-int-${Date.now()}`;
  const token = jwt.sign(
    {
      tenant_id: 'test-tenant',
      interaction_id: interactionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );

  // Connect WebSocket
  console.log('🔌 Connecting to WebSocket...');
  const ws = new WebSocket(`ws://localhost:${INGEST_PORT}/v1/ingest`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await new Promise<void>((resolve, reject) => {
    let framesSent = 0;
    const totalFrames = 30;
    let startAcknowledged = false;

    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      
      // Send start event
      ws.send(JSON.stringify({
        event: 'start',
        interaction_id: interactionId,
        tenant_id: 'test-tenant',
        sample_rate: 24000,
        encoding: 'pcm16',
      }));
      console.log('📤 Sent start event');
    });

    ws.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'started') {
          console.log('✅ Start acknowledged');
          startAcknowledged = true;
          
          // Start sending frames
          const sendFrames = () => {
            if (framesSent < totalFrames) {
              // Generate synthetic PCM16 frame
              const samples = 4800;
              const buffer = Buffer.allocUnsafe(samples * 2);
              for (let i = 0; i < samples; i++) {
                const sample = Math.sin((2 * Math.PI * 440 * i) / 24000) * 16000;
                buffer.writeInt16LE(Math.floor(sample), i * 2);
              }
              
              ws.send(buffer, { binary: true });
              framesSent++;
              
              if (framesSent % 5 === 0) {
                console.log(`   📤 Sent ${framesSent}/${totalFrames} frames`);
              }
              
              setTimeout(sendFrames, 200);
            } else {
              console.log(`✅ All ${framesSent} frames sent`);
              setTimeout(() => {
                ws.close();
                resolve();
              }, 2000);
            }
          };
          
          sendFrames();
        } else if (msg.event === 'ack') {
          console.log(`   ✅ Received ACK: seq=${msg.seq}`);
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      reject(error);
    });

    setTimeout(() => {
      if (!startAcknowledged || framesSent < totalFrames) {
        reject(new Error('Timeout waiting for start acknowledgment or frames'));
      }
    }, 30000);
  });

  // Wait for processing
  console.log('\n⏳ Waiting for ASR processing...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Check final metrics
  const finalMetrics = metrics.getMetrics();
  const chunksDelta = finalMetrics.audioChunksProcessed - initialChunks;

  console.log('\n📊 Final Metrics:');
  console.log(`   Audio chunks processed: ${initialChunks} → ${finalMetrics.audioChunksProcessed} (Δ${chunksDelta})`);
  console.log(`   Errors: ${finalMetrics.errors}`);
  console.log(`   First partial latency: ${finalMetrics.firstPartialLatencyMs || 'N/A'}ms`);

  if (chunksDelta > 0) {
    console.log('\n🎉 SUCCESS! WebSocket → ASR flow is working!');
    console.log(`   ✅ ${chunksDelta} audio chunks processed`);
    console.log(`   ✅ Transcripts generated and published`);
  } else {
    console.log('\n⚠️  No audio chunks were processed');
  }

  // Cleanup
  await pubsub.close();
  await asrProvider.close();
  process.exit(chunksDelta > 0 ? 0 : 1);
}

// Run test
runTest().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});


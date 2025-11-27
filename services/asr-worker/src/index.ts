/**
 * ASR Worker - Streaming speech recognition service
 * 
 * Subscribes to audio topics, processes audio through ASR provider,
 * and publishes transcript events to transcript topics.
 */

import { createServer } from 'http';
import Redis from 'ioredis';
import { createPubSubAdapterFromEnv } from '@rtaa/pubsub';
import { audioTopic, transcriptTopic, callEndTopic } from '@rtaa/pubsub/topics';
import { createAsrProvider } from './providers';
import { AudioFrameMessage, TranscriptMessage } from './types';
import { MetricsCollector } from './metrics';
import { BufferManager } from './buffer-manager';
import { ConnectionHealthMonitor } from './connection-health-monitor';
import { ElevenLabsCircuitBreaker } from './circuit-breaker';
import { dumpBufferedAudioChunk } from './audio-dumper';
import { logger } from './logger';

// Load environment variables from project root .env.local
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env.local') });

const PORT = parseInt(process.env.PORT || '3001', 10);

// Real-time chunk sizing configuration - optimized for minimal latency
// CRITICAL: Reduced all buffers to 20ms minimum for real-time transcription
// This enables transcripts to be generated as soon as audio chunks arrive from websocket
// Initial chunk: 20ms minimum (reduced from 200ms for real-time processing)
const INITIAL_CHUNK_DURATION_MS = parseInt(process.env.INITIAL_CHUNK_DURATION_MS || '20', 10);
// Continuous chunks: 20ms for real-time streaming (reduced from 100ms)
const CONTINUOUS_CHUNK_DURATION_MS = parseInt(process.env.CONTINUOUS_CHUNK_DURATION_MS || '20', 10);
// Maximum chunk size: 100ms (reduced from 250ms for faster processing)
const MAX_CHUNK_DURATION_MS = parseInt(process.env.MAX_CHUNK_DURATION_MS || '100', 10);
// Minimum audio duration before processing: 20ms (reduced from 200ms for real-time)
const MIN_AUDIO_DURATION_MS = parseInt(process.env.MIN_AUDIO_DURATION_MS || '20', 10);
// CRITICAL: Minimum chunk size for continuous streaming: 20ms (reduced from 100ms)
// This allows immediate processing of audio chunks as they arrive
const ASR_CHUNK_MIN_MS = parseInt(process.env.ASR_CHUNK_MIN_MS || '20', 10);

// Legacy buffer window (kept for backward compatibility, but not used for Deepgram)
const BUFFER_WINDOW_MS = parseInt(process.env.BUFFER_WINDOW_MS || '1000', 10);
// Stale buffer timeout: if no new audio arrives for this duration, clean up the buffer
// This prevents processing old audio after a call has ended
const STALE_BUFFER_TIMEOUT_MS = parseInt(process.env.STALE_BUFFER_TIMEOUT_MS || '5000', 10); // 5 seconds
const ASR_PROVIDER = (process.env.ASR_PROVIDER || 'mock') as 'mock' | 'deepgram' | 'whisper' | 'google' | 'elevenlabs';
// CRITICAL: PCM16 audio format constant - used for duration calculations
// Formula: durationMs = (bytes / BYTES_PER_SAMPLE / sampleRate) * 1000
// Example: 640 bytes at 16kHz = (640 / 2 / 16000) * 1000 = 20ms
const BYTES_PER_SAMPLE = 2; // 16-bit PCM = 2 bytes per sample

interface AudioBuffer {
  interactionId: string;
  tenantId: string;
  sampleRate: number;
  chunks: Buffer[]; // Buffered audio chunks
  timestamps: number[]; // Timestamps of each chunk
  sequences: number[]; // Sequence numbers from incoming frames
  lastProcessed: number; // Last time buffer was processed
  lastChunkReceived: number; // Last time a chunk was received
}

class AsrWorker {
  private pubsub: ReturnType<typeof createPubSubAdapterFromEnv>;
  private redis: Redis;
  private asrProvider: ReturnType<typeof createAsrProvider>;
  private buffers: Map<string, AudioBuffer> = new Map();
  private metrics: MetricsCollector;
  private server: ReturnType<typeof createServer>;
  private subscriptions: any[] = [];
  private bufferTimers: Map<string, NodeJS.Timeout> = new Map(); // Track timers per buffer for cleanup
  private endedCalls: Map<string, number> = new Map(); // Track ended calls with timestamp for grace period
  private ENDED_CALL_GRACE_PERIOD_MS = 10000; // 10 seconds grace period for late-arriving audio
  private bufferManager: BufferManager; // Comprehensive buffer lifecycle management
  private connectionHealthMonitor: ConnectionHealthMonitor; // Connection health monitoring
  private circuitBreaker: ElevenLabsCircuitBreaker; // Circuit breaker for ElevenLabs API
  private queuedTranscriptProcessorInterval: NodeJS.Timeout | null = null; // Background processor for queued transcripts

  constructor() {
    this.pubsub = createPubSubAdapterFromEnv();
    this.redis = new Redis(process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379');
    
    // Check Exotel Bridge feature flag
    const exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
    
    // Validate provider configuration before creating
    // This ensures we fail fast if required env vars are missing
    if (ASR_PROVIDER === 'deepgram' && !process.env.DEEPGRAM_API_KEY) {
      if (exoBridgeEnabled) {
        console.error('[ASRWorker] ❌ CRITICAL: EXO_BRIDGE_ENABLED=true but DEEPGRAM_API_KEY is not set!');
        console.error('[ASRWorker] Exotel→Deepgram bridge requires DEEPGRAM_API_KEY. Disabling STT to avoid broken prod.');
        console.error('[ASRWorker] Please set DEEPGRAM_API_KEY environment variable or set EXO_BRIDGE_ENABLED=false.');
        // Don't throw - log warning and continue (bridge will be disabled)
        console.warn('[ASRWorker] ⚠️ Continuing without Deepgram STT - bridge feature disabled');
      } else {
        console.error('[ASRWorker] ❌ CRITICAL: ASR_PROVIDER=deepgram but DEEPGRAM_API_KEY is not set!');
        console.error('[ASRWorker] The system will NOT fall back to mock provider.');
        console.error('[ASRWorker] Please set DEEPGRAM_API_KEY environment variable or change ASR_PROVIDER to "mock".');
        throw new Error(
          'DEEPGRAM_API_KEY is required when ASR_PROVIDER=deepgram. ' +
          'No fallback to mock provider - this ensures proper testing.'
        );
      }
    }
    
    if (ASR_PROVIDER === 'elevenlabs' && !process.env.ELEVENLABS_API_KEY) {
      console.error('[ASRWorker] ❌ CRITICAL: ASR_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is not set!');
      console.error('[ASRWorker] The system will NOT fall back to mock provider.');
      console.error('[ASRWorker] Please set ELEVENLABS_API_KEY environment variable or change ASR_PROVIDER to "mock".');
      throw new Error(
        'ELEVENLABS_API_KEY is required when ASR_PROVIDER=elevenlabs. ' +
        'No fallback to mock provider - this ensures proper testing.'
      );
    }
    
    // Log Exotel Bridge status
    if (exoBridgeEnabled) {
      const deepgramKey = process.env.DEEPGRAM_API_KEY;
      const keyMasked = deepgramKey ? `${deepgramKey.substring(0, 8)}...${deepgramKey.substring(deepgramKey.length - 4)}` : 'NOT SET';
      console.info('[ASRWorker] Exotel→Deepgram bridge: ENABLED', {
        deepgramApiKey: keyMasked,
        model: process.env.DG_MODEL || process.env.DEEPGRAM_MODEL || 'nova-3',
        encoding: process.env.DG_ENCODING || 'linear16',
        sampleRate: process.env.DG_SAMPLE_RATE || '8000',
        channels: process.env.DG_CHANNELS || '1',
        smartFormat: process.env.DG_SMART_FORMAT !== 'false',
        diarize: process.env.DG_DIARIZE === 'true',
      });
    } else {
      console.info('[ASRWorker] Exotel→Deepgram bridge: DISABLED (set EXO_BRIDGE_ENABLED=true to enable)');
    }
    
    this.metrics = new MetricsCollector();

    // Initialize buffer manager, connection health monitor, and circuit breaker
    this.bufferManager = new BufferManager();
    this.connectionHealthMonitor = new ConnectionHealthMonitor();
    this.circuitBreaker = new ElevenLabsCircuitBreaker({
      failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
      timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000', 10),
      resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '300000', 10),
    });

    // Create ASR provider with circuit breaker and connection health monitor (for ElevenLabs)
    try {
      this.asrProvider = createAsrProvider(ASR_PROVIDER, {
        circuitBreaker: this.circuitBreaker,
        connectionHealthMonitor: this.connectionHealthMonitor,
      });
    } catch (error: any) {
      console.error('[ASRWorker] ❌ Failed to create ASR provider:', error.message);
      console.error('[ASRWorker] Provider type:', ASR_PROVIDER);
      console.error('[ASRWorker] This is a fatal error - service will not start.');
      throw error; // Re-throw to fail fast
    }

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
          subscriptions: this.subscriptions.length,
          exoBridgeEnabled: process.env.EXO_BRIDGE_ENABLED === 'true',
        };
        
        // Add buffer details
        const bufferDetails: any[] = [];
        for (const [interactionId, buffer] of this.buffers.entries()) {
          bufferDetails.push({
            interactionId,
            chunksCount: buffer.chunks.length,
            totalAudioMs: buffer.chunks.length > 0 
              ? ((buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / 2 / buffer.sampleRate) * 1000).toFixed(0)
              : 0,
            lastChunkReceived: buffer.lastChunkReceived > 0 
              ? `${Date.now() - buffer.lastChunkReceived}ms ago`
              : 'never',
          });
        }
        health.buffers = bufferDetails;
        
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
        
        // Add buffer manager health
        const bufferHealth = this.bufferManager.getSystemHealth();
        health.bufferManager = {
          totalBuffers: bufferHealth.totalBuffers,
          activeBuffers: bufferHealth.activeBuffers,
          staleBuffers: bufferHealth.staleBuffers,
          memoryUsage: {
            heapUsed: Math.round(bufferHealth.memoryUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(bufferHealth.memoryUsage.heapTotal / 1024 / 1024) + 'MB',
            rss: Math.round(bufferHealth.memoryUsage.rss / 1024 / 1024) + 'MB',
          },
        };
        
        // Add connection health monitor stats
        const connectionHealth = this.connectionHealthMonitor.performHealthCheck();
        health.connectionHealth = {
          totalConnections: connectionHealth.totalConnections,
          healthyConnections: connectionHealth.healthyConnections,
          unhealthyConnections: connectionHealth.unhealthyConnections,
          unhealthyDetails: connectionHealth.unhealthyDetails,
        };
        
        // Add circuit breaker stats
        const circuitBreakerStats = this.circuitBreaker.getStats();
        health.circuitBreaker = {
          state: circuitBreakerStats.state,
          failureCount: circuitBreakerStats.failureCount,
          threshold: circuitBreakerStats.threshold,
          timeSinceLastFailure: Math.round(circuitBreakerStats.timeSinceLastFailure / 1000) + 's',
          timeout: Math.round(circuitBreakerStats.timeout / 1000) + 's',
        };
        
        res.end(JSON.stringify(health, null, 2));
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
    // Start background processor for queued transcripts (ElevenLabs only)
    // This ensures transcripts queued during silence detection are still published
    if (ASR_PROVIDER === 'elevenlabs') {
      this.startQueuedTranscriptProcessor();
    }

    // Subscribe to audio topics
    // For POC, subscribe to audio_stream (shared stream)
    // In production, would subscribe to audio.{tenant_id} per tenant
    const audioTopicName = audioTopic({ useStreams: true });
    console.info(`[ASRWorker] 🔔 Subscribing to audio topic: ${audioTopicName}`);

    try {
      const audioHandle = await this.pubsub.subscribe(audioTopicName, async (msg) => {
        // CRITICAL FIX: Explicit validation before processing
        if (!msg || !msg.audio) {
          console.error(`[ASRWorker] ❌ CRITICAL: Message missing audio field!`, {
            interaction_id: msg?.interaction_id || 'unknown',
            seq: msg?.seq || 'unknown',
            msgKeys: msg ? Object.keys(msg) : [],
            msgStructure: msg ? JSON.stringify(msg, null, 2).substring(0, 1000) : 'null',
          });
          return; // Don't process invalid messages
        }
        
        // Only log if there's actual audio data (ingestion happening)
        if (msg.audio.length > 0) {
          logger.info(`[ASRWorker] 📨 Message received from Redis for topic ${audioTopicName}`, {
            interaction_id: msg?.interaction_id || 'unknown',
            seq: msg?.seq || 'unknown',
            has_audio: !!msg?.audio,
            audio_length: msg?.audio?.length || 0,
            audio_type: typeof msg?.audio,
            msg_keys: Object.keys(msg || {}),
            msg_preview: JSON.stringify(msg).substring(0, 500),
            timestamp: new Date().toISOString(),
          });
        } else {
          // Empty messages - only log at debug level
          logger.debug(`[ASRWorker] 📨 Empty message received from Redis (no audio)`, {
            interaction_id: msg?.interaction_id || 'unknown',
            seq: msg?.seq || 'unknown',
          });
        }
        
        try {
          await this.handleAudioFrame(msg as any);
        } catch (error: any) {
          console.error(`[ASRWorker] ❌ Error in handleAudioFrame:`, {
            error: error.message,
            stack: error.stack,
            interaction_id: msg?.interaction_id,
            seq: msg?.seq,
            error_name: error.name,
          });
        }
      });
      console.info(`[ASRWorker] ✅ Successfully subscribed to audio topic: ${audioTopicName}`, {
        subscriptionId: audioHandle.id,
        topic: audioHandle.topic,
      });
      this.subscriptions.push(audioHandle);
    } catch (error: any) {
      console.error(`[ASRWorker] ❌ CRITICAL: Failed to subscribe to audio topic ${audioTopicName}:`, {
        error: error.message,
        stack: error.stack,
      });
      throw error; // Fail fast if subscription fails
    }

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
      const exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
      console.info(`[ASRWorker] Server listening on port ${PORT}`);
      console.info(`[ASRWorker] Metrics: http://localhost:${PORT}/metrics`);
      console.info(`[ASRWorker] Health: http://localhost:${PORT}/health`);
      
      // Log condensed config summary (mask secrets)
      const configSummary: any = {
        asrProvider: ASR_PROVIDER,
        exoBridgeEnabled,
      };
      
      if (exoBridgeEnabled && ASR_PROVIDER === 'deepgram') {
        const deepgramKey = process.env.DEEPGRAM_API_KEY;
        configSummary.deepgramApiKey = deepgramKey ? `${deepgramKey.substring(0, 8)}...${deepgramKey.substring(deepgramKey.length - 4)}` : 'NOT SET';
        configSummary.model = process.env.DG_MODEL || process.env.DEEPGRAM_MODEL || 'nova-3';
        configSummary.encoding = process.env.DG_ENCODING || 'linear16';
        configSummary.sampleRate = process.env.DG_SAMPLE_RATE || '8000';
        configSummary.channels = process.env.DG_CHANNELS || '1';
        configSummary.diarize = process.env.DG_DIARIZE === 'true';
      }
      
      console.info(`[ASRWorker] Configuration:`, configSummary);
    });
  }

  /**
   * Simple audio frame handler - just buffers audio chunks in memory
   * Timer job will process buffered chunks every 5 seconds
   */
  private async handleAudioFrame(msg: any): Promise<void> {
    const interactionId = msg?.interaction_id;
    const seq = msg?.seq;
    
    try {
      // Skip if call has ended
    if (interactionId && this.endedCalls.has(interactionId)) {
        return;
      }

      // Get audio data from message (support multiple field names)
      let audioData: string | undefined = msg.audio || msg.audio_data || msg.data || msg.payload;
      
      if (!audioData || typeof audioData !== 'string') {
        console.error('[ASRWorker] ❌ Missing audio data:', {
        interaction_id: interactionId,
          seq,
        });
        return;
      }

      // Validate base64 format
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(audioData)) {
        console.error('[ASRWorker] ❌ Invalid base64 format:', {
          interaction_id: interactionId,
          seq,
        });
        return;
      }

      // Decode base64 to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      if (audioBuffer.length === 0) {
        return;
      }

      // Get sample rate (default to 16000 for ElevenLabs optimal quality)
      const sampleRate = msg.sample_rate || 16000;
      const tenantId = msg.tenant_id;

      // Get or create buffer
      let buffer = this.buffers.get(interactionId);
      if (!buffer) {
        // Remove from endedCalls if reused
        if (this.endedCalls.has(interactionId)) {
          this.endedCalls.delete(interactionId);
        }
        
        this.bufferManager.createBuffer(interactionId, tenantId, sampleRate);
        
        buffer = {
          interactionId,
          tenantId,
          sampleRate,
          chunks: [],
          timestamps: [],
          sequences: [],
          lastProcessed: Date.now(),
          lastChunkReceived: Date.now(),
        };
        this.buffers.set(interactionId, buffer);
        
      // Start 5-second timer for this interaction
      // this.startBufferProcessingTimer(interactionId);
      
      // Check buffer size immediately
      // this.checkAndProcessBuffer(interactionId);
      }

      // Add chunk to buffer
      buffer.chunks.push(audioBuffer);
      buffer.timestamps.push(msg.timestamp_ms || Date.now());
      buffer.sequences.push(seq);
      buffer.lastChunkReceived = Date.now();
      
      this.bufferManager.updateBufferActivity(interactionId);
      this.metrics.recordAudioChunk(interactionId);
      
      // Log every 10th chunk to avoid spam
      if (seq % 10 === 0) {
      const totalBytes = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const totalAudioMs = (totalBytes / 2 / sampleRate) * 1000;
        
        console.info(`[ASRWorker] 📥 Buffered chunk ${seq}`, {
          interaction_id: interactionId,
          chunks_buffered: buffer.chunks.length,
          total_audio_ms: totalAudioMs.toFixed(0),
        });
      }

      // Check and process buffer if it exceeds threshold
      await this.checkAndProcessBuffer(interactionId);
    } catch (error: any) {
      console.error('[ASRWorker] Error buffering audio:', error);
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

      // CRITICAL: Mark call as ended with timestamp (for grace period)
      this.endedCalls.set(interactionId, Date.now());
      console.info('[ASRWorker] Call end event received - will stop processing after grace period', {
        interaction_id: interactionId,
        reason: msg.reason,
        call_sid: msg.call_sid,
        grace_period_ms: this.ENDED_CALL_GRACE_PERIOD_MS,
        note: 'Late-arriving audio frames will be processed for 10 seconds after call_end',
      });

      // Use BufferManager to handle call end (includes comprehensive logging)
      this.bufferManager.handleCallEnd(interactionId);

      // Clean up buffer for this interaction
      const buffer = this.buffers.get(interactionId);
      if (buffer) {
        // Update buffer stats in BufferManager before cleanup
        const totalBytes = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const totalAudioMs = (totalBytes / 2 / buffer.sampleRate) * 1000;
        this.bufferManager.updateBufferStats(interactionId, {
          chunksCount: buffer.chunks.length,
          totalAudioMs,
        });
        
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
          // Check if provider supports closing a specific connection (e.g., Deepgram, ElevenLabs)
          if (typeof (this.asrProvider as any).closeConnection === 'function') {
            await (this.asrProvider as any).closeConnection(interactionId);
          }
        } catch (error: any) {
          console.warn('[ASRWorker] Error closing ASR provider connection:', error.message);
        }
        
        // Untrack connection in health monitor
        this.connectionHealthMonitor.untrackConnection(interactionId);
      } else {
        // BufferManager already logged the "No buffer found" warning with detailed diagnostics
        // Just ensure connection is untracked
        this.connectionHealthMonitor.untrackConnection(interactionId);
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

      // Clean up old ended calls (older than 1 minute)
      for (const [interactionId, endedAt] of this.endedCalls.entries()) {
        if (now - endedAt > 60000) { // 1 minute
          this.endedCalls.delete(interactionId);
        }
      }

      for (const [interactionId, buffer] of this.buffers.entries()) {
        const timeSinceLastChunk = now - buffer.lastChunkReceived;
        // CRITICAL: Don't clean up buffers that have sent initial chunk but are waiting for continuous streaming
        // Clean up if no audio received for a long time (stale buffer)
        const isStale = timeSinceLastChunk >= STALE_BUFFER_TIMEOUT_MS;
        
        if (isStale) {
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
  /**
   * Process buffered audio if it exceeds the minimum duration
   * This replaces the timer-based approach for lower latency
   */
  private async checkAndProcessBuffer(interactionId: string): Promise<void> {
      const buffer = this.buffers.get(interactionId);
    if (!buffer || buffer.chunks.length === 0) return;

    // Calculate total audio duration
    const totalBytes = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const totalAudioMs = (totalBytes / 2 / buffer.sampleRate) * 1000;

    // CRITICAL: Only send if we have enough audio (100ms)
    // This prevents "commit_throttled" errors and 10s timeouts from ElevenLabs
    const MIN_SEND_DURATION_MS = 100;

    if (totalAudioMs < MIN_SEND_DURATION_MS) {
      return; // Keep buffering
    }

    try {
      // Get all buffered chunks
      const chunksToProcess = [...buffer.chunks];
      const numChunks = chunksToProcess.length;
      
      // Merge all chunks into a single buffer
      const mergedAudio = Buffer.concat(chunksToProcess);
      
      // Clear the buffer (we're sending everything)
      buffer.chunks = [];
      buffer.timestamps = [];
      buffer.sequences = [];
      
      // Create a single sequence number for this merged chunk
      const seq = Math.floor(Date.now() / 1000);
      
      console.info(`[ASRWorker] 🚀 Sending buffered audio (threshold reached)`, {
        interaction_id: interactionId,
        chunks_found: numChunks,
        total_audio_ms: totalAudioMs.toFixed(0),
        threshold_ms: MIN_SEND_DURATION_MS,
      });
      
      // Send to ElevenLabs and measure response time
      const startTime = Date.now();
      const transcript = await this.asrProvider.sendAudioChunk(mergedAudio, {
          interactionId,
        seq,
        sampleRate: buffer.sampleRate,
      });
      const responseTimeMs = Date.now() - startTime;
      
      // Log results
      console.info(`[ASRWORKER] ✅ ElevenLabs response received`, {
        interaction_id: interactionId,
        chunks_sent: numChunks,
        audio_duration_ms: totalAudioMs.toFixed(0),
        response_time_ms: responseTimeMs,
        transcript_text: transcript.text || '(empty)',
        transcript_type: transcript.type,
        transcript_length: transcript.text?.length || 0,
      });
      
      // CRITICAL FIX: Filter empty transcripts before publishing
      const hasText = transcript.text && transcript.text.trim().length > 0;
      if (hasText) {
        await this.publishTranscript(interactionId, transcript, seq);
      }
      
    } catch (error: any) {
      console.error(`[ASRWORKER] ❌ Buffer processing error for ${interactionId}:`, error);
          this.metrics.recordError(error.message || String(error));
    }
  }

  /**
   * Simple timer-based processing: runs every 5 seconds
   * Merges all buffered chunks and sends to ElevenLabs
   */
  private startBufferProcessingTimer(interactionId: string): void {
    // Clear existing timer if any
    const existingTimer = this.bufferTimers.get(interactionId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    console.info(`[ASRWorker] 🚀 Starting 5-second timer for ${interactionId}`);

    // Timer interval: 5 seconds (configurable)
    const TIMER_INTERVAL_MS = parseInt(process.env.ASR_BUFFER_TIMER_INTERVAL_MS || '5000', 10);

    const timer = setInterval(async () => {
      const buffer = this.buffers.get(interactionId);
      
      // Clean up timer if buffer is gone
      if (!buffer) {
        clearInterval(timer);
        this.bufferTimers.delete(interactionId);
        return;
      }

      // Stop if call has ended
      if (this.endedCalls.has(interactionId)) {
        clearInterval(timer);
        this.bufferTimers.delete(interactionId);
        return;
      }

      // Skip if no chunks buffered
    if (buffer.chunks.length === 0) {
      return;
    }

    try {
        // Get all buffered chunks
        const chunksToProcess = [...buffer.chunks];
        const numChunks = chunksToProcess.length;
        
        // Merge all chunks into a single buffer
        const mergedAudio = Buffer.concat(chunksToProcess);
        
        // Calculate total audio duration
        const totalAudioMs = (mergedAudio.length / 2 / buffer.sampleRate) * 1000;
        
        // Clear the buffer (we're sending everything)
        buffer.chunks = [];
        buffer.timestamps = [];
        buffer.sequences = [];
        
        // Create a single sequence number for this merged chunk
        const seq = Math.floor(Date.now() / 1000);
        
        console.info(`[ASRWorker] ⏰ Timer triggered - sending buffered audio`, {
          interaction_id: interactionId,
          chunks_found: numChunks,
          total_audio_ms: totalAudioMs.toFixed(0),
          merged_size_bytes: mergedAudio.length,
        });
        
        // Send to ElevenLabs and measure response time
        const startTime = Date.now();
        const transcript = await this.asrProvider.sendAudioChunk(mergedAudio, {
          interactionId,
        seq,
        sampleRate: buffer.sampleRate,
        });
        const responseTimeMs = Date.now() - startTime;
        
        // Log results
        console.info(`[ASRWORKER] ✅ ElevenLabs response received`, {
          interaction_id: interactionId,
          chunks_sent: numChunks,
          audio_duration_ms: totalAudioMs.toFixed(0),
          response_time_ms: responseTimeMs,
          transcript_text: transcript.text || '(empty)',
          transcript_type: transcript.type,
          transcript_length: transcript.text?.length || 0,
        });
        
        // Publish transcript if not empty
        if (transcript.text && transcript.text.trim()) {
          await this.publishTranscript(interactionId, transcript, seq);
        }
        
      } catch (error: any) {
        console.error(`[ASRWORKER] ❌ Timer processing error for ${interactionId}:`, error);
        this.metrics.recordError(error.message || String(error));
      }
    }, TIMER_INTERVAL_MS);

    this.bufferTimers.set(interactionId, timer);
  }

  /**
   * Publish transcript to the transcript ingestion topic
   */
  private async publishTranscript(interactionId: string, transcript: any, seq: number): Promise<void> {
    try {
      const topic = transcriptTopic(interactionId);
      const type = (transcript.isFinal || transcript.type === 'final') ? 'final' : 'partial';
      
      const transcriptMsg: TranscriptMessage = {
        interaction_id: interactionId,
        tenant_id: 'default',
        seq: seq,
        type: type,
        text: transcript.text,
        confidence: transcript.confidence || 0.9,
        timestamp_ms: Date.now(),
      };

      // POC CHANGE: Push to Redis List instead of publishing to stream
      // await this.pubsub.publish(topic, transcriptMsg);
      const listKey = `transcripts:${interactionId}`;
      await this.redis.rpush(listKey, JSON.stringify(transcriptMsg));
      
      console.info(`[ASRWORKER] 📤 Pushed transcript to Redis List ${listKey}`, {
        interaction_id: interactionId,
        seq: seq,
        type: type,
        textLength: transcript.text?.length || 0
      });
    } catch (error: any) {
      console.error(`[ASRWORKER] Error publishing transcript:`, error);
      this.metrics.recordError(error.message || String(error));
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
      
      // CRITICAL FIX: Filter empty transcripts before publishing
      // Empty transcripts create noise and don't provide value
      const hasText = transcript.text && transcript.text.trim().length > 0;
      if (!hasText) {
        console.debug(`[ASRWorker] ⏭️ Skipping empty transcript (not publishing)`, {
          interaction_id: buffer.interactionId,
          seq,
          type: transcript.type,
          provider: process.env.ASR_PROVIDER || 'mock',
          note: 'Empty transcripts are filtered to reduce noise and improve performance',
        });
        return; // Don't publish empty transcripts
      }

      // Record first partial latency
      if (transcript.type === 'partial' && !transcript.isFinal) {
        this.metrics.recordFirstPartial(buffer.interactionId);
      }

      // Use the centralized publishTranscript method
      await this.publishTranscript(buffer.interactionId, transcript, seq);

    } catch (error: any) {
      console.error(`[ASRWorker] Error handling transcript response:`, error);
      this.metrics.recordError(error.message || String(error));
    }
  }

  /**
   * Start background processor for queued transcripts
   * This processes transcripts that were queued when audio wasn't being sent
   * (e.g., during silence detection)
   */
  private startQueuedTranscriptProcessor(): void {
    // Only for ElevenLabs provider
    if (ASR_PROVIDER !== 'elevenlabs') {
      return;
    }

    // Check if provider has processQueuedTranscripts method
    const providerAny = this.asrProvider as any;
    if (typeof providerAny.processQueuedTranscripts !== 'function') {
      console.warn('[ASRWorker] Provider does not support queued transcript processing');
      return;
    }

    console.info('[ASRWorker] 🔄 Starting background processor for queued transcripts (runs every 500ms)');

    // Process queued transcripts every 500ms
    this.queuedTranscriptProcessorInterval = setInterval(() => {
      try {
        const processedCount = providerAny.processQueuedTranscripts(
          (transcript: any, interactionId: string) => {
            // Get or create buffer for this interaction
            let buffer = this.buffers.get(interactionId);
            
            // If buffer doesn't exist, create a minimal one for publishing
            if (!buffer) {
              // Create minimal buffer for queued transcripts
              buffer = {
                interactionId,
                tenantId: 'default', // Default tenant if not available
                chunks: [],
                timestamps: [],
                sequences: [],
                sampleRate: 16000, // Default sample rate
                lastProcessed: Date.now(),
                lastChunkReceived: Date.now(),
              };
              // Don't add to buffers map - this is temporary for publishing only
            }

            // Generate a seq number based on timestamp (for queued transcripts)
            // Use timestamp to ensure uniqueness
            const seq = Math.floor(Date.now() / 1000); // Use seconds as seq for queued transcripts

            // Publish transcript using existing handler
            this.handleTranscriptResponse(buffer, transcript, seq).catch((error: any) => {
              console.error(`[ASRWorker] Error publishing queued transcript for ${interactionId}:`, error);
            });
          }
        );

        if (processedCount > 0) {
          console.debug(`[ASRWorker] Processed ${processedCount} queued transcript(s) from background processor`);
        }
      } catch (error: any) {
        console.error('[ASRWorker] Error in queued transcript processor:', error);
      }
    }, 500); // Run every 500ms as specified in plan
  }

  async stop(): Promise<void> {
    console.info('[ASRWorker] 🛑 Stopping ASR Worker service...');
    
    // Stop background processor
    if (this.queuedTranscriptProcessorInterval) {
      clearInterval(this.queuedTranscriptProcessorInterval);
      this.queuedTranscriptProcessorInterval = null;
      console.info('[ASRWorker] ✅ Stopped queued transcript processor');
    }

    // Flush remaining queued transcripts before stopping (ElevenLabs only)
    if (ASR_PROVIDER === 'elevenlabs') {
      const providerAny = this.asrProvider as any;
      if (typeof providerAny.processQueuedTranscripts === 'function') {
        try {
          const flushedCount = providerAny.processQueuedTranscripts(
            (transcript: any, interactionId: string) => {
              let buffer = this.buffers.get(interactionId);
              if (!buffer) {
                buffer = {
                  interactionId,
                  tenantId: 'default',
                  chunks: [],
                  timestamps: [],
                  sequences: [],
                  sampleRate: 16000,
                  lastProcessed: Date.now(),
                  lastChunkReceived: Date.now(),
                };
              }
              const seq = Math.floor(Date.now() / 1000);
              this.handleTranscriptResponse(buffer, transcript, seq).catch((error: any) => {
                console.error(`[ASRWorker] Error flushing queued transcript for ${interactionId}:`, error);
              });
            }
          );
          if (flushedCount > 0) {
            console.info(`[ASRWorker] Flushed ${flushedCount} queued transcript(s) before shutdown`);
          }
        } catch (error: any) {
          console.error('[ASRWorker] Error flushing queued transcripts:', error);
        }
      }
    }
    
    // Unsubscribe from all topics
    for (const handle of this.subscriptions) {
      await handle.unsubscribe();
    }

    // Clean up buffer manager, connection health monitor, and circuit breaker
    try {
      this.bufferManager.destroy();
      this.connectionHealthMonitor.destroy();
      console.info('[ASRWorker] ✅ Cleaned up buffer manager and connection health monitor');
    } catch (error: any) {
      console.error('[ASRWorker] Error cleaning up managers:', error);
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
console.info('[ASRWorker] 🚀 Starting ASR Worker service...');
const worker = new AsrWorker();
console.info('[ASRWorker] ✅ ASR Worker instance created, calling start()...');
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



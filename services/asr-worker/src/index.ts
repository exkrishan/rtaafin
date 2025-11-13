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
import { BufferManager } from './buffer-manager';
import { ConnectionHealthMonitor } from './connection-health-monitor';
import { ElevenLabsCircuitBreaker } from './circuit-breaker';

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
const ASR_PROVIDER = (process.env.ASR_PROVIDER || 'mock') as 'mock' | 'deepgram' | 'whisper' | 'google' | 'elevenlabs';

interface AudioBuffer {
  interactionId: string;
  tenantId: string;
  sampleRate: number;
  chunks: Buffer[];
  timestamps: number[];
  sequences: number[]; // Track sequence numbers from incoming audio frames
  lastProcessed: number;
  lastChunkReceived: number; // Timestamp of last audio chunk received
  hasSentInitialChunk: boolean; // Track if we've sent the initial 500ms chunk
  isProcessing: boolean; // Prevent concurrent processing of the same buffer
  lastContinuousSendTime: number; // Timestamp of last continuous chunk send (doesn't reset on buffer clear)
  processTimer?: NodeJS.Timeout; // Timer for periodic processing (ensures sends every 200ms)
  lastExpectedSeq?: number; // Track last expected sequence number for gap detection
}

class AsrWorker {
  private pubsub: ReturnType<typeof createPubSubAdapterFromEnv>;
  private asrProvider: ReturnType<typeof createAsrProvider>;
  private buffers: Map<string, AudioBuffer> = new Map();
  private metrics: MetricsCollector;
  private server: ReturnType<typeof createServer>;
  private subscriptions: any[] = [];
  private bufferTimers: Map<string, NodeJS.Timeout> = new Map(); // Track timers per buffer for cleanup
  private endedCalls: Set<string> = new Set(); // Track ended calls to stop processing/logging
  private bufferManager: BufferManager; // Comprehensive buffer lifecycle management
  private connectionHealthMonitor: ConnectionHealthMonitor; // Connection health monitoring
  private circuitBreaker: ElevenLabsCircuitBreaker; // Circuit breaker for ElevenLabs API

  constructor() {
    this.pubsub = createPubSubAdapterFromEnv();
    
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
            hasSentInitialChunk: buffer.hasSentInitialChunk,
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
    // Subscribe to audio topics
    // For POC, subscribe to audio_stream (shared stream)
    // In production, would subscribe to audio.{tenant_id} per tenant
    const audioTopicName = audioTopic({ useStreams: true });
    console.info(`[ASRWorker] 🔔 Subscribing to audio topic: ${audioTopicName}`);

    try {
      const audioHandle = await this.pubsub.subscribe(audioTopicName, async (msg) => {
        // CRITICAL: Log when message is received from Redis (diagnostic)
        console.info(`[ASRWorker] 📨 Message received from Redis for topic ${audioTopicName}`, {
          interaction_id: msg?.interaction_id || 'unknown',
          seq: msg?.seq || 'unknown',
          has_audio: !!msg?.audio,
          audio_length: msg?.audio?.length || 0,
          timestamp: new Date().toISOString(),
        });
        try {
          await this.handleAudioFrame(msg as any);
        } catch (error: any) {
          console.error(`[ASRWorker] ❌ Error in handleAudioFrame:`, {
            error: error.message,
            stack: error.stack,
            interaction_id: msg?.interaction_id,
            seq: msg?.seq,
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

  private async handleAudioFrame(msg: any): Promise<void> {
    const interactionId = msg?.interaction_id;
    const seq = msg?.seq;
    
    // CRITICAL: Log entry into handler for debugging
    console.info(`[ASRWorker] 🎵 Processing audio for ${interactionId}`, {
      interaction_id: interactionId,
      seq,
      has_audio: !!msg?.audio,
      audio_length: msg?.audio?.length || 0,
      audio_type: typeof msg?.audio,
      msg_keys: Object.keys(msg || {}),
    });
    
    // CRITICAL: Stop processing if call has ended - log this so we know why it's skipped
    if (interactionId && this.endedCalls.has(interactionId)) {
      console.debug(`[ASRWorker] ⏸️ Skipping audio - call has ended for ${interactionId}`, {
        interaction_id: interactionId,
        seq,
      });
      return;
    }
    
    // Check Exotel Bridge feature flag - skip processing if bridge is disabled
    const exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
    if (!exoBridgeEnabled) {
      // CRITICAL: Log at info level so it's visible in production logs
      console.warn('[ASRWorker] ⚠️ Bridge disabled (EXO_BRIDGE_ENABLED != true), skipping audio frame processing', {
        interaction_id: interactionId,
        seq: msg?.seq,
        env_value: process.env.EXO_BRIDGE_ENABLED || 'NOT SET',
        note: 'Set EXO_BRIDGE_ENABLED=true to enable audio processing',
      });
      return;
    }

    try {
      // Validate audio field exists and is a string
      if (!msg.audio || typeof msg.audio !== 'string') {
        console.error('[ASRWorker] ❌ Invalid audio field in message:', {
          interaction_id: msg.interaction_id,
          seq: msg.seq,
          audio_type: typeof msg.audio,
          audio_length: msg.audio?.length,
          msg_keys: Object.keys(msg),
          has_audio_key: 'audio' in msg,
          msg_preview: JSON.stringify(msg).substring(0, 200),
        });
        return;
      }
      
      // Log that we're proceeding with audio validation
      console.debug(`[ASRWorker] 🔍 Audio validation starting for ${interactionId}`, {
        interaction_id: interactionId,
        seq: msg?.seq,
        audio_length: msg.audio.length,
      });

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
      // CRITICAL: Default to 8000 Hz for telephony (Exotel), not 24000
      // Exotel telephony audio is always 8000 Hz
      const frame: AudioFrameMessage = {
        tenant_id: msg.tenant_id,
        interaction_id: msg.interaction_id,
        seq: msg.seq,
        timestamp_ms: msg.timestamp_ms || Date.now(),
        sample_rate: msg.sample_rate || 8000, // Changed from 24000 to 8000 for telephony
        encoding: msg.encoding || 'pcm16',
        audio: msg.audio, // base64 string
      };
      
      // CRITICAL: Validate sample rate - support both 8kHz (telephony) and 16kHz (optimal for transcription)
      // Exotel can send 8kHz, 16kHz, or 24kHz (per Exotel docs)
      // ElevenLabs supports 8kHz and 16kHz - 16kHz is recommended for better transcription quality
      // However, 8kHz is standard for telephony and may be required for compatibility
      const PREFERRED_SAMPLE_RATE = parseInt(process.env.ELEVENLABS_PREFERRED_SAMPLE_RATE || '8000', 10);
      const ALLOWED_SAMPLE_RATES = [8000, 16000];
      
      if (!msg.sample_rate || !ALLOWED_SAMPLE_RATES.includes(msg.sample_rate)) {
        // If sample rate is missing or invalid, use preferred rate (default 8000 for telephony)
        const correctedRate = ALLOWED_SAMPLE_RATES.includes(PREFERRED_SAMPLE_RATE) 
          ? PREFERRED_SAMPLE_RATE 
          : 8000; // Fallback to 8000 if env var is invalid
        
        console.warn(`[ASRWorker] ⚠️ Invalid or missing sample_rate (${msg.sample_rate || 'missing'}), using ${correctedRate} Hz`, {
          interaction_id: msg.interaction_id,
          seq: msg.seq,
          received_sample_rate: msg.sample_rate,
          corrected_sample_rate: correctedRate,
          preferred_sample_rate: PREFERRED_SAMPLE_RATE,
          note: correctedRate === 8000 
            ? 'Using 8kHz for telephony compatibility. Set ELEVENLABS_PREFERRED_SAMPLE_RATE=16000 for better transcription quality.'
            : 'Using 16kHz for optimal transcription quality. Note: Ensure Exotel is configured to send 16kHz audio.',
        });
        frame.sample_rate = correctedRate;
      } else if (msg.sample_rate === 16000 && PREFERRED_SAMPLE_RATE === 8000) {
        // If Exotel sends 16kHz but we prefer 8kHz, log a note
        console.debug(`[ASRWorker] ℹ️ Exotel sent 16kHz audio (optimal for transcription)`, {
          interaction_id: msg.interaction_id,
          seq: msg.seq,
          sample_rate: msg.sample_rate,
          note: '16kHz provides better transcription quality than 8kHz. Consider setting ELEVENLABS_PREFERRED_SAMPLE_RATE=16000.',
        });
      }

      const { interaction_id, tenant_id, seq, sample_rate, audio } = frame;

      // Get or create buffer for this interaction
      let buffer = this.buffers.get(interaction_id);
      if (!buffer) {
        // If this is a new buffer, remove from endedCalls (in case same interaction_id is reused)
        if (this.endedCalls.has(interaction_id)) {
          this.endedCalls.delete(interaction_id);
          console.debug(`[ASRWorker] Removed ${interaction_id} from endedCalls - new call started`);
        }
        
        // Create buffer in BufferManager
        this.bufferManager.createBuffer(interaction_id, tenant_id, sample_rate);
        
        buffer = {
          interactionId: interaction_id,
          tenantId: tenant_id,
          sampleRate: sample_rate,
          chunks: [],
          timestamps: [],
          sequences: [], // Track sequence numbers from incoming audio frames
          lastProcessed: Date.now(),
          lastChunkReceived: Date.now(),
          hasSentInitialChunk: false, // Haven't sent initial chunk yet
          isProcessing: false, // Not currently processing
          lastContinuousSendTime: 0, // Will be set after initial chunk
        };
        this.buffers.set(interaction_id, buffer);
      } else {
        // Update buffer activity in BufferManager
        this.bufferManager.updateBufferActivity(interaction_id);
      }

      // Update last chunk received timestamp
      buffer.lastChunkReceived = Date.now();
      
      // Update buffer activity and stats in BufferManager
      this.bufferManager.updateBufferActivity(interaction_id);

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
        
        // Enhanced audio quality validation: calculate energy/amplitude
        let audioEnergy = 0;
        let maxAmplitude = 0;
        let minAmplitude = 0;
        if (sampleValues.length > 0) {
          // Calculate RMS (Root Mean Square) energy
          const sumSquares = sampleValues.reduce((sum, val) => sum + (val * val), 0);
          audioEnergy = Math.sqrt(sumSquares / sampleValues.length);
          maxAmplitude = Math.max(...sampleValues.map(Math.abs));
          minAmplitude = Math.min(...sampleValues.map(Math.abs));
        }
        
        // Warn if audio is all zeros (silence) - enhanced detection
        const SILENCE_THRESHOLD = 100; // RMS energy threshold for silence (PCM16 range is -32768 to 32767)
        const isSilence = allZeros || audioEnergy < SILENCE_THRESHOLD;
        
        if (isSilence) {
          // Log at info level for first few chunks, debug level for later chunks
          const logLevel = seq <= 5 ? 'info' : 'debug';
          const logFn = logLevel === 'info' ? console.info : console.debug;
          logFn(`[ASRWorker] ℹ️ Audio appears to be silence (energy: ${audioEnergy.toFixed(2)}, max: ${maxAmplitude}, allZeros: ${allZeros})`, {
            interaction_id,
            seq,
            samplesChecked: sampleCount,
            audioEnergy: audioEnergy.toFixed(2),
            maxAmplitude,
            minAmplitude,
            allZeros,
            silenceThreshold: SILENCE_THRESHOLD,
            note: 'This is normal for silence, but may cause empty transcripts from Deepgram.',
          });
        } else if (seq <= 5) {
          // Log audio quality metrics for first few chunks
          console.debug('[ASRWorker] 📊 Audio quality metrics', {
            interaction_id,
            seq,
            audioEnergy: audioEnergy.toFixed(2),
            maxAmplitude,
            minAmplitude,
            samplesChecked: sampleCount,
            note: 'Audio has sufficient energy for transcription.',
          });
        }
      }

      // CRITICAL: Sequence gap detection - track expected vs. actual sequence numbers
      const SEQUENCE_GAP_THRESHOLD = 10; // Warn if gap exceeds this
      if (buffer.lastExpectedSeq !== undefined) {
        const expectedSeq = buffer.lastExpectedSeq + 1;
        const gap = seq - expectedSeq;
        if (gap > SEQUENCE_GAP_THRESHOLD) {
          console.warn(`[ASRWorker] ⚠️ Sequence gap detected: expected ${expectedSeq}, received ${seq} (gap: ${gap})`, {
            interaction_id,
            expectedSeq,
            actualSeq: seq,
            gap,
            threshold: SEQUENCE_GAP_THRESHOLD,
            note: 'Large sequence gaps may indicate chunks are being lost or arriving out of order.',
          });
        } else if (gap < 0) {
          // Negative gap means sequence went backwards (out of order or duplicate)
          console.warn(`[ASRWorker] ⚠️ Sequence out of order: expected ${expectedSeq}, received ${seq} (gap: ${gap})`, {
            interaction_id,
            expectedSeq,
            actualSeq: seq,
            gap,
            note: 'Sequence numbers should be monotonically increasing. This may indicate out-of-order delivery or duplicate frames.',
          });
        }
      }
      buffer.lastExpectedSeq = seq; // Update last expected sequence
      
      buffer.chunks.push(audioBuffer);
      buffer.timestamps.push(frame.timestamp_ms);
      buffer.sequences.push(seq); // Track sequence number from incoming frame
      buffer.lastChunkReceived = Date.now(); // Update last chunk received time
      
      // Update buffer stats in BufferManager
      const totalSamples = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / 2;
      const totalAudioDurationMs = (totalSamples / buffer.sampleRate) * 1000;
      this.bufferManager.updateBufferStats(interaction_id, {
        chunksCount: buffer.chunks.length,
        totalAudioMs: totalAudioDurationMs,
      });

      // Log chunk added to buffer
      console.info(`[ASRWorker] 📥 Added chunk to buffer for ${interaction_id}`, {
        interaction_id,
        seq,
        chunksCount: buffer.chunks.length,
        totalAudioDurationMs: totalAudioDurationMs.toFixed(0),
        bufferSize: buffer.chunks.length,
        hasSentInitialChunk: buffer.hasSentInitialChunk,
      });

      // CRITICAL: Start/restart processing timer to ensure frequent sends
      // This ensures we check every 500ms if we should send, regardless of chunk arrival frequency
      this.startBufferProcessingTimer(interaction_id);

      // Reuse totalAudioDurationMs already calculated above for logging
      // Log new chunk arrival to verify new audio is coming in
      console.info(`[ASRWorker] 📥 Received audio chunk:`, {
        interaction_id,
        seq,
        audioSize: audioBuffer.length,
        chunkDurationMs: ((audioBuffer.length / 2) / sample_rate) * 1000,
        totalChunksInBuffer: buffer.chunks.length,
        totalAudioDurationMs: totalAudioDurationMs.toFixed(0),
        bufferAge: Date.now() - buffer.lastProcessed,
        meetsMinimum: totalAudioDurationMs >= CONTINUOUS_CHUNK_DURATION_MS, // Use CONTINUOUS_CHUNK_DURATION_MS (100ms) instead of MIN_AUDIO_DURATION_MS (200ms)
        minRequiredForSend: CONTINUOUS_CHUNK_DURATION_MS,
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
        const hasEnoughAudio = totalAudioDurationMs >= INITIAL_CHUNK_DURATION_MS;
        const hasWaitedTooLong = timeSinceBufferCreation >= MAX_INITIAL_WAIT_MS;
        
        // Send if we have enough audio OR if we've waited too long (prevent timeout)
        if (hasEnoughAudio || (hasWaitedTooLong && totalAudioDurationMs >= 20)) {
          // CRITICAL: Don't await processBuffer - it sends audio asynchronously
          // This prevents buffer from being locked during 5-second transcript wait
          buffer.isProcessing = true;
          this.processBuffer(buffer, hasWaitedTooLong).then(() => {
            // Clear processing flag after send completes (not after transcript arrives)
            buffer.isProcessing = false;
            buffer.lastProcessed = Date.now();
            buffer.hasSentInitialChunk = true;
            // Update buffer stats in BufferManager
            this.bufferManager.updateBufferStats(interaction_id, {
              hasSentInitialChunk: true,
            });
            buffer.lastContinuousSendTime = Date.now();
            if (hasWaitedTooLong) {
              console.warn(`[ASRWorker] ⚠️ First chunk sent early (${totalAudioDurationMs.toFixed(0)}ms) due to timeout risk (${timeSinceBufferCreation}ms wait)`, {
                interaction_id,
                audioDuration: totalAudioDurationMs.toFixed(0),
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
          totalAudioDurationMs: totalAudioDurationMs.toFixed(0),
          timeSinceLastSend: timeSinceLastSend,
          note: 'Timer checks every 500ms and sends when needed',
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

      // CRITICAL: Mark call as ended to stop all processing and logging
      this.endedCalls.add(interactionId);
      console.info('[ASRWorker] Call end event received - stopping all processing and logging', {
        interaction_id: interactionId,
        reason: msg.reason,
        call_sid: msg.call_sid,
      });

      // Use BufferManager to handle call end (includes comprehensive logging)
      this.bufferManager.handleCallEnd(interactionId);

      // Clean up buffer for this interaction
      const buffer = this.buffers.get(interactionId);
      if (buffer) {
        // Update buffer stats in BufferManager before cleanup
        const totalSamples = buffer.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / 2;
        const totalAudioMs = (totalSamples / buffer.sampleRate) * 1000;
        this.bufferManager.updateBufferStats(interactionId, {
          chunksCount: buffer.chunks.length,
          totalAudioMs,
          hasSentInitialChunk: buffer.hasSentInitialChunk,
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
      console.info(`[ASRWorker] 🚀 Starting timer for ${interactionId} (checks every 500ms)`, {
        interaction_id: interactionId,
        provider: ASR_PROVIDER,
        note: 'Timer will check every 500ms if audio should be sent to ASR provider',
      });
    }

    // Start new timer: check every 500ms (reduced frequency to match new send frequency)
    const PROCESSING_TIMER_INTERVAL_MS = 500; // Check every 500ms (increased from 200ms to reduce overhead)
    const timer = setInterval(async () => {
      const buffer = this.buffers.get(interactionId);
      if (!buffer) {
        // Buffer was cleaned up, clear timer
        clearInterval(timer);
        this.bufferTimers.delete(interactionId);
        return;
      }

      // CRITICAL: Stop processing if call has ended - no logs, no processing
      if (this.endedCalls.has(interactionId)) {
        // Silently skip - call has ended, clear timer and stop
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
      
      // Provider-specific thresholds
      // ElevenLabs can handle smaller chunks (100ms) and needs more frequent sends (500ms)
      // Deepgram prefers larger chunks (250ms) and can wait longer (1000ms)
      const isElevenLabs = ASR_PROVIDER === 'elevenlabs';
      const MIN_CHUNK_DURATION_MS = isElevenLabs ? 100 : 250; // ElevenLabs: 100ms, Deepgram: 250ms
      const MAX_TIME_BETWEEN_SENDS_MS = isElevenLabs ? 500 : 1000; // ElevenLabs: 500ms, Deepgram: 1000ms
      const TIMEOUT_FALLBACK_MS = isElevenLabs ? 1000 : 2000; // ElevenLabs: 1000ms, Deepgram: 2000ms
      const TIMEOUT_FALLBACK_MIN_MS = isElevenLabs ? 50 : 150; // ElevenLabs: 50ms, Deepgram: 150ms
      
      const isTooLongSinceLastSend = timeSinceLastContinuousSend >= MAX_TIME_BETWEEN_SENDS_MS;
      const hasMinimumChunkSize = currentAudioDurationMs >= MIN_CHUNK_DURATION_MS;
      const exceedsMaxChunkSize = currentAudioDurationMs >= MAX_CHUNK_DURATION_MS;
      const isTimeoutRisk = timeSinceLastContinuousSend >= TIMEOUT_FALLBACK_MS && currentAudioDurationMs >= TIMEOUT_FALLBACK_MIN_MS;

      // Process if:
      // 1. We have minimum chunk size (100ms for ElevenLabs, 250ms for Deepgram) - SEND
      // 2. Buffer exceeds max chunk size - SEND (split)
      // 3. Timeout risk: waited too long AND have minimum audio - SEND (prevent timeout)
      // 4. Timeout: waited >= MAX_TIME_BETWEEN_SENDS_MS - SEND (force send to prevent timeout)
      const hasTimedOut = timeSinceLastContinuousSend >= MAX_TIME_BETWEEN_SENDS_MS;
      const shouldProcess = hasMinimumChunkSize || exceedsMaxChunkSize || isTimeoutRisk || hasTimedOut;

      // Minimum chunk for send: provider-specific minimum normally, timeout fallback minimum if timeout risk
      const minChunkForSend = isTimeoutRisk ? TIMEOUT_FALLBACK_MIN_MS : MIN_CHUNK_DURATION_MS;
      
      // CRITICAL FIX: Log why we're processing or not processing
      if (shouldProcess) {
        console.info(`[ASRWorker] 📤 Timer: Triggering send for ${interactionId}`, {
          interactionId,
          currentAudioDurationMs: currentAudioDurationMs.toFixed(0),
          timeSinceLastSend: timeSinceLastContinuousSend,
          hasMinimumChunkSize,
          exceedsMaxChunkSize,
          isTimeoutRisk,
          hasTimedOut,
          chunksCount: buffer.chunks.length,
          minRequired: minChunkForSend,
          provider: ASR_PROVIDER,
          reason: hasTimedOut ? 'timeout' : (isTimeoutRisk ? 'timeout-risk' : (exceedsMaxChunkSize ? 'max-size' : 'optimal-chunk')),
        });
      } else {
        // Log why we're NOT processing (for debugging)
        console.debug(`[ASRWorker] ⏸️ Timer: Not sending for ${interactionId}`, {
          interactionId,
          currentAudioDurationMs: currentAudioDurationMs.toFixed(0),
          timeSinceLastSend: timeSinceLastContinuousSend,
          hasMinimumChunkSize,
          exceedsMaxChunkSize,
          isTimeoutRisk,
          hasTimedOut,
          chunksCount: buffer.chunks.length,
          minRequired: MIN_CHUNK_DURATION_MS,
          provider: ASR_PROVIDER,
          reason: !hasMinimumChunkSize ? `need ${MIN_CHUNK_DURATION_MS}ms, have ${currentAudioDurationMs.toFixed(0)}ms` : 
                  (timeSinceLastContinuousSend < MAX_TIME_BETWEEN_SENDS_MS ? `waiting for timeout (${MAX_TIME_BETWEEN_SENDS_MS}ms)` : 'unknown'),
        });
      }
      
      // CRITICAL FIX: Actually send if conditions are met
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
    // CRITICAL: Stop processing if call has ended - no logs, no processing
    if (this.endedCalls.has(buffer.interactionId)) {
      // Silently skip - call has ended, don't process or log anything
      return;
    }

    if (buffer.chunks.length === 0) {
      return;
    }

    try {
      // Provider-specific thresholds (must match timer settings)
      const isElevenLabs = ASR_PROVIDER === 'elevenlabs';
      const MIN_CHUNK_DURATION_MS = isElevenLabs ? 100 : 250; // ElevenLabs: 100ms, Deepgram: 250ms
      const MAX_WAIT_MS = isElevenLabs ? 500 : 1000; // ElevenLabs: 500ms, Deepgram: 1000ms
      const INITIAL_BURST_MS = isElevenLabs ? 100 : 250; // ElevenLabs: 100ms, Deepgram: 250ms
      
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
      
      // Determine required duration based on mode and provider
      let requiredDuration: number;
      const TIMEOUT_FALLBACK_MS = isElevenLabs ? 1000 : 2000; // ElevenLabs: 1000ms, Deepgram: 2000ms
      const TIMEOUT_FALLBACK_MIN_MS = isElevenLabs ? 50 : 150; // ElevenLabs: 50ms, Deepgram: 150ms
      
      if (!buffer.hasSentInitialChunk) {
        // Initial chunk: Require provider-specific burst OR send after timeout
        const MAX_INITIAL_WAIT_MS = MAX_WAIT_MS;
        if (timeSinceBufferCreation >= MAX_INITIAL_WAIT_MS && totalAudioDurationMs >= MIN_CHUNK_DURATION_MS) {
          // Force send if waited too long, but still require minimum
          requiredDuration = MIN_CHUNK_DURATION_MS;
        } else {
          requiredDuration = INITIAL_BURST_MS;
        }
      } else {
        // Continuous mode: Provider-specific minimum, with timeout fallback
        if (timeSinceLastSend >= TIMEOUT_FALLBACK_MS && totalAudioDurationMs >= TIMEOUT_FALLBACK_MIN_MS) {
          // Timeout risk: send what we have (even if < minimum) to prevent timeout
          requiredDuration = TIMEOUT_FALLBACK_MIN_MS;
          console.warn(`[ASRWorker] ⚠️ Timeout risk: sending ${totalAudioDurationMs.toFixed(0)}ms chunk (minimum: ${TIMEOUT_FALLBACK_MIN_MS}ms) to prevent ${ASR_PROVIDER} timeout after ${timeSinceLastSend}ms wait`, {
            interaction_id: buffer.interactionId,
            provider: ASR_PROVIDER,
            timeSinceLastSend,
            totalAudioDurationMs: totalAudioDurationMs.toFixed(0),
            chunksInBuffer: buffer.chunks.length,
            note: isElevenLabs ? 'ElevenLabs can handle smaller chunks - sending to prevent timeout' : 'This should be rare - chunks should accumulate to 250ms+ before this triggers',
          });
        } else if (timeSinceLastSend >= MAX_WAIT_MS && totalAudioDurationMs >= MIN_CHUNK_DURATION_MS) {
          // Normal timeout: waited max time and have minimum audio - send
          requiredDuration = MIN_CHUNK_DURATION_MS;
          console.info(`[ASRWorker] ⏰ Max wait reached: sending ${totalAudioDurationMs.toFixed(0)}ms chunk after ${timeSinceLastSend}ms wait`, {
            interaction_id: buffer.interactionId,
            provider: ASR_PROVIDER,
            timeSinceLastSend,
            totalAudioDurationMs: totalAudioDurationMs.toFixed(0),
          });
        } else {
          // Normal case: wait for provider-specific minimum
          requiredDuration = MIN_CHUNK_DURATION_MS;
        }
      }
      
      // Calculate how many bytes we need
      const requiredSamples = Math.floor((requiredDuration * buffer.sampleRate) / 1000);
      const requiredBytes = requiredSamples * 2; // 16-bit = 2 bytes per sample
      
      // Check if we have enough audio
      const hasEnoughAudio = totalBytes >= requiredBytes;
      
      if (!hasEnoughAudio) {
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
      let sequencesToSend: number[] = [];
      
      // Collect chunks until we have enough audio
      for (let i = 0; i < buffer.chunks.length; i++) {
        const chunk = buffer.chunks[i];
        if (bytesToSend + chunk.length <= requiredBytes || chunksToSend.length === 0) {
          // Include this chunk (or first chunk even if it exceeds limit)
          chunksToSend.push(chunk);
          timestampsToSend.push(buffer.timestamps[i]);
          sequencesToSend.push(buffer.sequences[i]);
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
      // CRITICAL FIX: Use the maximum sequence number from the chunks being sent
      // This preserves the actual sequence number from incoming audio frames
      const seq = Math.max(...sequencesToSend);
      
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
      const chunksBeforeClear = buffer.chunks.length;
      const timestampsBeforeClear = buffer.timestamps.length;
      const sequencesBeforeClear = buffer.sequences.length;
      
      // Validate that we're only removing chunks that were actually sent
      if (chunksToSend.length > chunksBeforeClear) {
        console.error(`[ASRWorker] ❌ CRITICAL: Attempting to remove more chunks (${chunksToSend.length}) than exist in buffer (${chunksBeforeClear})`, {
          interaction_id: buffer.interactionId,
          chunksToSend: chunksToSend.length,
          chunksInBuffer: chunksBeforeClear,
          timestampsToSend: timestampsToSend.length,
          sequencesToSend: sequencesToSend.length,
        });
        // Safety: only remove what exists
        buffer.chunks = [];
        buffer.timestamps = [];
        buffer.sequences = [];
      } else {
        buffer.chunks = buffer.chunks.slice(chunksToSend.length);
        buffer.timestamps = buffer.timestamps.slice(timestampsToSend.length);
        buffer.sequences = buffer.sequences.slice(sequencesToSend.length);
      }
      
      // Log buffer state transition for debugging
      console.debug(`[ASRWorker] 🔄 Buffer cleared: removed ${chunksToSend.length} chunks, ${buffer.chunks.length} remaining`, {
        interaction_id: buffer.interactionId,
        chunksRemoved: chunksToSend.length,
        chunksRemaining: buffer.chunks.length,
        timestampsRemoved: timestampsToSend.length,
        timestampsRemaining: buffer.timestamps.length,
        sequencesRemoved: sequencesToSend.length,
        sequencesRemaining: buffer.sequences.length,
        validation: chunksToSend.length === timestampsToSend.length && timestampsToSend.length === sequencesToSend.length ? 'OK' : 'MISMATCH',
      });
      
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
    console.info('[ASRWorker] 🛑 Stopping ASR Worker service...');
    
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


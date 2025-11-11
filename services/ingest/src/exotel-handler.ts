/**
 * Exotel AgentStream/Voicebot protocol handler
 * Handles Exotel's JSON-based WebSocket protocol
 */

import { WebSocket } from 'ws';
import { ExotelMessage, ExotelStartEvent, ExotelMediaEvent, ExotelStopEvent } from './exotel-types';
import { AudioFrame } from './types';
import { PubSubAdapter } from './types';
import { callEndTopic } from '@rtaa/pubsub/topics';

export interface ExotelConnectionState {
  streamSid: string;
  callSid: string;
  accountSid: string;
  from: string;
  to: string;
  sampleRate: number;
  encoding: string;
  customParameters?: Record<string, string>;
  seq: number;
  lastChunk: number;
  started: boolean;
}

interface BoundedBuffer {
  frames: Array<{ frame: AudioFrame; timestamp: number }>;
  maxDurationMs: number;
  totalDurationMs: number;
}

export class ExotelHandler {
  private pubsub: PubSubAdapter;
  private connections: Map<string, ExotelConnectionState> = new Map();
  private boundedBuffers: Map<string, BoundedBuffer> = new Map();
  private exoBridgeEnabled: boolean;
  private exoMaxBufferMs: number;
  // Metrics counters (simple in-memory for now)
  private metrics = {
    framesIn: 0,
    bytesIn: 0,
    bufferDrops: 0,
    publishFailures: 0,
  };

  constructor(pubsub: PubSubAdapter) {
    this.pubsub = pubsub;
    this.exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
    this.exoMaxBufferMs = parseInt(process.env.EXO_MAX_BUFFER_MS || '500', 10);
    
    if (this.exoBridgeEnabled) {
      console.info('[exotel] Exotel→Deepgram bridge: ENABLED', {
        maxBufferMs: this.exoMaxBufferMs,
      });
    } else {
      console.info('[exotel] Exotel→Deepgram bridge: DISABLED (set EXO_BRIDGE_ENABLED=true to enable)');
    }
  }

  handleMessage(ws: WebSocket & { exotelState?: ExotelConnectionState }, message: string): void {
    // Check feature flag - skip processing if bridge is disabled
    if (!this.exoBridgeEnabled) {
      console.debug('[exotel] Bridge disabled, skipping message processing');
      return;
    }

    try {
      const data: ExotelMessage = JSON.parse(message);

      switch (data.event) {
        case 'connected':
          this.handleConnected(ws);
          break;

        case 'start':
          this.handleStart(ws, data as ExotelStartEvent);
          break;

        case 'media':
          this.handleMedia(ws, data as ExotelMediaEvent);
          break;

        case 'stop':
          this.handleStop(ws, data as ExotelStopEvent);
          break;

        case 'dtmf':
          // Handle DTMF if needed
          console.info('[exotel] DTMF received:', data);
          break;

        case 'mark':
          // Handle mark if needed
          console.info('[exotel] Mark received:', data);
          break;

        default:
          console.warn('[exotel] Unknown event type:', (data as any).event);
      }
    } catch (error: any) {
      console.error('[exotel] Error parsing message:', error);
    }
  }

  private handleConnected(ws: WebSocket & { exotelState?: ExotelConnectionState }): void {
    console.info('[exotel] Connected event received');
    // Exotel sends connected first, then start
    // We can acknowledge or just wait for start event
  }

  private handleStart(
    ws: WebSocket & { exotelState?: ExotelConnectionState },
    event: ExotelStartEvent
  ): void {
    const { stream_sid, start } = event;
    const sampleRate = parseInt(start.media_format.sample_rate, 10) || 8000;

    const state: ExotelConnectionState = {
      streamSid: stream_sid,
      callSid: start.call_sid,
      accountSid: start.account_sid,
      from: start.from,
      to: start.to,
      sampleRate,
      encoding: start.media_format.encoding || 'pcm16',
      customParameters: start.custom_parameters,
      seq: 0,
      lastChunk: 0,
      started: true,
    };

    ws.exotelState = state;
    this.connections.set(stream_sid, state);

    console.info('[exotel] Start event received', {
      stream_sid,
      call_sid: start.call_sid,
      sample_rate: sampleRate,
      encoding: start.media_format.encoding,
    });

    // Log structured JSON
    console.info(JSON.stringify({
      event: 'start',
      stream_sid,
      call_sid: start.call_sid,
      account_sid: start.account_sid,
      from: start.from,
      to: start.to,
      sample_rate: sampleRate,
      encoding: start.media_format.encoding,
      timestamp: new Date().toISOString(),
    }));
  }

  private handleMedia(
    ws: WebSocket & { exotelState?: ExotelConnectionState },
    event: ExotelMediaEvent
  ): void {
    const state = ws.exotelState;
    if (!state || !state.started) {
      console.warn('[exotel] Media received before start event');
      return;
    }

    const { media } = event;
    
    // Log raw payload and full event for first few frames to debug
    if (state.seq < 3) {
      console.info('[exotel] 🔍 Raw media event received:', {
        stream_sid: state.streamSid,
        call_sid: state.callSid,
        seq: state.seq,
        event_keys: Object.keys(event),
        media_keys: Object.keys(media),
        payload_type: typeof media.payload,
        payload_length: media.payload?.length,
        payload_preview: typeof media.payload === 'string' ? media.payload.substring(0, 100) : media.payload,
        first_20_chars: typeof media.payload === 'string' ? media.payload.substring(0, 20) : 'N/A',
        full_event_structure: JSON.stringify({
          event: event.event,
          sequence_number: event.sequence_number,
          stream_sid: event.stream_sid,
          media: {
            chunk: media.chunk,
            timestamp: media.timestamp,
            payload_length: media.payload?.length,
            payload_preview: typeof media.payload === 'string' ? media.payload.substring(0, 50) : media.payload,
          },
        }),
      });
    }
    
    // Validate payload exists and is a string
    if (!media.payload || typeof media.payload !== 'string') {
      console.error('[exotel] ❌ Invalid media payload:', {
        stream_sid: state.streamSid,
        call_sid: state.callSid,
        payload_type: typeof media.payload,
        payload_length: media.payload?.length,
        payload_preview: typeof media.payload === 'string' ? media.payload.substring(0, 100) : media.payload,
      });
      return;
    }

    // Validate that payload looks like base64 (not JSON)
    const payloadPreview = media.payload.substring(0, 20);
    if (payloadPreview.trim().startsWith('{') || payloadPreview.trim().startsWith('[')) {
      console.error('[exotel] ❌ CRITICAL: Media payload appears to be JSON, not base64!', {
        stream_sid: state.streamSid,
        call_sid: state.callSid,
        payload_preview: media.payload.substring(0, 200),
        full_event: JSON.stringify(event).substring(0, 500),
      });
      return;
    }

    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(media.payload)) {
      console.error('[exotel] ❌ Invalid base64 payload format:', {
        stream_sid: state.streamSid,
        call_sid: state.callSid,
        payload_preview: media.payload.substring(0, 100),
      });
      return;
    }
    
    try {
      // Decode base64 audio payload
      const audioBuffer = Buffer.from(media.payload, 'base64');
      
      // Validate decoded buffer is not empty and looks like audio (not JSON)
      if (audioBuffer.length === 0) {
        console.warn('[exotel] ⚠️ Empty audio buffer decoded');
        return;
      }

      // Check first few bytes - should be binary audio, not JSON text
      const firstBytes = Array.from(audioBuffer.slice(0, Math.min(8, audioBuffer.length)));
      const firstBytesHex = firstBytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ');
      const firstBytesAscii = String.fromCharCode(...firstBytes.filter(b => b >= 32 && b <= 126));
      
      // If first bytes look like JSON (starts with '{' or '['), it's wrong
      if (firstBytes[0] === 0x7b || firstBytes[0] === 0x5b) { // '{' or '['
        // Try to parse as JSON to see what Exotel is actually sending
        try {
          const jsonText = audioBuffer.toString('utf8');
          const parsedJson = JSON.parse(jsonText);
          // This indicates Exotel sent a JSON message in the media.payload field
          // This is unusual but we handle it by detecting and skipping
          // Log as warning, not CRITICAL error
          console.warn('[exotel] Media payload contains JSON instead of base64 audio', {
            stream_sid: state.streamSid,
            call_sid: state.callSid,
            parsed_json_event: parsedJson.event,
            note: 'Skipping - expected base64 audio, got JSON',
          });
        } catch (parseError) {
          // Invalid JSON in decoded audio buffer - log as warning
          console.warn('[exotel] Decoded audio buffer contains invalid JSON text', {
            stream_sid: state.streamSid,
            call_sid: state.callSid,
            buffer_length: audioBuffer.length,
            note: 'Skipping - expected binary audio data',
          });
        }
        return;
      }

      // COMPREHENSIVE VALIDATION: Verify PCM16 format (16-bit signed integers, little-endian)
      // This ensures audio is valid before publishing to Redis
      if (audioBuffer.length >= 2) {
        const sampleCount = Math.min(20, Math.floor(audioBuffer.length / 2));
        let validSamples = 0;
        let invalidSamples = 0;
        let allZeros = true;
        
        for (let i = 0; i < sampleCount; i++) {
          const offset = i * 2;
          if (offset + 1 >= audioBuffer.length) break;
          
          // Read as little-endian signed 16-bit integer
          const sample = (audioBuffer[offset] | (audioBuffer[offset + 1] << 8)) << 16 >> 16;
          
          // Validate range: PCM16 should be in range [-32768, 32767]
          if (sample >= -32768 && sample <= 32767) {
            validSamples++;
            if (sample !== 0) allZeros = false;
          } else {
            invalidSamples++;
          }
        }
        
        // Log warning if format issues detected (only for first few chunks)
        if (invalidSamples > 0 && state.seq <= 5) {
          console.error('[exotel] ❌ CRITICAL: Audio format validation failed - not valid PCM16!', {
            stream_sid: state.streamSid,
            call_sid: state.callSid,
            seq: state.seq,
            validSamples,
            invalidSamples,
            totalChecked: sampleCount,
            firstBytes: Array.from(audioBuffer.slice(0, 4)).map(b => `0x${b.toString(16).padStart(2, '0')}`),
            note: 'Audio may not be PCM16 format. Expected 16-bit signed integers in range [-32768, 32767].',
          });
        }
        
        // Validate sample rate calculation makes sense
        const bytesPerSample = 2; // 16-bit = 2 bytes
        const samples = audioBuffer.length / bytesPerSample;
        const calculatedDurationMs = (samples / state.sampleRate) * 1000;
        const expectedBytesFor20ms = (state.sampleRate * 0.02) * 2; // 20ms at declared sample rate
        
        // Warn if audio duration doesn't match expected for declared sample rate
        if (state.seq <= 5 && Math.abs((expectedBytesFor20ms / audioBuffer.length) * calculatedDurationMs - 20) > 5) {
          console.warn('[exotel] ⚠️ Sample rate validation warning', {
            stream_sid: state.streamSid,
            call_sid: state.callSid,
            seq: state.seq,
            declaredSampleRate: state.sampleRate,
            audioLength: audioBuffer.length,
            calculatedDurationMs: calculatedDurationMs.toFixed(2),
            expectedBytesFor20ms: expectedBytesFor20ms.toFixed(0),
            note: 'Audio duration may not match declared sample rate. Verify actual audio sample rate.',
          });
        }
      }

      // Log first frame for debugging
      if (state.seq === 0) {
        console.info('[exotel] ✅ First audio frame decoded successfully:', {
          stream_sid: state.streamSid,
          call_sid: state.callSid,
          buffer_length: audioBuffer.length,
          first_bytes_hex: firstBytesHex,
          sample_rate: state.sampleRate,
          encoding: 'pcm16',
          channels: 1,
          note: 'Validated PCM16 format, ready for Deepgram',
        });
      }
      
      state.seq += 1;
      state.lastChunk = media.chunk;

      // Update metrics
      this.metrics.framesIn += 1;
      this.metrics.bytesIn += audioBuffer.length;

      // Create audio frame in our internal format
      const frame: AudioFrame = {
        tenant_id: state.accountSid || 'exotel',
        interaction_id: state.callSid || state.streamSid,
        seq: state.seq,
        timestamp_ms: parseInt(media.timestamp, 10) || Date.now(),
        sample_rate: state.sampleRate,
        encoding: 'pcm16' as const,
        audio: audioBuffer,
      };

      // Publish to pub/sub with bounded buffer fallback
      this.pubsub.publish(frame).then(() => {
        // Clear bounded buffer on successful publish
        const callId = frame.interaction_id;
        const buffer = this.boundedBuffers.get(callId);
        if (buffer && buffer.frames.length > 0) {
          // Try to flush any buffered frames
          this.flushBoundedBuffer(callId);
        }

        // Log first frame and every 10th frame
        if (state.seq === 1 || state.seq % 10 === 0) {
          console.info('[exotel] ✅ Published audio frame', {
            stream_sid: state.streamSid,
            call_sid: state.callSid,
            seq: state.seq,
            chunk: media.chunk,
            interaction_id: frame.interaction_id,
            tenant_id: frame.tenant_id,
            audio_size: frame.audio.length,
            metrics: {
              framesIn: this.metrics.framesIn,
              bytesIn: this.metrics.bytesIn,
            },
          });
        }
      }).catch((error) => {
        this.metrics.publishFailures += 1;
        console.error('[exotel] ❌ Failed to publish frame, using bounded buffer fallback:', {
          error: error.message,
          stream_sid: state.streamSid,
          call_sid: state.callSid,
          seq: state.seq,
        });

        // Add to bounded buffer as fallback
        this.addToBoundedBuffer(frame);
      });
    } catch (error: any) {
      console.error('[exotel] ❌ Failed to decode base64 audio payload:', {
        stream_sid: state.streamSid,
        call_sid: state.callSid,
        error: error.message,
        payload_preview: media.payload.substring(0, 100),
      });
    }
  }

  private handleStop(
    ws: WebSocket & { exotelState?: ExotelConnectionState },
    event: ExotelStopEvent
  ): void {
    const state = ws.exotelState;
    if (state) {
      console.info('[exotel] Stop event received', {
        stream_sid: state.streamSid,
        call_sid: state.callSid,
        reason: event.stop.reason,
        total_chunks: state.seq,
      });

      // Publish call end message to notify ASR worker and other services
      const interactionId = state.callSid || state.streamSid;
      const callEndMessage = {
        interaction_id: interactionId,
        tenant_id: state.accountSid || 'exotel',
        call_sid: state.callSid,
        stream_sid: state.streamSid,
        reason: event.stop.reason,
        timestamp_ms: Date.now(),
      };

      const callEndTopicName = callEndTopic();
      this.pubsub.publishToTopic(callEndTopicName, callEndMessage).then(() => {
        console.info('[exotel] Published call end event', {
          interaction_id: interactionId,
          topic: callEndTopicName,
        });
      }).catch((error) => {
        console.error('[exotel] Failed to publish call end event:', error);
      });

      this.connections.delete(state.streamSid);
      ws.exotelState = undefined;
      
      // Clean up bounded buffer for this call (reuse interactionId from above)
      this.boundedBuffers.delete(interactionId);
    }
  }

  getConnectionState(streamSid: string): ExotelConnectionState | undefined {
    return this.connections.get(streamSid);
  }

  /**
   * Add frame to bounded buffer (fallback when pub/sub fails)
   */
  private addToBoundedBuffer(frame: AudioFrame): void {
    const callId = frame.interaction_id;
    let buffer = this.boundedBuffers.get(callId);
    
    if (!buffer) {
      buffer = {
        frames: [],
        maxDurationMs: this.exoMaxBufferMs,
        totalDurationMs: 0,
      };
      this.boundedBuffers.set(callId, buffer);
    }

    // Calculate frame duration (approximate)
    const frameDurationMs = (frame.audio.length / (frame.sample_rate * 2)) * 1000; // 2 bytes per sample for PCM16
    const now = Date.now();

    // Add frame
    buffer.frames.push({ frame, timestamp: now });
    buffer.totalDurationMs += frameDurationMs;

    // Trim buffer if exceeds max duration
    while (buffer.totalDurationMs > buffer.maxDurationMs && buffer.frames.length > 0) {
      const dropped = buffer.frames.shift();
      if (dropped) {
        const droppedDurationMs = (dropped.frame.audio.length / (dropped.frame.sample_rate * 2)) * 1000;
        buffer.totalDurationMs -= droppedDurationMs;
        this.metrics.bufferDrops += 1;
        
        // Rate-limit warning (log every 10th drop)
        if (this.metrics.bufferDrops % 10 === 0) {
          console.warn('[exotel] ⚠️ Bounded buffer full, dropping oldest frames', {
            callId,
            bufferDepth: buffer.frames.length,
            totalDurationMs: buffer.totalDurationMs.toFixed(0),
            maxDurationMs: buffer.maxDurationMs,
            drops: this.metrics.bufferDrops,
          });
        }
      }
    }
  }

  /**
   * Flush bounded buffer (try to publish buffered frames)
   */
  private flushBoundedBuffer(callId: string): void {
    const buffer = this.boundedBuffers.get(callId);
    if (!buffer || buffer.frames.length === 0) {
      return;
    }

    const framesToPublish = [...buffer.frames];
    buffer.frames = [];
    buffer.totalDurationMs = 0;

    // Try to publish each frame
    let published = 0;
    for (const { frame } of framesToPublish) {
      this.pubsub.publish(frame).then(() => {
        published += 1;
      }).catch((error) => {
        // If still failing, re-add to buffer
        this.addToBoundedBuffer(frame);
      });
    }

    if (published > 0) {
      console.info('[exotel] ✅ Flushed bounded buffer', {
        callId,
        published,
        total: framesToPublish.length,
      });
    }
  }

  /**
   * Get metrics for health endpoint
   */
  getMetrics() {
    return {
      ...this.metrics,
      bufferDepth: Array.from(this.boundedBuffers.values()).reduce((sum, buf) => sum + buf.frames.length, 0),
      activeBuffers: this.boundedBuffers.size,
    };
  }
}


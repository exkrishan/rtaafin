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

export class ExotelHandler {
  private pubsub: PubSubAdapter;
  private connections: Map<string, ExotelConnectionState> = new Map();

  constructor(pubsub: PubSubAdapter) {
    this.pubsub = pubsub;
  }

  handleMessage(ws: WebSocket & { exotelState?: ExotelConnectionState }, message: string): void {
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
    
    // Decode base64 audio payload
    const audioBuffer = Buffer.from(media.payload, 'base64');
    
    state.seq += 1;
    state.lastChunk = media.chunk;

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

    // Publish to pub/sub
    this.pubsub.publish(frame).then(() => {
      // Log every 10th frame
      if (state.seq % 10 === 0) {
        console.info('[exotel] Published audio frame', {
          stream_sid: state.streamSid,
          call_sid: state.callSid,
          seq: state.seq,
          chunk: media.chunk,
        });
      }
    }).catch((error) => {
      console.error('[exotel] Failed to publish frame:', error);
    });
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
    }
  }

  getConnectionState(streamSid: string): ExotelConnectionState | undefined {
    return this.connections.get(streamSid);
  }
}


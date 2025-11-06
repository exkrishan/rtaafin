/**
 * Exotel AgentStream/Voicebot protocol types
 * Based on Exotel documentation
 */

export interface ExotelConnectedEvent {
  event: 'connected';
}

export interface ExotelStartEvent {
  event: 'start';
  sequence_number: number;
  stream_sid: string;
  start: {
    stream_sid: string;
    call_sid: string;
    account_sid: string;
    from: string;
    to: string;
    custom_parameters?: Record<string, string>;
    media_format: {
      encoding: string;
      sample_rate: string;
      bit_rate?: string;
    };
  };
}

export interface ExotelMediaEvent {
  event: 'media';
  sequence_number: number;
  stream_sid: string;
  media: {
    chunk: number;
    timestamp: string;
    payload: string; // Base64 encoded PCM16 audio
  };
}

export interface ExotelStopEvent {
  event: 'stop';
  sequence_number: number;
  stream_sid: string;
  stop: {
    call_sid: string;
    account_sid: string;
    reason: string; // "stopped" or "callended"
  };
}

export interface ExotelDTMFEvent {
  event: 'dtmf';
  sequence_number: number;
  stream_sid: string;
  dtmf: {
    duration: string;
    digit: string;
  };
}

export interface ExotelMarkEvent {
  event: 'mark';
  sequence_number: number;
  stream_sid: string;
  mark: {
    name: string;
  };
}

export type ExotelMessage =
  | ExotelConnectedEvent
  | ExotelStartEvent
  | ExotelMediaEvent
  | ExotelStopEvent
  | ExotelDTMFEvent
  | ExotelMarkEvent;


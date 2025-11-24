"""Exotel WebSocket protocol handler for AgentStream/Voicebot applet"""

import json
import base64
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class ExotelEventType(str, Enum):
    """Exotel event types"""
    CONNECTED = "connected"
    START = "start"
    MEDIA = "media"
    STOP = "stop"
    DTMF = "dtmf"
    MARK = "mark"


@dataclass
class ExotelConnectionState:
    """State for an Exotel WebSocket connection"""
    stream_sid: str
    call_sid: str
    account_sid: str
    from_number: str
    to_number: str
    sample_rate: int
    encoding: str
    custom_parameters: Optional[Dict[str, str]] = None
    seq: int = 0
    started: bool = False


@dataclass
class ExotelStartEvent:
    """Exotel start event structure"""
    event: str
    sequence_number: int
    stream_sid: str
    start: Dict[str, Any]


@dataclass
class ExotelMediaEvent:
    """Exotel media event structure"""
    event: str
    sequence_number: int
    stream_sid: str
    media: Dict[str, Any]


@dataclass
class ExotelStopEvent:
    """Exotel stop event structure"""
    event: str
    sequence_number: int
    stream_sid: str
    stop: Dict[str, Any]


class ExotelHandler:
    """Handler for Exotel WebSocket protocol messages"""

    def __init__(self):
        self.connections: Dict[str, ExotelConnectionState] = {}

    def handle_message(self, message: str) -> Optional[Dict[str, Any]]:
        """
        Parse and handle Exotel WebSocket message
        
        Args:
            message: JSON string message from Exotel
            
        Returns:
            Parsed event data or None if invalid
        """
        try:
            data = json.loads(message)
            event_type = data.get("event")

            if event_type == ExotelEventType.CONNECTED:
                return self._handle_connected(data)
            elif event_type == ExotelEventType.START:
                return self._handle_start(data)
            elif event_type == ExotelEventType.MEDIA:
                return self._handle_media(data)
            elif event_type == ExotelEventType.STOP:
                return self._handle_stop(data)
            elif event_type == ExotelEventType.DTMF:
                logger.info(f"[exotel] DTMF received: {data}")
                return None
            elif event_type == ExotelEventType.MARK:
                logger.info(f"[exotel] Mark received: {data}")
                return None
            else:
                logger.warning(f"[exotel] Unknown event type: {event_type}")
                return None

        except json.JSONDecodeError as e:
            logger.error(f"[exotel] Error parsing JSON message: {e}")
            return None
        except Exception as e:
            logger.error(f"[exotel] Error handling message: {e}")
            return None

    def _handle_connected(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle connected event"""
        logger.info("[exotel] Connected event received")
        return {"type": "connected", "data": data}

    def _handle_start(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle start event"""
        try:
            stream_sid = data.get("stream_sid", "")
            start_data = data.get("start", {})

            # Parse media format
            media_format = start_data.get("media_format", {})
            sample_rate_str = media_format.get("sample_rate", "8000")
            
            # Exotel can send 8kHz, 16kHz, or 24kHz
            # Convert 24kHz to 16kHz for better STT quality
            sample_rate = int(sample_rate_str) if sample_rate_str.isdigit() else 8000
            allowed_rates = [8000, 16000, 24000]
            
            if sample_rate not in allowed_rates:
                logger.warning(
                    f"[exotel] Invalid sample rate {sample_rate} from Exotel, defaulting to 8000 Hz"
                )
                sample_rate = 8000
            elif sample_rate == 24000:
                logger.info(
                    "[exotel] Exotel sent 24kHz audio, converting to 16kHz for optimal transcription"
                )
                sample_rate = 16000

            # Create connection state
            state = ExotelConnectionState(
                stream_sid=stream_sid,
                call_sid=start_data.get("call_sid", ""),
                account_sid=start_data.get("account_sid", ""),
                from_number=start_data.get("from", ""),
                to_number=start_data.get("to", ""),
                sample_rate=sample_rate,
                encoding=media_format.get("encoding", "pcm16"),
                custom_parameters=start_data.get("custom_parameters"),
                started=True,
            )

            self.connections[stream_sid] = state

            logger.info(
                f"[exotel] Start event received: stream_sid={stream_sid}, "
                f"call_sid={state.call_sid}, sample_rate={sample_rate}"
            )

            return {
                "type": "start",
                "state": state,
                "data": data,
            }

        except Exception as e:
            logger.error(f"[exotel] Error handling start event: {e}")
            return None

    def _handle_media(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle media event with audio data"""
        try:
            stream_sid = data.get("stream_sid", "")
            state = self.connections.get(stream_sid)

            if not state or not state.started:
                logger.warning("[exotel] Media received before start event")
                return None

            media_data = data.get("media", {})
            payload = media_data.get("payload")

            if not payload or not isinstance(payload, str):
                logger.error("[exotel] Invalid media payload: missing or not a string")
                return None

            # Validate base64 format
            base64_regex = r"^[A-Za-z0-9+/]*={0,2}$"
            import re
            if not re.match(base64_regex, payload):
                logger.error("[exotel] Invalid base64 payload format")
                return None

            # Decode base64 to PCM16 bytes
            try:
                audio_bytes = base64.b64decode(payload)
            except Exception as e:
                logger.error(f"[exotel] Error decoding base64 audio: {e}")
                return None

            state.seq += 1

            # Log first few frames for debugging
            if state.seq <= 3:
                logger.info(
                    f"[exotel] Media frame received: stream_sid={stream_sid}, "
                    f"seq={state.seq}, audio_size={len(audio_bytes)}"
                )

            return {
                "type": "media",
                "stream_sid": stream_sid,
                "state": state,
                "audio_bytes": audio_bytes,
                "chunk": media_data.get("chunk"),
                "timestamp": media_data.get("timestamp"),
            }

        except Exception as e:
            logger.error(f"[exotel] Error handling media event: {e}")
            return None

    def _handle_stop(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle stop event"""
        try:
            stream_sid = data.get("stream_sid", "")
            stop_data = data.get("stop", {})

            state = self.connections.get(stream_sid)
            if state:
                state.started = False
                logger.info(
                    f"[exotel] Stop event received: stream_sid={stream_sid}, "
                    f"reason={stop_data.get('reason', 'unknown')}"
                )
            else:
                logger.warning(f"[exotel] Stop event for unknown stream: {stream_sid}")

            return {
                "type": "stop",
                "stream_sid": stream_sid,
                "state": state,
                "reason": stop_data.get("reason", "unknown"),
                "data": data,
            }

        except Exception as e:
            logger.error(f"[exotel] Error handling stop event: {e}")
            return None

    def get_connection_state(self, stream_sid: str) -> Optional[ExotelConnectionState]:
        """Get connection state for a stream"""
        return self.connections.get(stream_sid)

    def remove_connection(self, stream_sid: str) -> None:
        """Remove connection state"""
        if stream_sid in self.connections:
            del self.connections[stream_sid]
            logger.info(f"[exotel] Removed connection state for stream: {stream_sid}")


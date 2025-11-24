"""Tests for Exotel handler"""

import pytest
import json
from src.exotel_handler import ExotelHandler, ExotelEventType


class TestExotelHandler:
    """Test cases for ExotelHandler"""

    def setup_method(self):
        """Set up test fixtures"""
        self.handler = ExotelHandler()

    def test_handle_connected(self):
        """Test handling connected event"""
        message = json.dumps({"event": "connected"})
        result = self.handler.handle_message(message)

        assert result is not None
        assert result["type"] == "connected"

    def test_handle_start(self):
        """Test handling start event"""
        message = json.dumps({
            "event": "start",
            "sequence_number": 1,
            "stream_sid": "test-stream-123",
            "start": {
                "stream_sid": "test-stream-123",
                "call_sid": "test-call-456",
                "account_sid": "test-account-789",
                "from": "+1234567890",
                "to": "+0987654321",
                "media_format": {
                    "encoding": "pcm16",
                    "sample_rate": "8000",
                },
            },
        })

        result = self.handler.handle_message(message)

        assert result is not None
        assert result["type"] == "start"
        assert result["state"] is not None
        assert result["state"].stream_sid == "test-stream-123"
        assert result["state"].call_sid == "test-call-456"
        assert result["state"].sample_rate == 8000

    def test_handle_start_24khz_conversion(self):
        """Test that 24kHz is converted to 16kHz"""
        message = json.dumps({
            "event": "start",
            "sequence_number": 1,
            "stream_sid": "test-stream-123",
            "start": {
                "stream_sid": "test-stream-123",
                "call_sid": "test-call-456",
                "account_sid": "test-account-789",
                "from": "+1234567890",
                "to": "+0987654321",
                "media_format": {
                    "encoding": "pcm16",
                    "sample_rate": "24000",
                },
            },
        })

        result = self.handler.handle_message(message)

        assert result is not None
        assert result["state"].sample_rate == 16000  # Converted from 24kHz

    def test_handle_media(self):
        """Test handling media event"""
        # First, handle start event to create connection state
        start_message = json.dumps({
            "event": "start",
            "sequence_number": 1,
            "stream_sid": "test-stream-123",
            "start": {
                "stream_sid": "test-stream-123",
                "call_sid": "test-call-456",
                "account_sid": "test-account-789",
                "from": "+1234567890",
                "to": "+0987654321",
                "media_format": {
                    "encoding": "pcm16",
                    "sample_rate": "8000",
                },
            },
        })
        self.handler.handle_message(start_message)

        # Now handle media event
        import base64
        audio_data = b"test audio data"
        audio_b64 = base64.b64encode(audio_data).decode("utf-8")

        media_message = json.dumps({
            "event": "media",
            "sequence_number": 2,
            "stream_sid": "test-stream-123",
            "media": {
                "chunk": 1,
                "timestamp": "100",
                "payload": audio_b64,
            },
        })

        result = self.handler.handle_message(media_message)

        assert result is not None
        assert result["type"] == "media"
        assert result["audio_bytes"] == audio_data
        assert result["stream_sid"] == "test-stream-123"

    def test_handle_stop(self):
        """Test handling stop event"""
        # First, handle start event
        start_message = json.dumps({
            "event": "start",
            "sequence_number": 1,
            "stream_sid": "test-stream-123",
            "start": {
                "stream_sid": "test-stream-123",
                "call_sid": "test-call-456",
                "account_sid": "test-account-789",
                "from": "+1234567890",
                "to": "+0987654321",
                "media_format": {
                    "encoding": "pcm16",
                    "sample_rate": "8000",
                },
            },
        })
        self.handler.handle_message(start_message)

        # Now handle stop event
        stop_message = json.dumps({
            "event": "stop",
            "sequence_number": 10,
            "stream_sid": "test-stream-123",
            "stop": {
                "call_sid": "test-call-456",
                "account_sid": "test-account-789",
                "reason": "callended",
            },
        })

        result = self.handler.handle_message(stop_message)

        assert result is not None
        assert result["type"] == "stop"
        assert result["reason"] == "callended"

    def test_invalid_json(self):
        """Test handling invalid JSON"""
        result = self.handler.handle_message("invalid json")
        assert result is None

    def test_unknown_event(self):
        """Test handling unknown event type"""
        message = json.dumps({"event": "unknown_event"})
        result = self.handler.handle_message(message)
        assert result is None


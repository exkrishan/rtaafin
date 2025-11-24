"""Tests for intent detector"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from src.intent_detector import IntentDetector, IntentResult


class TestIntentDetector:
    """Test cases for IntentDetector"""

    @pytest.fixture
    def mock_settings(self):
        """Mock settings"""
        with patch("src.intent_detector.settings") as mock:
            mock.llm_provider = "openai"
            mock.get_llm_api_key.return_value = "test-api-key"
            yield mock

    @pytest.mark.asyncio
    async def test_detect_intent_short_text(self, mock_settings):
        """Test that very short text returns unknown intent"""
        with patch("src.intent_detector.OpenAI") as mock_openai:
            detector = IntentDetector()
            result = await detector.detect_intent("Hi")

            assert result.intent == "unknown"
            assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_detect_intent_openai(self, mock_settings):
        """Test intent detection with OpenAI"""
        mock_client = Mock()
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = '{"intent": "credit_card_block", "confidence": 0.95}'
        mock_client.chat.completions.create = Mock(return_value=mock_response)

        with patch("src.intent_detector.OpenAI", return_value=mock_client):
            detector = IntentDetector()
            result = await detector.detect_intent("I need to block my credit card")

            assert result.intent == "credit_card_block"
            assert result.confidence == 0.95

    @pytest.mark.asyncio
    async def test_detect_intent_gemini(self):
        """Test intent detection with Gemini"""
        with patch("src.intent_detector.settings") as mock_settings:
            mock_settings.llm_provider = "gemini"
            mock_settings.get_llm_api_key.return_value = "test-api-key"

            mock_model = Mock()
            mock_response = Mock()
            mock_response.text = '{"intent": "debit_card_block", "confidence": 0.9}'
            mock_model.generate_content = Mock(return_value=mock_response)

            with patch("src.intent_detector.genai") as mock_genai:
                mock_genai.configure = Mock()
                mock_genai.GenerativeModel = Mock(return_value=mock_model)

                detector = IntentDetector()
                result = await detector.detect_intent("My debit card is not working")

                assert result.intent == "debit_card_block"
                assert result.confidence == 0.9

    def test_normalize_intent(self, mock_settings):
        """Test intent normalization"""
        with patch("src.intent_detector.OpenAI"):
            detector = IntentDetector()
            
            assert detector._normalize_intent("credit_card_block") == "credit_card_block"
            assert detector._normalize_intent("Credit Card Block") == "credit_card_block"
            assert detector._normalize_intent("creditcard") == "credit_card"


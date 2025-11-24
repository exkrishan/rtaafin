"""Tests for KB service"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from src.kb_service import KBService, KBArticle


class TestKBService:
    """Test cases for KBService"""

    @pytest.fixture
    def mock_settings(self):
        """Mock settings"""
        with patch("src.kb_service.settings") as mock:
            mock.kb_adapter_type = "db"
            mock.frontend_api_url = "http://localhost:3000"
            mock.supabase_url = "https://test.supabase.co"
            mock.supabase_service_role_key = "test-key"
            yield mock

    def test_expand_intent_to_search_terms(self, mock_settings):
        """Test expanding intent to search terms"""
        with patch("src.kb_service.create_client"):
            service = KBService()
            terms = service._expand_intent_to_search_terms(
                "credit_card_block", "I need to block my credit card"
            )

            assert "credit_card_block" in terms
            assert "credit" in terms
            assert "card" in terms
            assert "block" in terms

    @pytest.mark.asyncio
    async def test_search_by_intent_unknown(self, mock_settings):
        """Test that unknown intent returns empty results"""
        with patch("src.kb_service.create_client"):
            service = KBService()
            results = await service.search_by_intent("unknown", "test text")

            assert len(results) == 0

    @pytest.mark.asyncio
    async def test_search_via_api(self, mock_settings):
        """Test searching via API"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "ok": True,
            "results": [
                {
                    "id": "article-1",
                    "title": "Test Article",
                    "snippet": "Test snippet",
                    "url": "https://example.com/article-1",
                    "tags": ["test"],
                    "score": 0.9,
                }
            ],
        }

        with patch("src.kb_service.httpx") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_httpx.AsyncClient.return_value.__aenter__.return_value = mock_client

            service = KBService()
            service.adapter_type = "api"  # Force API adapter
            results = await service._search_via_api("test query", "default", 10)

            assert len(results) == 1
            assert results[0].id == "article-1"
            assert results[0].title == "Test Article"

    def test_kb_article_to_dict(self):
        """Test KBArticle to_dict conversion"""
        article = KBArticle(
            id="test-id",
            title="Test Title",
            snippet="Test snippet",
            url="https://example.com",
            tags=["tag1", "tag2"],
            confidence=0.9,
        )

        result = article.to_dict()

        assert result["id"] == "test-id"
        assert result["title"] == "Test Title"
        assert result["code"] == "test-id"  # id used as code
        assert result["score"] == 0.9


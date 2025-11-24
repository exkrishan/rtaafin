"""Knowledge Base article service"""

import logging
from typing import List, Dict, Any, Optional
import httpx
from supabase import create_client, Client

from .config import settings

logger = logging.getLogger(__name__)


class KBArticle:
    """Knowledge Base article representation"""

    def __init__(
        self,
        id: str,
        title: str,
        snippet: str,
        url: Optional[str] = None,
        tags: Optional[List[str]] = None,
        source: str = "db",
        confidence: Optional[float] = None,
    ):
        self.id = id
        self.title = title
        self.snippet = snippet
        self.url = url
        self.tags = tags or []
        self.source = source
        self.confidence = confidence

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "id": self.id,
            "code": self.id,  # Use id as code for compatibility
            "title": self.title,
            "snippet": self.snippet,
            "url": self.url,
            "tags": self.tags,
            "score": self.confidence or 0.0,
        }


class KBService:
    """Service for searching and retrieving KB articles"""

    def __init__(self):
        self.adapter_type = settings.kb_adapter_type.lower()
        self.frontend_api_url = settings.frontend_api_url.rstrip("/")
        self.supabase_client: Optional[Client] = None

        # Initialize Supabase client if using DB adapter
        if self.adapter_type == "db":
            if settings.supabase_url and settings.supabase_service_role_key:
                self.supabase_client = create_client(
                    settings.supabase_url, settings.supabase_service_role_key
                )
                logger.info("[kb] Initialized Supabase client for DB adapter")
            else:
                logger.warning(
                    "[kb] DB adapter selected but Supabase credentials not provided. "
                    "Will use API fallback."
                )

        logger.info(f"[kb] Initialized KB service with adapter: {self.adapter_type}")

    def _expand_intent_to_search_terms(
        self, intent: str, original_text: str
    ) -> List[str]:
        """Expand intent label into multiple search terms for better KB matching"""
        terms = set()

        # Add the full intent
        terms.add(intent)

        # Split intent by underscores and add individual words
        words = intent.split("_")
        for word in words:
            if len(word) > 2:
                terms.add(word)

        # Extract key phrases from original text
        text_lower = original_text.lower()

        # Credit card specific terms
        if "credit" in text_lower and "card" in text_lower:
            terms.update(["credit", "card", "credit card"])

        # Debit card specific terms
        if "debit" in text_lower and "card" in text_lower:
            terms.update(["debit", "card", "debit card"])

        # Account terms
        if "account" in text_lower:
            terms.add("account")
            if "balance" in text_lower:
                terms.update(["balance", "account balance"])
            if "savings" in text_lower:
                terms.update(["savings", "savings account"])
            if "salary" in text_lower:
                terms.update(["salary", "salary account"])

        # Fraud terms
        if "fraud" in text_lower:
            terms.add("fraud")
            terms.add("fraudulent")

        # Block terms
        if "block" in text_lower:
            terms.add("block")
            terms.add("blocked")

        return list(terms)

    async def search_by_intent(
        self, intent: str, original_text: str, tenant_id: str = "default", max_results: int = 10
    ) -> List[KBArticle]:
        """
        Search KB articles based on detected intent

        Args:
            intent: Detected intent label
            original_text: Original transcript text for context
            tenant_id: Tenant identifier
            max_results: Maximum number of results to return

        Returns:
            List of relevant KB articles
        """
        if intent == "unknown":
            logger.debug("[kb] Intent is unknown, skipping KB search")
            return []

        logger.info(f"[kb] Searching KB articles for intent: {intent}")

        # Expand intent into search terms
        search_terms = self._expand_intent_to_search_terms(intent, original_text)
        logger.info(f"[kb] Expanded search terms: {search_terms}")

        # Try multiple search strategies
        all_articles: List[KBArticle] = []
        seen_ids = set()

        # Strategy 1: Search with full intent
        full_intent_results = await self._search(intent, tenant_id, max_results, [original_text])
        for article in full_intent_results:
            if article.id not in seen_ids:
                all_articles.append(article)
                seen_ids.add(article.id)

        # Strategy 2: Search with expanded terms
        for term in search_terms:
            if len(term) < 3:
                continue

            term_results = await self._search(
                term, tenant_id, max_results // len(search_terms) or 3, [original_text]
            )

            for article in term_results:
                if article.id not in seen_ids and len(all_articles) < max_results:
                    all_articles.append(article)
                    seen_ids.add(article.id)

        # Limit to max_results
        results = all_articles[:max_results]

        logger.info(
            f"[kb] Found {len(results)} KB articles for intent: {intent}"
        )

        return results

    async def _search(
        self,
        query: str,
        tenant_id: str,
        max_results: int,
        context: Optional[List[str]] = None,
    ) -> List[KBArticle]:
        """Internal search method"""
        if self.adapter_type == "db":
            return await self._search_db(query, tenant_id, max_results, context)
        elif self.adapter_type == "knowmax":
            return await self._search_knowmax(query, tenant_id, max_results, context)
        else:
            # Fallback to API call
            return await self._search_via_api(query, tenant_id, max_results)

    async def _search_db(
        self,
        query: str,
        tenant_id: str,
        max_results: int,
        context: Optional[List[str]] = None,
    ) -> List[KBArticle]:
        """Search using Supabase DB adapter"""
        if not self.supabase_client:
            # Fallback to API if Supabase not configured
            return await self._search_via_api(query, tenant_id, max_results)

        try:
            # Normalize query: replace underscores with spaces
            normalized_query = query.replace("_", " ").strip()

            # Split query into words
            words = normalized_query.split()
            words = [w for w in words if len(w) > 2]

            # Build OR conditions for each word
            or_conditions = []

            # Full phrase match
            or_conditions.append(f"title.ilike.%{normalized_query}%")
            or_conditions.append(f"snippet.ilike.%{normalized_query}%")

            # Individual word matches
            for word in words:
                or_conditions.append(f"title.ilike.%{word}%")
                or_conditions.append(f"snippet.ilike.%{word}%")

            # Tags exact match
            or_conditions.append(f"tags.cs.{{{normalized_query}}}")
            for word in words:
                or_conditions.append(f"tags.cs.{{{word}}}")

            # Query Supabase
            response = (
                self.supabase_client.table("kb_articles")
                .select("id, title, snippet, url, tags")
                .or(",".join(or_conditions))
                .limit(max_results)
                .execute()
            )

            articles = []
            for item in response.data:
                # Calculate relevance score
                title_lower = item.get("title", "").lower()
                snippet_lower = item.get("snippet", "").lower()
                query_lower = normalized_query.lower()

                score = 0.0
                if query_lower in title_lower:
                    score = 0.9
                elif query_lower in snippet_lower:
                    score = 0.7
                elif any(word in title_lower for word in words):
                    score = 0.5

                article = KBArticle(
                    id=item.get("id", ""),
                    title=item.get("title", ""),
                    snippet=item.get("snippet", ""),
                    url=item.get("url"),
                    tags=item.get("tags", []),
                    source="db",
                    confidence=score,
                )
                articles.append(article)

            # Sort by confidence
            articles.sort(key=lambda x: x.confidence or 0.0, reverse=True)

            return articles

        except Exception as e:
            logger.error(f"[kb] Error searching DB: {e}")
            # Fallback to API
            return await self._search_via_api(query, tenant_id, max_results)

    async def _search_knowmax(
        self,
        query: str,
        tenant_id: str,
        max_results: int,
        context: Optional[List[str]] = None,
    ) -> List[KBArticle]:
        """Search using Knowmax adapter"""
        # TODO: Implement Knowmax API integration
        logger.warning("[kb] Knowmax adapter not yet implemented, using API fallback")
        return await self._search_via_api(query, tenant_id, max_results)

    async def _search_via_api(
        self, query: str, tenant_id: str, max_results: int
    ) -> List[KBArticle]:
        """Search via Next.js API endpoint"""
        try:
            url = f"{self.frontend_api_url}/api/kb/search"
            params = {"q": query, "tenantId": tenant_id, "limit": max_results}

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)

                if response.status_code != 200:
                    logger.error(
                        f"[kb] API search failed: {response.status_code}, {response.text}"
                    )
                    return []

                data = response.json()
                if not data.get("ok"):
                    logger.error(f"[kb] API search returned error: {data.get('error')}")
                    return []

                results = data.get("results", [])
                articles = []

                for item in results:
                    article = KBArticle(
                        id=item.get("id", ""),
                        title=item.get("title", ""),
                        snippet=item.get("snippet", ""),
                        url=item.get("url"),
                        tags=item.get("tags", []),
                        source="api",
                        confidence=item.get("score", 0.0),
                    )
                    articles.append(article)

                return articles

        except Exception as e:
            logger.error(f"[kb] Error searching via API: {e}")
            return []


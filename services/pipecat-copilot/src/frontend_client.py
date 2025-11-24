"""Client for communicating with Next.js frontend API"""

import logging
from typing import List, Dict, Any, Optional
import httpx

from .config import settings
from .kb_service import KBArticle
from .disposition_generator import DispositionSummary
from .utils import retry_with_backoff, generate_correlation_id

logger = logging.getLogger(__name__)


class FrontendClient:
    """Client for sending data to Next.js frontend API"""

    def __init__(self):
        self.base_url = settings.frontend_api_url.rstrip("/")
        self.timeout = 10.0

        logger.info(f"[frontend] Initialized frontend client: {self.base_url}")

    async def send_transcript(
        self,
        call_id: str,
        text: str,
        seq: int,
        is_final: bool,
        tenant_id: str = "default",
        correlation_id: Optional[str] = None,
    ) -> bool:
        """
        Send transcript to frontend via ingest-transcript API

        Args:
            call_id: Call identifier
            text: Transcript text
            seq: Sequence number
            is_final: Whether this is a final transcript
            tenant_id: Tenant identifier
            correlation_id: Optional correlation ID for tracing

        Returns:
            True if successful, False otherwise
        """
        corr_id = correlation_id or generate_correlation_id()
        
        async def _send():
            url = f"{self.base_url}/api/calls/ingest-transcript"

            payload = {
                "callId": call_id,
                "text": text,
                "seq": seq,
                "type": "final" if is_final else "partial",
                "tenantId": tenant_id,
            }

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)

                if response.status_code == 200:
                    logger.debug(
                        f"[frontend] {corr_id} Transcript sent: call={call_id}, seq={seq}, "
                        f"is_final={is_final}"
                    )
                    return True
                else:
                    error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                    logger.error(
                        f"[frontend] {corr_id} Failed to send transcript: {error_msg}"
                    )
                    raise httpx.HTTPStatusError(
                        f"Failed to send transcript: {error_msg}",
                        request=response.request,
                        response=response,
                    )

        try:
            return await retry_with_backoff(
                _send,
                max_retries=settings.max_retries,
                initial_delay=settings.retry_delay,
                correlation_id=corr_id,
                retryable_exceptions=(httpx.RequestError, httpx.HTTPStatusError),
            )
        except Exception as e:
            logger.error(
                f"[frontend] {corr_id} Error sending transcript after retries: {e}"
            )
            return False

    async def send_intent(
        self,
        call_id: str,
        intent: str,
        confidence: float,
        tenant_id: str = "default",
    ) -> bool:
        """
        Send intent detection result to frontend

        Args:
            call_id: Call identifier
            intent: Detected intent label
            confidence: Confidence score
            tenant_id: Tenant identifier

        Returns:
            True if successful, False otherwise
        """
        # Intent is typically sent as part of transcript ingestion
        # This is a separate endpoint if needed
        try:
            url = f"{self.base_url}/api/calls/intent"

            payload = {
                "callId": call_id,
                "intent": intent,
                "confidence": confidence,
                "tenantId": tenant_id,
            }

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)

                if response.status_code == 200:
                    logger.debug(
                        f"[frontend] Intent sent: call={call_id}, intent={intent}"
                    )
                    return True
                else:
                    logger.debug(
                        f"[frontend] Intent endpoint not available: {response.status_code}"
                    )
                    # Not critical - intent is also sent via transcript ingestion
                    return False

        except Exception as e:
            logger.debug(f"[frontend] Error sending intent (non-critical): {e}")
            return False

    async def send_kb_articles(
        self,
        call_id: str,
        articles: List[KBArticle],
        tenant_id: str = "default",
    ) -> bool:
        """
        Send KB articles to frontend

        Args:
            call_id: Call identifier
            articles: List of KB articles
            tenant_id: Tenant identifier

        Returns:
            True if successful, False otherwise
        """
        # KB articles are typically sent via SSE events
        # This endpoint may not exist, so we'll log but not fail
        try:
            # KB articles are usually sent as part of the intent_update event
            # via the ingest-transcript endpoint, so this is optional
            logger.debug(
                f"[frontend] KB articles available: call={call_id}, "
                f"count={len(articles)}"
            )
            return True

        except Exception as e:
            logger.debug(f"[frontend] Error sending KB articles (non-critical): {e}")
            return False

    async def send_disposition(
        self,
        call_id: str,
        disposition: DispositionSummary,
        tenant_id: str = "default",
        correlation_id: Optional[str] = None,
    ) -> bool:
        """
        Send disposition summary to frontend

        Args:
            call_id: Call identifier
            disposition: Disposition summary
            tenant_id: Tenant identifier
            correlation_id: Optional correlation ID for tracing

        Returns:
            True if successful, False otherwise
        """
        corr_id = correlation_id or generate_correlation_id()
        
        async def _send():
            url = f"{self.base_url}/api/calls/auto_notes"

            # Convert dispositions to expected format
            dispositions = []
            for disp in disposition.dispositions:
                dispositions.append({
                    "code": disp.label,
                    "title": disp.label.replace("_", " ").title(),
                    "score": disp.score,
                    "subDisposition": disp.sub_disposition,
                })

            payload = {
                "callId": call_id,
                "tenantId": tenant_id,
                "notes": disposition.get_auto_notes(),
                "dispositions": dispositions,
                "confidence": disposition.confidence,
                "author": "pipecat-copilot",
            }

            async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
                response = await client.post(url, json=payload)

                if response.status_code == 200:
                    logger.info(
                        f"[frontend] {corr_id} Disposition sent: call={call_id}, "
                        f"dispositions={len(dispositions)}"
                    )
                    return True
                else:
                    error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                    logger.error(
                        f"[frontend] {corr_id} Failed to send disposition: {error_msg}"
                    )
                    raise httpx.HTTPStatusError(
                        f"Failed to send disposition: {error_msg}",
                        request=response.request,
                        response=response,
                    )

        try:
            return await retry_with_backoff(
                _send,
                max_retries=settings.max_retries,
                initial_delay=settings.retry_delay,
                correlation_id=corr_id,
                retryable_exceptions=(httpx.RequestError, httpx.HTTPStatusError),
            )
        except Exception as e:
            logger.error(
                f"[frontend] {corr_id} Error sending disposition after retries: {e}"
            )
            return False


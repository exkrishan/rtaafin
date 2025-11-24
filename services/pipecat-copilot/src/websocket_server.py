"""WebSocket server for Exotel connections"""

import logging
import asyncio
from typing import Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect
import base64

from .exotel_handler import ExotelHandler, ExotelConnectionState
from .pipeline import PipecatPipeline, TranscriptCallback
from .intent_detector import IntentDetector
from .kb_service import KBService
from .disposition_generator import DispositionGenerator
from .frontend_client import FrontendClient

logger = logging.getLogger(__name__)


class CopilotTranscriptCallback(TranscriptCallback):
    """Callback that processes transcripts and triggers intent/KB/disposition"""

    def __init__(
        self,
        stream_sid: str,
        call_sid: str,
        tenant_id: str,
        intent_detector: IntentDetector,
        kb_service: KBService,
        frontend_client: FrontendClient,
    ):
        self.stream_sid = stream_sid
        self.call_sid = call_sid
        self.tenant_id = tenant_id
        self.intent_detector = intent_detector
        self.kb_service = kb_service
        self.frontend_client = frontend_client
        self.transcript_chunks: list = []
        self.seq = 0

    async def on_partial_transcript(
        self, text: str, stream_sid: str, call_sid: str, metadata: Dict
    ):
        """Handle partial transcript"""
        self.seq += 1
        logger.debug(
            f"[callback] Partial transcript: stream={stream_sid}, "
            f"call={call_sid}, text={text[:50]}"
        )

        # Forward to frontend
        await self.frontend_client.send_transcript(
            call_id=call_sid,
            text=text,
            seq=self.seq,
            is_final=False,
            tenant_id=self.tenant_id,
        )

    async def on_final_transcript(
        self, text: str, stream_sid: str, call_sid: str, metadata: Dict
    ):
        """Handle final transcript"""
        self.seq += 1
        self.transcript_chunks.append(text)

        logger.info(
            f"[callback] Final transcript: stream={stream_sid}, "
            f"call={call_sid}, text={text[:100]}"
        )

        # Forward to frontend
        await self.frontend_client.send_transcript(
            call_id=call_sid,
            text=text,
            seq=self.seq,
            is_final=True,
            tenant_id=self.tenant_id,
        )

        # Detect intent
        try:
            intent_result = await self.intent_detector.detect_intent(
                text, context=self.transcript_chunks[-5:]  # Last 5 chunks for context
            )

            if intent_result.intent != "unknown":
                logger.info(
                    f"[callback] Intent detected: {intent_result.intent}, "
                    f"confidence: {intent_result.confidence}"
                )

                # Forward intent to frontend
                await self.frontend_client.send_intent(
                    call_id=call_sid,
                    intent=intent_result.intent,
                    confidence=intent_result.confidence,
                    tenant_id=self.tenant_id,
                )

                # Search KB articles
                kb_articles = await self.kb_service.search_by_intent(
                    intent=intent_result.intent,
                    original_text=text,
                    tenant_id=self.tenant_id,
                )

                if kb_articles:
                    logger.info(
                        f"[callback] Found {len(kb_articles)} KB articles for intent: "
                        f"{intent_result.intent}"
                    )

                    # Forward KB articles to frontend
                    await self.frontend_client.send_kb_articles(
                        call_id=call_sid,
                        articles=kb_articles,
                        tenant_id=self.tenant_id,
                    )

        except Exception as e:
            logger.error(f"[callback] Error processing transcript: {e}")

    def get_full_transcript(self) -> str:
        """Get accumulated full transcript"""
        return " ".join(self.transcript_chunks)


class WebSocketServer:
    """WebSocket server for handling Exotel connections"""

    def __init__(self):
        self.exotel_handler = ExotelHandler()
        self.intent_detector = IntentDetector()
        self.kb_service = KBService()
        self.disposition_generator = DispositionGenerator()
        self.frontend_client = FrontendClient()

        # Pipeline manager
        self.pipeline = PipecatPipeline()

        # Active connections
        self.connections: Dict[str, Dict] = {}

    async def handle_websocket(self, websocket: WebSocket, stream_sid: Optional[str] = None):
        """Handle a WebSocket connection from Exotel"""
        await websocket.accept()
        logger.info(f"[websocket] New WebSocket connection accepted")

        current_stream_sid: Optional[str] = None
        callback: Optional[CopilotTranscriptCallback] = None

        try:
            while True:
                # Receive message
                message = await websocket.receive_text()

                # Parse Exotel message
                event_data = self.exotel_handler.handle_message(message)

                if not event_data:
                    continue

                event_type = event_data.get("type")

                if event_type == "start":
                    # Initialize pipeline for this stream
                    state: ExotelConnectionState = event_data["state"]
                    current_stream_sid = state.stream_sid

                    # Create callback
                    callback = CopilotTranscriptCallback(
                        stream_sid=state.stream_sid,
                        call_sid=state.call_sid,
                        tenant_id=state.account_sid or "default",
                        intent_detector=self.intent_detector,
                        kb_service=self.kb_service,
                        frontend_client=self.frontend_client,
                    )

                    # Create pipeline with callback
                    await self.pipeline.create_pipeline(
                        stream_sid=state.stream_sid,
                        call_sid=state.call_sid,
                        sample_rate=state.sample_rate,
                        callback=callback,
                    )

                    # Store connection info
                    self.connections[current_stream_sid] = {
                        "state": state,
                        "callback": callback,
                    }

                    logger.info(
                        f"[websocket] Pipeline started for stream: {current_stream_sid}"
                    )

                elif event_type == "media":
                    # Process audio
                    audio_bytes = event_data.get("audio_bytes")
                    state: ExotelConnectionState = event_data.get("state")

                    if audio_bytes and state:
                        await self.pipeline.process_audio(
                            stream_sid=state.stream_sid,
                            audio_bytes=audio_bytes,
                            sample_rate=state.sample_rate,
                        )

                elif event_type == "stop":
                    # Stop pipeline and generate disposition
                    state: ExotelConnectionState = event_data.get("state")
                    stream_sid = state.stream_sid if state else current_stream_sid

                    if stream_sid and stream_sid in self.connections:
                        connection = self.connections[stream_sid]
                        callback = connection.get("callback")

                        # Stop pipeline
                        await self.pipeline.stop_pipeline(stream_sid)

                        # Generate disposition if we have transcript
                        if callback:
                            full_transcript = callback.get_full_transcript()
                            if full_transcript:
                                try:
                                    disposition = await self.disposition_generator.generate_disposition(
                                        transcript=full_transcript,
                                        call_id=state.call_sid if state else stream_sid,
                                    )

                                    # Forward disposition to frontend
                                    await self.frontend_client.send_disposition(
                                        call_id=state.call_sid if state else stream_sid,
                                        disposition=disposition,
                                        tenant_id=state.account_sid if state else "default",
                                    )

                                except Exception as e:
                                    logger.error(
                                        f"[websocket] Error generating disposition: {e}"
                                    )

                        # Cleanup
                        del self.connections[stream_sid]
                        self.exotel_handler.remove_connection(stream_sid)

                    logger.info(f"[websocket] Pipeline stopped for stream: {stream_sid}")
                    break

        except WebSocketDisconnect:
            logger.info(f"[websocket] WebSocket disconnected: {current_stream_sid}")
        except Exception as e:
            logger.error(f"[websocket] Error handling WebSocket: {e}")
        finally:
            # Cleanup on disconnect
            if current_stream_sid:
                if current_stream_sid in self.connections:
                    await self.pipeline.stop_pipeline(current_stream_sid)
                    del self.connections[current_stream_sid]
                self.exotel_handler.remove_connection(current_stream_sid)


"""Pipecat pipeline setup for real-time transcription"""

import logging
import asyncio
import aiohttp
from typing import Optional, Callable, Dict, Any
from pipecat.frames.frames import (
    AudioRawFrame,
    TranscriptionFrame,
    Frame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.stt import ElevenLabsSTTService
from pipecat.services.openai.stt import OpenAISTTService

from .config import settings

logger = logging.getLogger(__name__)


class TranscriptCallback:
    """Callback interface for transcript events"""

    async def on_partial_transcript(
        self, text: str, stream_sid: str, call_sid: str, metadata: Dict[str, Any]
    ):
        """Called when a partial transcript is received"""
        pass

    async def on_final_transcript(
        self, text: str, stream_sid: str, call_sid: str, metadata: Dict[str, Any]
    ):
        """Called when a final transcript is received"""
        pass


class AudioInputProcessor:
    """Processor that accepts raw audio bytes and feeds them to the pipeline"""

    def __init__(self, pipeline: Pipeline):
        self.pipeline = pipeline
        self.is_running = False

    async def process_audio(
        self, audio_bytes: bytes, sample_rate: int, stream_sid: str
    ) -> None:
        """Process audio bytes and feed to pipeline"""
        if not self.is_running:
            return

        # Create AudioRawFrame with PCM16 audio
        # Pipecat expects audio as bytes with specified sample rate
        frame = AudioRawFrame(
            audio=audio_bytes,
            sample_rate=sample_rate,
            num_channels=1,  # Mono audio from Exotel
        )
        await self.pipeline.queue_frames([frame])

    async def start(self):
        """Start the processor"""
        self.is_running = True

    async def stop(self):
        """Stop the processor"""
        self.is_running = False


class TranscriptProcessor(FrameProcessor):
    """Processor that handles transcript frames from STT service"""

    def __init__(self, callback: TranscriptCallback, stream_sid: str, call_sid: str):
        super().__init__()
        self.callback = callback
        self.stream_sid = stream_sid
        self.call_sid = call_sid

    async def process_frame(self, frame: Frame) -> None:
        """Process transcript frames"""
        if isinstance(frame, TranscriptionFrame):
            text = frame.text
            is_final = getattr(frame, "is_final", False)

            metadata = {
                "stream_sid": self.stream_sid,
                "call_sid": self.call_sid,
                "is_final": is_final,
            }

            if is_final:
                await self.callback.on_final_transcript(
                    text, self.stream_sid, self.call_sid, metadata
                )
            else:
                await self.callback.on_partial_transcript(
                    text, self.stream_sid, self.call_sid, metadata
                )
        
        # Pass frame through to next processor
        await self.push_frame(frame)


def create_stt_service(aiohttp_session: Optional[aiohttp.ClientSession] = None) -> Any:
    """Create STT service based on configuration
    
    Args:
        aiohttp_session: Optional aiohttp session for services that require it (e.g., ElevenLabs)
    """
    provider = settings.stt_provider.lower()

    if provider == "deepgram":
        api_key = settings.deepgram_api_key
        if not api_key:
            raise ValueError("DEEPGRAM_API_KEY is required when STT_PROVIDER=deepgram")

        logger.info("[pipeline] Creating Deepgram STT service")
        return DeepgramSTTService(
            api_key=api_key,
            model="nova-2",  # Use latest Deepgram model
            language="en",
            sample_rate=16000,  # Will be adjusted per stream
            channels=1,
        )

    elif provider == "elevenlabs":
        api_key = settings.elevenlabs_api_key
        if not api_key:
            raise ValueError("ELEVENLABS_API_KEY is required when STT_PROVIDER=elevenlabs")

        if not aiohttp_session:
            raise ValueError("aiohttp_session is required for ElevenLabs STT service")

        logger.info("[pipeline] Creating ElevenLabs STT service")
        return ElevenLabsSTTService(
            api_key=api_key,
            aiohttp_session=aiohttp_session,
        )

    elif provider == "openai":
        api_key = settings.openai_api_key or settings.llm_api_key
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required when STT_PROVIDER=openai")

        logger.info("[pipeline] Creating OpenAI Whisper STT service")
        return OpenAISTTService(
            api_key=api_key,
            model="whisper-1",
        )

    else:
        raise ValueError(f"Unsupported STT provider: {provider}")


class PipecatPipeline:
    """Main Pipecat pipeline manager
    
    Manages Pipecat pipelines for multiple streams with proper resource management.
    Creates and reuses aiohttp session for efficient HTTP connections.
    """

    def __init__(self, callback: Optional[TranscriptCallback] = None):
        self.callback = callback
        self.pipelines: Dict[str, Pipeline] = {}
        self.runners: Dict[str, PipelineRunner] = {}
        self.audio_processors: Dict[str, AudioInputProcessor] = {}
        self.callbacks: Dict[str, TranscriptCallback] = {}
        
        # Create shared aiohttp session for services that need it (e.g., ElevenLabs)
        # This allows connection pooling and proper resource management
        self.aiohttp_session: Optional[aiohttp.ClientSession] = None
        
    async def _ensure_session(self):
        """Ensure aiohttp session is created (lazy initialization)"""
        if self.aiohttp_session is None or self.aiohttp_session.closed:
            self.aiohttp_session = aiohttp.ClientSession()
            logger.info("[pipeline] Created aiohttp session for STT services")

    async def create_pipeline(
        self, stream_sid: str, call_sid: str, sample_rate: int, callback: Optional[TranscriptCallback] = None
    ) -> None:
        """Create a new pipeline for a stream"""
        if stream_sid in self.pipelines:
            logger.warning(f"[pipeline] Pipeline already exists for stream: {stream_sid}")
            return

        logger.info(
            f"[pipeline] Creating pipeline for stream: {stream_sid}, "
            f"call: {call_sid}, sample_rate: {sample_rate}"
        )

        # Use provided callback or default
        callback = callback or self.callback
        if not callback:
            raise ValueError("Callback is required for pipeline creation")

        # Store callback for this stream
        self.callbacks[stream_sid] = callback

        # Ensure aiohttp session exists (for services that need it)
        await self._ensure_session()

        # Create STT service with shared session
        stt_service = create_stt_service(aiohttp_session=self.aiohttp_session)

        # Adjust sample rate if service supports it
        if hasattr(stt_service, "sample_rate"):
            stt_service.sample_rate = sample_rate

        # Create transcript processor
        transcript_processor = TranscriptProcessor(
            callback, stream_sid, call_sid
        )

        # Build pipeline: AudioInput -> STT -> TranscriptProcessor
        # Note: Pipecat pipeline structure may vary based on version
        # This is a simplified structure - adjust based on actual Pipecat API
        try:
            pipeline = Pipeline(
                [
                    stt_service,
                    transcript_processor,
                ]
            )

            runner = PipelineRunner(pipeline=pipeline)

            self.pipelines[stream_sid] = pipeline
            self.runners[stream_sid] = runner
            
            # Create and start audio processor
            audio_processor = AudioInputProcessor(pipeline)
            await audio_processor.start()  # CRITICAL: Start the processor so it accepts audio
            self.audio_processors[stream_sid] = audio_processor

            # Start the pipeline runner
            await runner.start()

            logger.info(f"[pipeline] Pipeline created and started for stream: {stream_sid}")

        except Exception as e:
            logger.error(f"[pipeline] Error creating pipeline: {e}")
            raise

    async def process_audio(
        self, stream_sid: str, audio_bytes: bytes, sample_rate: int
    ) -> None:
        """Process audio for a stream"""
        processor = self.audio_processors.get(stream_sid)
        if not processor:
            logger.warning(f"[pipeline] No processor found for stream: {stream_sid}")
            return

        await processor.process_audio(audio_bytes, sample_rate, stream_sid)

    async def stop_pipeline(self, stream_sid: str) -> None:
        """Stop and cleanup pipeline for a stream"""
        runner = self.runners.get(stream_sid)
        processor = self.audio_processors.get(stream_sid)

        if runner:
            try:
                await runner.stop()
            except Exception as e:
                logger.error(f"[pipeline] Error stopping runner: {e}")

        if processor:
            await processor.stop()

        # Cleanup
        if stream_sid in self.pipelines:
            del self.pipelines[stream_sid]
        if stream_sid in self.runners:
            del self.runners[stream_sid]
        if stream_sid in self.audio_processors:
            del self.audio_processors[stream_sid]

        logger.info(f"[pipeline] Pipeline stopped and cleaned up for stream: {stream_sid}")

    async def cleanup(self):
        """Cleanup resources, including aiohttp session"""
        # Close all active pipelines first
        for stream_sid in list(self.pipelines.keys()):
            await self.stop_pipeline(stream_sid)
        
        # Close aiohttp session if it exists
        if self.aiohttp_session and not self.aiohttp_session.closed:
            await self.aiohttp_session.close()
            logger.info("[pipeline] Closed aiohttp session")


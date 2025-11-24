"""FastAPI server for Pipecat Copilot service"""

import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from .config import settings
from .websocket_server import WebSocketServer

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

# Global WebSocket server instance
websocket_server: WebSocketServer = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    global websocket_server

    # Startup
    logger.info("[api] Starting Pipecat Copilot service...")
    try:
        settings.validate()
        logger.info("[api] Configuration validated successfully")
    except ValueError as e:
        logger.error(f"[api] Configuration validation failed: {e}")
        raise

    websocket_server = WebSocketServer()
    logger.info("[api] WebSocket server initialized")

    yield

    # Shutdown
    logger.info("[api] Shutting down Pipecat Copilot service...")


# Create FastAPI app
app = FastAPI(
    title="Pipecat Agent Assist Copilot",
    description="Real-time voice transcription and agent assist service using Pipecat",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get(settings.health_check_path)
async def health_check():
    """Health check endpoint"""
    return JSONResponse(
        {
            "status": "ok",
            "service": "pipecat-copilot",
            "version": "0.1.0",
        }
    )


@app.websocket("/v1/ingest")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for Exotel audio streams
    
    This endpoint accepts Exotel Stream Applet connections and processes
    audio through the Pipecat pipeline for real-time transcription.
    """
    if websocket_server is None:
        await websocket.close(code=1011, reason="Server not initialized")
        return

    await websocket_server.handle_websocket(websocket)


@app.get("/")
async def root():
    """Root endpoint"""
    return JSONResponse(
        {
            "service": "pipecat-copilot",
            "version": "0.1.0",
            "status": "running",
            "endpoints": {
                "health": settings.health_check_path,
                "websocket": "/v1/ingest",
            },
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api_server:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


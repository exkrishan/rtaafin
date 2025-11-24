"""FastAPI server for Pipecat Copilot service"""

import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from typing import Dict

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


def detect_exotel_protocol(headers: Dict[str, str], support_exotel: bool) -> bool:
    """
    Detect if connection is from Exotel based on auth headers.
    Matches the logic from services/ingest/src/server.ts
    
    Args:
        headers: Request headers dictionary
        support_exotel: Whether Exotel support is enabled
        
    Returns:
        True if connection appears to be from Exotel, False otherwise
    """
    auth_header = headers.get("authorization", "")
    
    if not auth_header:
        # No auth = might be IP whitelisted Exotel
        return support_exotel
    
    # Basic Auth = Exotel
    if auth_header.startswith("Basic "):
        return True
    
    # JWT Bearer = our protocol (not Exotel)
    if auth_header.startswith("Bearer "):
        return False
    
    # Default: assume our protocol
    return False


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
    
    # Log Exotel support status
    if settings.support_exotel:
        logger.info(f"[api] Exotel protocol support: ENABLED (auth_method: {settings.exotel_auth_method})")
    else:
        logger.info("[api] Exotel protocol support: DISABLED (set SUPPORT_EXOTEL=true to enable)")

    yield

    # Shutdown
    logger.info("[api] Shutting down Pipecat Copilot service...")
    
    # Cleanup pipeline resources (including aiohttp session)
    if websocket_server and websocket_server.pipeline:
        await websocket_server.pipeline.cleanup()
        logger.info("[api] Pipeline resources cleaned up")


# Create FastAPI app
app = FastAPI(
    title="Pipecat Agent Assist Copilot",
    description="Real-time voice transcription and agent assist service using Pipecat",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get(settings.health_check_path)
async def health_check():
    """Health check endpoint with dependency checks"""
    from .config import settings as app_settings
    import httpx
    
    health_status = {
        "status": "ok",
        "service": "pipecat-copilot",
        "version": "0.1.0",
        "checks": {
            "config": "ok",
            "frontend_api": "unknown",
            "supabase": "unknown",
        },
    }
    
    # Check frontend API
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{app_settings.frontend_api_url}/api/health")
            health_status["checks"]["frontend_api"] = (
                "ok" if response.status_code == 200 else "degraded"
            )
    except Exception as e:
        health_status["checks"]["frontend_api"] = f"error: {str(e)[:50]}"
        health_status["status"] = "degraded"
    
    # Check Supabase if configured
    if app_settings.supabase_url and app_settings.supabase_service_role_key:
        try:
            from supabase import create_client
            supabase = create_client(
                app_settings.supabase_url,
                app_settings.supabase_service_role_key,
            )
            # Simple query to check connection
            supabase.table("kb_articles").select("id").limit(1).execute()
            health_status["checks"]["supabase"] = "ok"
        except Exception as e:
            health_status["checks"]["supabase"] = f"error: {str(e)[:50]}"
            health_status["status"] = "degraded"
    else:
        health_status["checks"]["supabase"] = "not_configured"
    
    status_code = 200 if health_status["status"] == "ok" else 503
    return JSONResponse(health_status, status_code=status_code)


@app.websocket("/v1/ingest")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for Exotel audio streams
    
    This endpoint accepts Exotel Stream Applet connections and processes
    audio through the Pipecat pipeline for real-time transcription.
    
    Authentication:
    - Exotel connections: IP whitelist or Basic Auth (no JWT required)
    - Other connections: JWT Bearer token (if implemented)
    """
    if websocket_server is None:
        await websocket.close(code=1011, reason="Server not initialized")
        return

    # Check if this is Exotel connection
    headers = dict(websocket.headers)
    is_exotel = detect_exotel_protocol(headers, settings.support_exotel)
    
    if is_exotel and settings.support_exotel:
        # Exotel connection - accept without JWT validation
        logger.info("[api] ✅ Exotel WebSocket connection accepted (IP whitelist/Basic Auth)")
        await websocket.accept()
    elif not headers.get("authorization") and settings.support_exotel:
        # No auth header but Exotel support enabled - might be Exotel with IP whitelisting
        logger.info("[api] ⚠️ WebSocket with no auth - accepting as Exotel (SUPPORT_EXOTEL=true)")
        await websocket.accept()
    else:
        # For now, if Exotel support is enabled, accept all connections
        # In the future, you can add JWT validation here for non-Exotel connections
        if settings.support_exotel:
            logger.info("[api] Accepting connection (SUPPORT_EXOTEL=true)")
            await websocket.accept()
        else:
            logger.warning("[api] ❌ Connection rejected - SUPPORT_EXOTEL=false and no valid auth")
            await websocket.close(code=1008, reason="Authentication required")
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
            "exotel": {
                "supported": settings.support_exotel,
                "auth_method": settings.exotel_auth_method,
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


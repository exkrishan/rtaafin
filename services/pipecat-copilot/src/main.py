"""Main entry point for Pipecat Copilot service"""

import uvicorn
from .config import settings
from .api_server import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


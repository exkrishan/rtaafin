"""Main entry point for Pipecat Copilot service"""

import os
import uvicorn
from .config import settings
from .api_server import app

if __name__ == "__main__":
    # Render sets PORT environment variable automatically
    # Read it directly to ensure we use the correct port
    port = int(os.environ.get("PORT", settings.port))
    
    uvicorn.run(
        app,
        host=settings.host,
        port=port,
        log_level=settings.log_level.lower(),
    )


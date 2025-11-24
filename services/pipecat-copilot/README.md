# Pipecat Agent Assist Copilot

Real-time voice transcription and agent assist service using the Pipecat framework. This service receives audio streams from Exotel, performs real-time transcription, detects intent, surfaces KB articles, and generates disposition recommendations.

## Features

- **Real-time Transcription**: Uses Pipecat framework with Deepgram/ElevenLabs/OpenAI STT
- **Intent Detection**: Automatically detects customer intent from transcripts
- **KB Article Surfacing**: Retrieves relevant knowledge base articles based on intent
- **Auto-Disposition**: Generates disposition notes and recommendations from full transcript
- **Exotel Integration**: Handles Exotel Stream Applet WebSocket protocol

## Architecture

```
Exotel → Pipecat Service (STT + Intent + KB + Disposition) → Frontend API → SSE → UI
```

## Prerequisites

- Python 3.10 or higher (3.12 recommended)
- Exotel account with Stream Applet configured
- STT provider API key (Deepgram, ElevenLabs, or OpenAI)
- LLM API key (OpenAI or Gemini) for intent detection and disposition
- Supabase credentials (for KB articles if using DB adapter)
- Next.js frontend service running

## Installation

### Local Development

1. **Clone and navigate to service directory**:
   ```bash
   cd services/pipecat-copilot
   ```

2. **Create virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Run the service**:
   ```bash
   python -m src.main
   ```

The service will start on `http://localhost:5000` by default.

## Configuration

### Environment Variables

See `.env.example` for all available configuration options. Key variables:

#### Exotel Configuration
- `SUPPORT_EXOTEL`: Enable Exotel protocol support (`true` or `false`, default: `true`)
- `EXOTEL_AUTH_METHOD`: Authentication method (`ip_whitelist` or `basic_auth`, default: `ip_whitelist`)
- `EXOTEL_BASIC_AUTH_USER`: Basic auth username (if using basic_auth)
- `EXOTEL_BASIC_AUTH_PASS`: Basic auth password (if using basic_auth)

#### STT Provider
- `STT_PROVIDER`: STT provider (`deepgram`, `elevenlabs`, or `openai`) - **Default: `elevenlabs`**
- `ELEVENLABS_API_KEY`: ElevenLabs API key (**REQUIRED** when using ElevenLabs)
- `DEEPGRAM_API_KEY`: Deepgram API key (if using Deepgram)
- `OPENAI_API_KEY`: OpenAI API key (if using OpenAI)

#### LLM Configuration
- `LLM_PROVIDER`: LLM provider (`openai` or `gemini`) - **Default: `gemini`**
- `GEMINI_API_KEY`: Gemini API key (**REQUIRED** when using Gemini)
- `LLM_API_KEY`: Alternative LLM API key (can be used instead of GEMINI_API_KEY)

#### Frontend Integration
- `FRONTEND_API_URL`: Next.js frontend API base URL (e.g., `http://localhost:3000`)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key

#### KB Configuration
- `KB_ADAPTER_TYPE`: KB adapter type (`db` or `knowmax`)
- `KNOWMAX_API_KEY`: Knowmax API key (if using Knowmax)
- `KNOWMAX_BASE_URL`: Knowmax base URL (if using Knowmax)

#### Server Configuration
- `PORT`: Server port (default: `5000`)
- `HOST`: Server host (default: `0.0.0.0`)
- `LOG_LEVEL`: Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`)

## Deployment

### Render Deployment

1. **Create a new Web Service** on Render:
   - **Environment**: Python
   - **Root Directory**: `services/pipecat-copilot`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python -m src.main`
   - **Health Check Path**: `/health`

2. **Configure Environment Variables**:
   - Add all required environment variables from `.env.example`
   - Ensure all API keys are set correctly

3. **Deploy**:
   - Connect your Git repository
   - Select the branch: `feat/agent-assist-copilot-pipecat`
   - Render will automatically build and deploy

### Docker Deployment

1. **Build the image**:
   ```bash
   docker build -t pipecat-copilot .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     --name pipecat-copilot \
     -p 5000:5000 \
     --env-file .env \
     pipecat-copilot
   ```

## Exotel Configuration

### Stream Applet Setup

1. **Deploy the service on Render** to get a public URL (e.g., `https://pipecat-copilot.onrender.com`)

2. **Configure Stream Applet in Exotel Dashboard**:
   - **Action**: Start
   - **URL**: `wss://pipecat-copilot.onrender.com/v1/ingest` (use your Render service URL)
   - **Next Applet**: Configure as needed
   
   **Important**: Use `wss://` (WebSocket Secure) protocol for the URL. Render provides HTTPS URLs, so convert `https://` to `wss://` and use the same domain.

2. **Authentication**:
   - **IP Whitelisting** (Recommended): Contact Exotel for IP ranges
   - **Basic Auth**: Configure credentials in Exotel dashboard

3. **Sample Rate**:
   - Exotel supports 8kHz, 16kHz, or 24kHz
   - Service automatically converts 24kHz to 16kHz for optimal transcription

## API Endpoints

### Health Check
```
GET /health
```
Returns service health status.

### WebSocket Endpoint
```
WS /v1/ingest
```
Accepts Exotel WebSocket connections for audio streaming.

## Integration with Frontend

The service integrates with the existing Next.js frontend by calling:

- `POST /api/calls/ingest-transcript` - Sends transcripts
- `POST /api/calls/intent` - Sends intent updates (optional)
- `POST /api/calls/auto_notes` - Sends disposition summaries

All data is forwarded to the frontend API, which then broadcasts via SSE to connected clients.

## Development

### Running Tests

```bash
pytest tests/
```

### Code Formatting

```bash
black src/
ruff check src/
```

## Troubleshooting

### Common Issues

1. **Configuration Validation Errors**:
   - Ensure all required API keys are set
   - Check that provider names match exactly (`deepgram`, `elevenlabs`, `openai`)

2. **WebSocket Connection Failures**:
   - Verify Exotel IP whitelisting or Basic Auth credentials
   - Check firewall rules for WebSocket connections

3. **STT Transcription Issues**:
   - Verify STT provider API key is valid
   - Check sample rate compatibility (8kHz, 16kHz supported)

4. **Frontend Integration Issues**:
   - Ensure `FRONTEND_API_URL` is correct
   - Verify Next.js service is running and accessible

## License

See main repository license.


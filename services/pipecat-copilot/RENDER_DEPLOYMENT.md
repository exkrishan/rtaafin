# Render Deployment Guide for Pipecat Copilot

## Overview

This guide provides step-by-step instructions to deploy the Pipecat Copilot service on Render and configure it for Exotel audio streaming.

## Prerequisites

- Render account (free tier works)
- ElevenLabs API key (for transcription)
- Gemini API key (for intent detection and disposition)
- Supabase credentials (for KB articles)
- Next.js frontend service URL

## Step 1: Deploy on Render

### 1.1 Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your Git repository
4. Select repository: `rtaafin`
5. Select branch: `feat/agent-assist-copilot-pipecat`

### 1.2 Configure Service Settings

**Basic Settings:**
- **Name**: `pipecat-copilot` (or your preferred name)
- **Environment**: `Python 3`
- **Region**: Choose closest to your users (e.g., `Oregon (US West)`)
- **Branch**: `feat/agent-assist-copilot-pipecat`
- **Root Directory**: `services/pipecat-copilot` ⚠️ **CRITICAL**

**Build & Deploy:**
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `python -m src.main`

**Advanced Settings:**
- **Python Version**: `3.12` (or latest)
- **Health Check Path**: `/health` ⚠️ **REQUIRED**
- **Auto-Deploy**: `Yes` (recommended)

### 1.3 Configure Environment Variables

Click **"Environment"** tab and add these variables:

#### Required Variables

```bash
# STT Provider (ElevenLabs)
STT_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# LLM Provider (Gemini)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here

# Frontend Integration
FRONTEND_API_URL=https://your-frontend-service.onrender.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# KB Configuration
KB_ADAPTER_TYPE=db

# Server Configuration
PORT=5000
HOST=0.0.0.0
LOG_LEVEL=INFO
```

#### Optional Variables

```bash
# Exotel Authentication (if using Basic Auth)
EXOTEL_AUTH_METHOD=ip_whitelist  # or basic_auth
EXOTEL_BASIC_AUTH_USER=your_username  # if using basic_auth
EXOTEL_BASIC_AUTH_PASS=your_password  # if using basic_auth

# Redis (optional, for pub/sub)
REDIS_URL=redis://...
```

### 1.4 Deploy

1. Click **"Create Web Service"**
2. Render will build and deploy your service
3. Wait for deployment to complete (usually 2-5 minutes)

## Step 2: Get Public URL

After deployment, Render will provide a public URL:

- **Example**: `https://pipecat-copilot.onrender.com`
- **WebSocket URL**: `wss://pipecat-copilot.onrender.com/v1/ingest`

**Important**: 
- Render provides HTTPS URLs
- For WebSocket, use `wss://` (WebSocket Secure) instead of `https://`
- Keep the same domain, just change the protocol

## Step 3: Configure Exotel Stream Applet

### 3.1 In Exotel Dashboard

1. Go to **App Bazaar** → **Stream Applet** (Unidirectional)
2. Configure the applet:
   - **Action**: Start
   - **URL**: `wss://pipecat-copilot.onrender.com/v1/ingest` (use your Render URL)
   - **Next Applet**: Configure as needed

### 3.2 Authentication

**Option 1: IP Whitelisting (Recommended)**
1. Contact Exotel support: `hello@exotel.com`
2. Request their outbound IP ranges
3. Whitelist those IPs in Render (if supported) or use a firewall
4. Set `EXOTEL_AUTH_METHOD=ip_whitelist` in Render environment variables

**Option 2: Basic Authentication**
1. Set `EXOTEL_AUTH_METHOD=basic_auth` in Render
2. Set `EXOTEL_BASIC_AUTH_USER` and `EXOTEL_BASIC_AUTH_PASS`
3. Configure in Exotel dashboard with credentials

## Step 4: Verify Deployment

### 4.1 Health Check

```bash
curl https://pipecat-copilot.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "pipecat-copilot",
  "version": "0.1.0"
}
```

### 4.2 Test WebSocket Connection

You can test the WebSocket endpoint using a tool like `websocat`:

```bash
websocat wss://pipecat-copilot.onrender.com/v1/ingest
```

Or use a WebSocket testing tool in your browser.

### 4.3 Check Logs

1. Go to Render Dashboard → Your Service → **Logs**
2. Look for:
   - `[api] Starting Pipecat Copilot service...`
   - `[api] Configuration validated successfully`
   - `[api] WebSocket server initialized`

## Step 5: Test End-to-End Flow

1. **Make a test call** through Exotel with Stream Applet enabled
2. **Check Render logs** for:
   - `[exotel] Start event received`
   - `[pipeline] Creating pipeline for stream`
   - `[callback] Final transcript`
   - `[callback] Intent detected`
   - `[callback] Found X KB articles`
3. **Check frontend** for:
   - Transcripts appearing in real-time
   - Intent updates
   - KB article suggestions
   - Disposition summary after call ends

## Troubleshooting

### Service Won't Start

- Check Render logs for errors
- Verify all required environment variables are set
- Ensure `ELEVENLABS_API_KEY` and `GEMINI_API_KEY` are valid

### WebSocket Connection Fails

- Verify URL uses `wss://` not `https://`
- Check Exotel authentication (IP whitelist or Basic Auth)
- Check Render logs for connection errors

### No Transcripts

- Verify ElevenLabs API key is valid
- Check sample rate compatibility (8kHz or 16kHz)
- Review pipeline logs for STT errors

### Intent/KB Not Working

- Verify Gemini API key is valid
- Check `FRONTEND_API_URL` is correct
- Verify Supabase credentials if using DB adapter

## Support

For issues:
1. Check Render service logs
2. Review configuration in Render dashboard
3. Verify all API keys are valid
4. Test health endpoint: `/health`


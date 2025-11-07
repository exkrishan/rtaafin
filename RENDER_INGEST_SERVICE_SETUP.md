# 🚀 Render Ingestion Service Deployment Guide

## Overview

The **Ingestion Service** (`services/ingest`) is a separate WebSocket server that handles real-time audio ingestion. It must be deployed as a **separate service** from the Next.js frontend.

---

## Service Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│  Frontend Service   │         │  Ingestion Service  │
│  (Next.js App)      │         │  (WebSocket Server) │
│                     │         │                     │
│  - Web UI           │         │  - WebSocket: /v1/ingest
│  - API Routes       │         │  - Health: /health
│  - Health: /api/health│       │  - Port: 5000+      │
└─────────────────────┘         └─────────────────────┘
```

---

## Render Service Configuration

### 1. Create New Service

1. Go to Render Dashboard
2. Click **"New +"** → **"Web Service"**
3. Connect repository: `exkrishan/rtaafin`
4. Select branch: `main`

### 2. Basic Settings

| Setting | Value |
|---------|-------|
| **Name** | `rtaa-ingest` or `ingest` (if available) |
| **Environment** | `Node` |
| **Region** | `Singapore (Southeast Asia)` (same as frontend) |
| **Branch** | `main` |

### 3. Build & Deploy Settings

| Setting | Value |
|---------|-------|
| **Root Directory** | `services/ingest` |
| **Build Command** | `cd ../.. && npm ci && cd services/ingest && npm run build` |
| **Start Command** | `npm run start` |
| **Node Version** | `20.x` |

### 4. Health Check

| Setting | Value |
|---------|-------|
| **Health Check Path** | `/health` |
| **Expected Response** | `{"status":"ok","service":"ingest"}` |

### 5. Environment Variables

Add these in Render Dashboard → Environment:

```bash
# Port (auto-set by Render, but can override)
PORT=5000

# JWT Authentication (required)
JWT_PUBLIC_KEY=<your-jwt-public-key>

# Redis Pub/Sub (required)
REDIS_URL=<your-redis-url>
PUBSUB_ADAPTER=redis_streams

# Optional: Exotel support
SUPPORT_EXOTEL=false

# Optional: SSL/TLS (if using HTTPS)
SSL_KEY_PATH=
SSL_CERT_PATH=
```

---

## Service Endpoints

After deployment, the service will expose:

- **WebSocket:** `wss://<service-url>/v1/ingest`
- **Health Check:** `https://<service-url>/health`
- **HTTP:** Standard HTTP server (for health checks)

---

## Verification

### 1. Health Check
```bash
curl https://<service-url>/health
# Expected: {"status":"ok","service":"ingest"}
```

### 2. WebSocket Connection
```bash
# Use WebSocket client or test script
wscat -c wss://<service-url>/v1/ingest \
  -H "Authorization: Bearer <jwt-token>"
```

### 3. Check Logs
- Go to Render Dashboard → Service → Logs
- Look for: `[server] Ingestion server listening on port <PORT>`
- Look for: `[server] WebSocket endpoint: wss://...`

---

## Differences from Frontend Service

| Aspect | Frontend Service | Ingestion Service |
|--------|-----------------|-------------------|
| **Root Directory** | `/` (repo root) | `services/ingest` |
| **Build Command** | `npm ci && npm run build` | `cd ../.. && npm ci && cd services/ingest && npm run build` |
| **Start Command** | `npm run start` | `npm run start` |
| **Health Path** | `/api/health` | `/health` |
| **Service Name** | `frontend` | `ingest` |
| **Purpose** | Web UI, API routes | WebSocket audio ingestion |

---

## Troubleshooting

### Build Fails: "Cannot find module '@rtaa/pubsub'"
**Fix:** Ensure build command runs `npm ci` from repo root first to resolve workspaces.

### Health Check Fails
**Fix:** Verify health check path is `/health` (not `/api/health`).

### WebSocket Connection Fails
**Fix:** 
- Check JWT_PUBLIC_KEY is set correctly
- Verify WebSocket URL uses `wss://` (secure) or `ws://` (insecure)
- Check authentication header format: `Authorization: Bearer <token>`

### Port Issues
**Fix:** Render automatically sets `PORT` - don't hardcode it. Service uses `process.env.PORT`.

---

## Next Steps After Deployment

1. ✅ Verify health endpoint responds
2. ✅ Test WebSocket connection with JWT token
3. ✅ Configure frontend to use new WebSocket URL
4. ✅ Test end-to-end: WebSocket → ASR → Transcripts

---

## Service URLs

After deployment, you'll have:

- **Frontend:** `https://<frontend-service>.onrender.com`
- **Ingestion:** `https://<ingest-service>.onrender.com`
- **WebSocket:** `wss://<ingest-service>.onrender.com/v1/ingest`

---

**Status:** Ready for deployment  
**Last Updated:** 2025-11-07


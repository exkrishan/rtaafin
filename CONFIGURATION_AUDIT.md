# Configuration Audit for Production Readiness

This document audits all environment variables and service configurations required for production.

## Required Environment Variables

### Ingest Service

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Yes | `5000` | WebSocket server port |
| `REDIS_URL` | Yes | - | Redis connection URL |
| `PUBSUB_ADAPTER` | Yes | `redis_streams` | Pub/sub adapter type |
| `SUPPORT_EXOTEL` | Yes | `false` | Enable Exotel protocol support |
| `BUFFER_DURATION_MS` | No | `3000` | Audio buffer duration |
| `ACK_INTERVAL` | No | `10` | Acknowledgment interval |
| `EXO_BRIDGE_ENABLED` | No | `false` | Exotel bridge feature flag |
| `EXO_MAX_BUFFER_MS` | No | `500` | Max buffer duration for bridge |
| `EXO_IDLE_CLOSE_S` | No | `10` | Idle connection timeout |

### ASR Worker

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Yes | `3001` | HTTP server port |
| `REDIS_URL` | Yes | - | Redis connection URL |
| `PUBSUB_ADAPTER` | Yes | `redis_streams` | Pub/sub adapter type |
| `ASR_PROVIDER` | Yes | `mock` | ASR provider (elevenlabs, deepgram, etc.) |
| `ELEVENLABS_API_KEY` | If ASR_PROVIDER=elevenlabs | - | ElevenLabs API key |
| `DEEPGRAM_API_KEY` | If ASR_PROVIDER=deepgram | - | Deepgram API key |
| `INITIAL_CHUNK_DURATION_MS` | No | `200` | Initial chunk duration |
| `CONTINUOUS_CHUNK_DURATION_MS` | No | `100` | Continuous chunk duration |
| `MAX_CHUNK_DURATION_MS` | No | `250` | Maximum chunk duration |
| `MIN_AUDIO_DURATION_MS` | No | `200` | Minimum audio duration |
| `ASR_CHUNK_MIN_MS` | No | `100` | Minimum ASR chunk size |
| `BUFFER_WINDOW_MS` | No | `1000` | Buffer window duration |
| `STALE_BUFFER_TIMEOUT_MS` | No | `5000` | Stale buffer timeout |

### Frontend/Next.js

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Yes | `3000` | Next.js server port |
| `REDIS_URL` | Yes | - | Redis connection URL |
| `LLM_PROVIDER` | Yes | `openai` | LLM provider (gemini, openai) |
| `GEMINI_API_KEY` | If LLM_PROVIDER=gemini | - | Gemini API key |
| `LLM_API_KEY` | If LLM_PROVIDER=openai | - | OpenAI API key |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Gemini model name |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | - | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | - | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | - | Supabase service role key |

## Configuration Validation

### Production Configuration Checklist

- [ ] All required environment variables set
- [ ] `SUPPORT_EXOTEL=true` for Exotel integration
- [ ] `ASR_PROVIDER=elevenlabs` for ElevenLabs transcription
- [ ] `LLM_PROVIDER=gemini` for Gemini intent/disposition
- [ ] Valid API keys for all services
- [ ] Redis URL accessible from all services
- [ ] Supabase credentials configured
- [ ] Ports not conflicting with other services
- [ ] SSL/TLS configured for production (if needed)

### Service-Specific Configuration

#### Ingest Service

```bash
# Required
PORT=8443
REDIS_URL=redis://localhost:6379
PUBSUB_ADAPTER=redis_streams
SUPPORT_EXOTEL=true

# Optional (with defaults)
BUFFER_DURATION_MS=3000
ACK_INTERVAL=10
```

#### ASR Worker

```bash
# Required
PORT=3001
REDIS_URL=redis://localhost:6379
PUBSUB_ADAPTER=redis_streams
ASR_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your-key-here

# Optional (with defaults)
INITIAL_CHUNK_DURATION_MS=200
CONTINUOUS_CHUNK_DURATION_MS=100
```

#### Frontend

```bash
# Required
PORT=3000
REDIS_URL=redis://localhost:6379
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional
GEMINI_MODEL=gemini-2.0-flash
```

## Configuration Testing

### Validation Script

Run configuration validation:

```bash
npx tsx scripts/test-production-readiness.ts
```

This checks:
- All required environment variables
- Service health endpoints
- Redis connectivity
- API key validity (basic checks)

### Manual Validation

1. **Check Environment Variables:**
   ```bash
   # Ingest Service
   cd services/ingest
   npm run dev
   # Check logs for missing variables
   
   # ASR Worker
   cd services/asr-worker
   npm run dev
   # Check logs for missing variables
   
   # Frontend
   npm run dev
   # Check logs for missing variables
   ```

2. **Verify API Keys:**
   - ElevenLabs: Check ASR Worker logs for authentication errors
   - Gemini: Check frontend logs for API errors
   - Supabase: Check database connection

3. **Test Redis Connection:**
   ```bash
   redis-cli -u $REDIS_URL ping
   # Should return: PONG
   ```

## Common Configuration Issues

### Missing Environment Variables

**Symptom:** Service fails to start or shows errors in logs

**Solution:**
1. Check `.env.local` file
2. Verify environment variables in deployment platform (Render, etc.)
3. Check service logs for specific missing variables

### Invalid API Keys

**Symptom:** Authentication errors in logs

**Solution:**
1. Verify API keys are correct
2. Check API key quotas/limits
3. Regenerate keys if needed

### Redis Connection Issues

**Symptom:** Services can't connect to Redis

**Solution:**
1. Verify `REDIS_URL` is correct
2. Check Redis is running and accessible
3. Verify network/firewall settings
4. Check Redis authentication (if required)

### Port Conflicts

**Symptom:** Service fails to start with "port already in use"

**Solution:**
1. Change `PORT` environment variable
2. Kill process using the port
3. Use different ports for each service

## Production Deployment Configuration

### Render.com Configuration

For Render.com deployments, set environment variables in:
- **Dashboard → Service → Environment**

Required variables for each service:
- **Ingest Service**: `REDIS_URL`, `SUPPORT_EXOTEL=true`, `PORT`
- **ASR Worker**: `REDIS_URL`, `ASR_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY`, `PORT`
- **Frontend**: `REDIS_URL`, `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Local Development Configuration

Create `.env.local` in project root:

```bash
# Redis
REDIS_URL=redis://localhost:6379

# Ingest Service
SUPPORT_EXOTEL=true

# ASR Worker
ASR_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your-key-here

# Frontend
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Configuration Security

### Sensitive Variables

Never commit these to version control:
- API keys (`ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, etc.)
- Database credentials
- Service role keys

### Best Practices

1. Use environment variables for all sensitive data
2. Use `.env.local` for local development (gitignored)
3. Use deployment platform secrets for production
4. Rotate API keys regularly
5. Use least-privilege access for API keys

## Configuration Validation Checklist

- [ ] All required environment variables set
- [ ] API keys valid and have sufficient quota
- [ ] Redis connection working
- [ ] Supabase connection working
- [ ] Services start without errors
- [ ] Health endpoints return OK
- [ ] No configuration errors in logs
- [ ] Production URLs configured correctly
- [ ] SSL/TLS configured (if needed)
- [ ] CORS settings configured (if needed)


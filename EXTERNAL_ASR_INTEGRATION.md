# External ASR Integration Guide

## Overview

This document describes the new architecture for receiving transcripts from an external ASR service via HTTP API instead of the old WebSocket + Redis Streams architecture.

## Architecture Change

### Old Architecture (Deprecated)
```
External ASR → Ingest Service (WebSocket) → Redis Streams → ASR Worker → Redis Lists → Transcript Consumer → API → UI
```

### New Architecture (Current)
```
External ASR → POST /api/transcripts/receive → Supabase → SSE/Polling → UI
                                              ↓
                                         Intent Detection
                                              ↓
                                         KB Article Surfacing
```

## New API Endpoint

### POST /api/transcripts/receive

Receives real-time transcripts from external ASR service (e.g., Azure Speech SDK, Google Speech-to-Text, etc.)

**Endpoint**: `https://your-domain.com/api/transcripts/receive`

**Method**: POST

**Authentication**: None required

**Request Body**:
```json
{
  "callId": "string",           // Required: Unique call identifier
  "transcript": "string",       // Required: The transcript text
  "session_id": "string|null",  // Optional: Session identifier
  "asr_service": "string",      // Required: e.g., "Azure", "Google", "AWS"
  "timestamp": "string",        // Required: ISO timestamp (e.g., "2024-01-01T12:00:00Z")
  "isFinal": boolean            // Required: true if final transcript, false if partial
}
```

**Response**:
```json
{
  "ok": true,
  "callId": "string",
  "seq": number,
  "message": "Transcript received and processing"
}
```

**Example**:
```bash
curl -X POST https://your-domain.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "call-123456",
    "transcript": "Hello, how can I help you today?",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "2024-01-01T12:00:00Z",
    "isFinal": false
  }'
```

## What Happens When a Transcript is Received

1. **Validation**: Request body is validated for required fields
2. **Sequence Generation**: Auto-generates a `seq` number for ordering (cached for 1 second per callId)
3. **Storage**: Transcript is stored in Supabase `ingest_events` table
4. **Intent Detection**: LLM analyzes the transcript to detect user intent (e.g., "billing_inquiry", "account_balance")
5. **KB Article Surfacing**: Relevant knowledge base articles are retrieved based on detected intent
6. **SSE Broadcast**: Transcript, intent, and KB articles are broadcast to connected UI clients via Server-Sent Events
7. **Response**: HTTP 200 OK is returned immediately (fire-and-forget processing)

## Environment Variables

### Required Variables

```bash
# Supabase Database
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# LLM Provider (for intent detection and disposition generation)
LLM_PROVIDER=gemini                    # Options: gemini, openai
GEMINI_API_KEY=your-gemini-api-key     # If using Gemini
LLM_API_KEY=your-openai-api-key        # If using OpenAI

# Node Environment
NODE_ENV=production
```

### Optional Variables

```bash
# TranscriptConsumer (disabled by default)
ENABLE_TRANSCRIPT_CONSUMER=false       # Set to 'true' to enable old Redis Streams consumer

# TLS Certificate Validation (for local development with corporate proxies)
ALLOW_INSECURE_TLS=false               # Set to 'true' only for local dev with proxy issues
```

### Removed Variables (No Longer Needed)

The following environment variables are **no longer required** with the new architecture:

```bash
# ❌ REDIS_URL                          # Removed: No longer using Redis Streams/Lists
# ❌ REDISCLOUD_URL                     # Removed: No longer using Redis
# ❌ PUBSUB_ADAPTER                     # Removed: No longer using pub/sub
# ❌ RENDER_SERVICE_URL                 # Removed: Only needed for TranscriptConsumer
```

## Frontend Integration

### Polling Mode (Recommended)

The frontend polls `/api/transcripts/latest?callId=xxx` every 5 seconds to fetch:
- Complete transcripts (ordered by `seq`)
- Latest detected intent
- Relevant KB articles

**File**: `hooks/useRealtimeTranscript.ts`

**Configuration**:
```typescript
const pollMode = true; // Set to true to use polling mode
```

### SSE Streaming Mode (Alternative)

The frontend can also subscribe to Server-Sent Events for real-time updates:
- `transcript` events: New transcript chunks
- `intent_update` events: New intent and KB articles

**File**: `hooks/useRealtimeTranscript.ts`

**Configuration**:
```typescript
const pollMode = false; // Set to false to use SSE streaming mode
```

## Database Schema

### ingest_events Table

Stores all transcript chunks:

```sql
CREATE TABLE ingest_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  speaker TEXT,  -- 'customer' or 'agent'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(call_id, seq)
);

CREATE INDEX idx_ingest_events_call_id ON ingest_events(call_id);
CREATE INDEX idx_ingest_events_seq ON ingest_events(call_id, seq);
```

### intents Table

Stores detected intents:

```sql
CREATE TABLE intents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  intent TEXT NOT NULL,
  confidence NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_intents_call_id ON intents(call_id);
```

### kb_articles Table

Stores knowledge base articles:

```sql
CREATE TABLE kb_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  snippet TEXT,
  content TEXT,
  url TEXT,
  tags TEXT[],
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_articles_tags ON kb_articles USING GIN(tags);
```

## Testing the Integration

### 1. Test Transcript Ingestion

```bash
# Send a test transcript
curl -X POST http://localhost:3000/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-call-001",
    "transcript": "I need help with my billing",
    "session_id": null,
    "asr_service": "Azure",
    "timestamp": "2024-01-01T12:00:00Z",
    "isFinal": true
  }'

# Expected response:
# {"ok":true,"callId":"test-call-001","seq":1,"message":"Transcript received and processing"}
```

### 2. Verify Transcript Storage

```bash
# Fetch transcripts from API
curl "http://localhost:3000/api/transcripts/latest?callId=test-call-001"

# Expected response includes:
# - transcripts array with stored text
# - detected intent
# - relevant KB articles
```

### 3. Check Database

```sql
-- Check transcript in Supabase
SELECT * FROM ingest_events WHERE call_id = 'test-call-001';

-- Check detected intent
SELECT * FROM intents WHERE call_id = 'test-call-001';
```

### 4. Test End-to-End Flow

Use the provided test script:

```bash
npm run test:complete-flow
```

This validates:
- Transcript ingestion
- Intent detection
- KB article surfacing
- Disposition generation

## Migration from Old Architecture

### Step 1: Deploy New Code

Deploy the updated codebase with the new `/api/transcripts/receive` endpoint.

### Step 2: Update External ASR Service

Configure your external ASR service to POST transcripts to:
```
https://your-domain.com/api/transcripts/receive
```

### Step 3: Remove Redis (Optional)

If Redis is not used for other purposes, you can:
1. Remove `REDIS_URL` environment variable from Render
2. Delete Redis instance
3. Remove `ioredis` package: `npm uninstall ioredis`

### Step 4: Disable Old Services (Optional)

The old Ingest Service and ASR Worker are no longer needed:
- Stop `ingest-service` on Render
- Stop `asr-worker` on Render

**Note**: Keep these services running initially for a gradual migration.

## Troubleshooting

### Issue: Transcripts not appearing in UI

**Check**:
1. Verify transcript is stored in Supabase: `SELECT * FROM ingest_events WHERE call_id = 'xxx'`
2. Check API response: `curl "http://localhost:3000/api/transcripts/latest?callId=xxx"`
3. Check browser console for SSE/polling errors
4. Verify `callId` matches between API and UI

### Issue: Intent/KB articles not surfacing

**Check**:
1. Verify LLM provider is configured: `echo $LLM_PROVIDER`
2. Check API key is valid: `echo $GEMINI_API_KEY` or `echo $LLM_API_KEY`
3. Check logs for LLM errors: Look for `[detectIntent]` or `[surfaceKB]` errors
4. Verify KB articles exist in database: `SELECT * FROM kb_articles`

### Issue: Disposition generation failing

**Check**:
1. Verify transcripts exist: `SELECT * FROM ingest_events WHERE call_id = 'xxx'`
2. Check `/api/calls/summary` endpoint with: `curl -X POST http://localhost:3000/api/calls/summary -d '{"callId":"xxx"}'`
3. Verify LLM provider is working (same as intent detection)

## API Reference

### GET /api/transcripts/latest

Fetch complete transcripts and associated data for a call.

**Query Parameters**:
- `callId` (required): Call identifier
- `tenantId` (optional): Tenant identifier (default: 'default')

**Response**:
```json
{
  "ok": true,
  "callId": "string",
  "transcripts": [
    {
      "id": "string",
      "text": "string",
      "speaker": "customer" | "agent",
      "timestamp": "string",
      "seq": number
    }
  ],
  "count": number,
  "intent": "string",
  "confidence": number,
  "articles": [
    {
      "id": "string",
      "title": "string",
      "snippet": "string",
      "url": "string",
      "confidence": number
    }
  ]
}
```

### POST /api/calls/end

Mark a call as ended and generate disposition.

**Request Body**:
```json
{
  "interactionId": "string",
  "callSid": "string",      // optional
  "reason": "string"        // optional
}
```

**Response**:
```json
{
  "ok": true,
  "interactionId": "string",
  "disposition": {
    "issue": "string",
    "resolution": "string",
    "nextSteps": "string",
    "suggestedDispositions": [...],
    "confidence": number
  },
  "transcriptLength": number
}
```

### POST /api/calls/summary

Generate call summary and disposition recommendations.

**Request Body**:
```json
{
  "callId": "string",
  "interactionId": "string",  // alternative to callId
  "tenantId": "string"        // optional
}
```

**Response**:
```json
{
  "ok": true,
  "summary": {
    "issue": "string",
    "resolution": "string",
    "next_steps": "string",
    "confidence": number
  },
  "mappedDispositions": [...]
}
```

## Support

For issues or questions:
1. Check application logs for errors
2. Verify environment variables are set correctly
3. Test each component individually (transcript ingestion → intent detection → KB surfacing)
4. Check Supabase database for data consistency


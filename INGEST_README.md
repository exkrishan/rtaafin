# RTAA Phase 1.5: Transcript Ingest Orchestrator

## Overview

Robust ingestion system for processing transcript chunks in real-time. Supports local development mode and S3 production mode with retry logic, deduplication, and comprehensive logging.

## Architecture

```
┌─────────────────┐
│  Local Files    │  (dev mode)
│  or S3 Bucket   │  (s3 mode)
└────────┬────────┘
         │
         ▼
   ┌────────────┐
   │   Ingest   │  ← Orchestrator (lib/ingest.ts)
   │ Orchestr.  │    - Polling (2.5s default)
   └─────┬──────┘    - Retry logic
         │           - Deduplication
         ▼
   ┌────────────┐
   │ API Routes │
   │ /ingest    │
   └─────┬──────┘
         │
         ▼
   ┌────────────┐
   │  Supabase  │
   │  Database  │
   └────────────┘
```

## Files Created

### Core Library
- **lib/ingest.ts** - Orchestration engine with `startIngest()` and `stopIngest()`

### API Endpoints
- **app/api/ingest/s3-index/route.ts** - Returns manifest of available chunks
- **app/api/ingest/check/route.ts** - Server-side deduplication check
- **app/api/calls/ingest-transcript/route.ts** - Receives and stores chunks
- **app/api/calls/end/route.ts** - Finalizes call when end marker detected

### CLI Tools
- **scripts/start-ingest.ts** - TypeScript CLI (recommended)
- **scripts/start-ingest.js** - Node.js CLI (fallback)

### Database
- **data/migrations/001_create_ingest_events.sql** - Supabase table schema

### Test Data
- **data/call-123/chunk-001.json** through **chunk-004.json** - Sample chunks

## Setup

### 1. Apply Database Migration

Run this SQL in your Supabase SQL Editor:

```bash
cat data/migrations/001_create_ingest_events.sql
```

Or use Supabase CLI:

```bash
supabase db push
```

### 2. Verify Environment Variables

Ensure `.env.local` contains:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Start Next.js Dev Server

```bash
npm run dev
```

## Usage

### Dev Mode (Local Files)

1. Place transcript chunks in `./data/${callId}/`:

```bash
mkdir -p data/call-456
echo '{"callId":"call-456","seq":1,"ts":"2025-11-04T10:00:00Z","text":"Hello"}' > data/call-456/chunk-001.json
echo '{"callId":"call-456","seq":2,"ts":"2025-11-04T10:00:05Z","text":"Goodbye","end":true}' > data/call-456/chunk-002.json
```

2. Start ingestion:

```bash
npx tsx scripts/start-ingest.ts --callId call-456 --mode dev
```

Or with Node.js:

```bash
node scripts/start-ingest.js --callId call-456 --mode dev
```

3. Watch server logs for:

```
[ingest] Starting ingest for callId=call-456, mode=dev
[ingest] Posting chunk seq=1 callId=call-456
[ingest-transcript] Received chunk { callId: 'call-456', seq: 1, ... }
[ingest] Chunk seq=1 posted successfully
[ingest] End marker detected, stopping ingest
[call-end] Finalizing call { callId: 'call-456' }
```

### S3 Mode (Production)

```bash
npx tsx scripts/start-ingest.ts --callId call-789 --mode s3
```

Requires S3 environment variables in production:

```env
S3_BUCKET=your-bucket
S3_REGION=us-east-1
S3_INGEST_PREFIX=rtaa/transcripts
```

## Features

### Retry Logic

Automatic retry with exponential backoff:
- Attempt 1: Wait 500ms
- Attempt 2: Wait 1000ms
- Attempt 3: Wait 2000ms
- After 3 failures: Log error and continue to next chunk

### Deduplication

Two-level deduplication:
1. **In-memory**: Tracks processed `(callId, seq)` pairs
2. **Server-side**: Calls `/api/ingest/check` to verify with database

### End Marker Handling

When a chunk contains `"end": true`:
1. Process the final chunk
2. Call `POST /api/calls/end` to finalize
3. Stop ingestion loop

### Edge Cases Handled

- ✅ Missing chunk files → Log warning and exit gracefully
- ✅ Out-of-order seq → Reorder by seq before posting
- ✅ Duplicate seq → Skip if already seen
- ✅ Empty text → Skip and log warning
- ✅ Network failures → 3 retries with backoff, then continue
- ✅ End marker → Finalize and stop

## Verification

### Check Supabase Table

```sql
SELECT * FROM ingest_events WHERE call_id = 'call-123' ORDER BY seq;
```

Expected output:

```
| id | call_id  | seq | ts                   | text                  | created_at |
|----|----------|-----|----------------------|-----------------------|------------|
| .. | call-123 | 1   | 2025-11-04T10:01:00Z | Hello, this is...     | ...        |
| .. | call-123 | 2   | 2025-11-04T10:01:05Z | Hi, I need help...    | ...        |
| .. | call-123 | 3   | 2025-11-04T10:01:10Z | I can definitely...   | ...        |
| .. | call-123 | 4   | 2025-11-04T10:01:15Z | Thank you for...      | ...        |
```

### Test API Endpoints

```bash
# Test s3-index endpoint
curl "http://localhost:3000/api/ingest/s3-index?callId=call-123" | jq .

# Test check endpoint
curl "http://localhost:3000/api/ingest/check?callId=call-123&seq=1" | jq .

# Test manual chunk post
curl -X POST http://localhost:3000/api/calls/ingest-transcript \
  -H "Content-Type: application/json" \
  -d '{"callId":"test-call","seq":1,"ts":"2025-11-04T10:00:00Z","text":"Test"}' | jq .
```

## Logs to Watch For

### Success Flow

```
[ingest] Starting ingest for callId=call-123, mode=dev
[s3-index] Found 4 chunks in /path/to/data/call-123
[ingest] Posting chunk seq=1 callId=call-123
[ingest-transcript] Received chunk { callId: 'call-123', seq: 1, ts: '2025-11-04T10:01:00Z', textLength: 59 }
[ingest-transcript] Stored in Supabase: [...]
[ingest] Chunk seq=1 posted successfully
... (repeat for seq 2, 3, 4)
[ingest] End marker detected, stopping ingest
[call-end] Finalizing call { callId: 'call-123' }
[ingest] Stopped ingest for callId=call-123
```

### Error Handling

```
[ingest] Attempt 1/3 failed for seq=2: Error: fetch failed
[ingest] Attempt 2/3 failed for seq=2: Error: fetch failed
[ingest] Attempt 3/3 failed for seq=2: Error: fetch failed
[ingest] Max retries exceeded for seq=2, continuing to next chunk
```

## Troubleshooting

### Issue: "Directory not found"

```
[s3-index] Directory not found: /path/to/data/call-123
```

**Solution**: Create the directory and add chunk files:

```bash
mkdir -p data/call-123
echo '{"callId":"call-123","seq":1,"ts":"2025-11-04T10:00:00Z","text":"Hello"}' > data/call-123/chunk-001.json
```

### Issue: "Supabase insert error"

```
[ingest-transcript] Supabase insert error: relation "ingest_events" does not exist
```

**Solution**: Run the migration SQL:

```bash
cat data/migrations/001_create_ingest_events.sql | pbcopy
# Paste into Supabase SQL Editor and run
```

### Issue: "tsx not found"

**Solution**: Install tsx:

```bash
npm install --save-dev tsx
```

## Next Steps

- **Phase 2**: Intent detection from transcript text
- **Phase 3**: Real-time UI updates via WebSockets
- **Phase 4**: S3 presigned URL generation
- **Phase 5**: KB article recommendations

## Vibe-Coding Prompt

For incremental improvements, use:

```
"Enhance the RTAA ingest orchestrator with [feature]: maintain TypeScript strictness, add proper error handling, update logs, and test with sample data."
```

Example improvements:
- WebSocket broadcast for real-time updates
- S3 presigned URL implementation
- Intent detection integration
- Performance metrics collection

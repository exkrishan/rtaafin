# Phase 2 Implementation Summary: Intent Detection & KB Recommendations

## ✅ Files Created/Modified

### New Files (5)

**Core Library:**
- `/Users/kirti.krishnan/Desktop/Projects/RTAA/rtaa/lib/intent.ts` - Intent detection with OpenAI integration

**API Endpoints:**
- `/Users/kirti.krishnan/Desktop/Projects/RTAA/rtaa/app/api/calls/intent/route.ts` - GET/POST endpoints for intent management
- `/Users/kirti.krishnan/Desktop/Projects/RTAA/rtaa/app/api/debug/intent/route.ts` - Diagnostic endpoint for LLM testing

**Database Migration:**
- `/Users/kirti.krishnan/Desktop/Projects/RTAA/rtaa/data/migrations/002_create_intents.sql` - Intents table schema

**Documentation:**
- `/Users/kirti.krishnan/Desktop/Projects/RTAA/rtaa/PHASE_2_SUMMARY.md` - This file

### Modified Files (1)

- `/Users/kirti.krishnan/Desktop/Projects/RTAA/rtaa/app/api/calls/ingest-transcript/route.ts` - Added intent detection + KB article fetching

---

## 🎯 Feature Overview

Phase 2 adds real-time intent detection and knowledge base recommendations:

1. **Intent Detection**: Each transcript chunk is analyzed by OpenAI (gpt-4o-mini)
2. **Intent Storage**: Detected intents are stored in Supabase `intents` table
3. **KB Recommendations**: Relevant articles are fetched based on detected intent
4. **Graceful Degradation**: System continues to work even if LLM is unavailable

---

## 🔧 Setup Required

### 1. Add OpenAI API Key to `.env.local`

```bash
# Add this to your .env.local file
LLM_API_KEY=sk-your-openai-api-key-here
```

Get your API key from: https://platform.openai.com/api-keys

### 2. Run SQL Migration

Copy and run this in Supabase SQL Editor:

```bash
cat data/migrations/002_create_intents.sql
```

Or copy the SQL directly:

```sql
CREATE TABLE IF NOT EXISTS intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  intent TEXT NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(call_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_intents_call_id ON intents(call_id);
CREATE INDEX IF NOT EXISTS idx_intents_call_seq ON intents(call_id, seq);
CREATE INDEX IF NOT EXISTS idx_intents_intent ON intents(intent);
CREATE INDEX IF NOT EXISTS idx_intents_confidence ON intents(confidence);
CREATE INDEX IF NOT EXISTS idx_intents_created_at ON intents(created_at);
```

### 3. Restart Next.js Server

```bash
# Stop any running servers
pkill -f "next dev" || true

# Start fresh
npm run dev
```

---

## 🧪 Smoke Test Commands

### Test 1: Verify LLM Connection

```bash
curl -s "http://localhost:3000/api/debug/intent?text=help%20reset%20my%20password" | jq .
```

**Expected Output:**
```json
{
  "ok": true,
  "intent": "reset_password",
  "confidence": 0.9,
  "llm_configured": true
}
```

### Test 2: Run Full Ingestion with Intent Detection

```bash
npx tsx scripts/start-ingest.ts --callId call-123 --mode dev
```

**Expected Console Output:**
```
[ingest] Starting ingest for callId=call-123, mode=dev
[ingest] Posting chunk seq=1 callId=call-123
[ingest-transcript] Detecting intent for seq: 1
[intent] Calling OpenAI API for intent detection
[intent] Detected intent: { intent: 'customer_support_greeting', confidence: 0.85 }
[ingest-transcript] Intent detected: { intent: 'customer_support_greeting', confidence: 0.85 }
[ingest-transcript] Intent stored in database
[ingest-transcript] Fetching KB articles for intent: customer_support_greeting
[ingest-transcript] Found KB articles: 2
[ingest] Chunk seq=1 posted successfully
...
```

### Test 3: Verify Intent Storage

```bash
curl -s "http://localhost:3000/api/calls/intent?callId=call-123" | jq .
```

**Expected Output:**
```json
{
  "ok": true,
  "intent": "reset_password",
  "confidence": 0.92,
  "seq": 2,
  "created_at": "2025-11-04T10:15:30.123Z"
}
```

### Test 4: Manual Intent Storage

```bash
curl -X POST "http://localhost:3000/api/calls/intent" \
  -H "Content-Type: application/json" \
  -d '{"callId":"test-call","seq":1,"intent":"update_billing","confidence":0.88}' | jq .
```

**Expected Output:**
```json
{
  "ok": true,
  "intent": "update_billing",
  "confidence": 0.88
}
```

### Test 5: Verify Ingest Returns Articles

```bash
curl -X POST "http://localhost:3000/api/calls/ingest-transcript" \
  -H "Content-Type: application/json" \
  -d '{"callId":"test","seq":99,"ts":"2025-11-04T10:00:00Z","text":"I need help resetting my password"}' | jq .
```

**Expected Output:**
```json
{
  "ok": true,
  "intent": "reset_password",
  "confidence": 0.92,
  "articles": [
    {
      "id": "fedca6fd-79bc-41bb-be41-4d2b025c48bf",
      "title": "Resetting Customer Password",
      "snippet": "Guide agents through password reset verification steps.",
      "url": "https://kb.exotel.com/password-reset",
      "tags": ["auth", "password", "reset"]
    }
  ]
}
```

---

## 📊 Expected Console Logs

### Server Console (Next.js):

```
[ingest-transcript] Received chunk { callId: 'call-123', seq: 2, ts: '...', textLength: 53 }
[ingest-transcript] Detecting intent for seq: 2
[intent] Calling OpenAI API for intent detection
[intent] Detected intent: { intent: 'reset_password', confidence: 0.91 }
[ingest-transcript] Intent detected: { intent: 'reset_password', confidence: 0.91 }
[ingest-transcript] Intent stored in database
[ingest-transcript] Fetching KB articles for intent: reset_password
 GET /api/kb/search?query=reset_password 200 in 145ms
[ingest-transcript] Found KB articles: 1
 POST /api/calls/ingest-transcript 200 in 1523ms
```

### CLI Console (start-ingest.ts):

```
[start-ingest] Starting ingestion...
[start-ingest] callId: call-123
[start-ingest] mode: dev
[ingest] Starting ingest for callId=call-123, mode=dev
[ingest] Posting chunk seq=1 callId=call-123
[ingest] Chunk seq=1 posted successfully
[ingest] Posting chunk seq=2 callId=call-123
[ingest] Chunk seq=2 posted successfully
[ingest] Posting chunk seq=3 callId=call-123
[ingest] Chunk seq=3 posted successfully
[ingest] End marker detected, stopping ingest
[call-end] Finalizing call { callId: 'call-123' }
[ingest] Stopped ingest for callId=call-123
```

---

## 🔍 Verify in Supabase

### Check Intents Table

```sql
SELECT
  call_id,
  seq,
  intent,
  confidence,
  created_at
FROM intents
WHERE call_id = 'call-123'
ORDER BY seq;
```

**Expected Result:**
```
call_id   | seq | intent                        | confidence | created_at
----------|-----|-------------------------------|------------|------------
call-123  | 1   | customer_support_greeting     | 0.85       | 2025-11-04...
call-123  | 2   | reset_password               | 0.91       | 2025-11-04...
call-123  | 3   | password_reset_confirmation  | 0.88       | 2025-11-04...
call-123  | 4   | call_closing                 | 0.82       | 2025-11-04...
```

---

## 🚨 Manual Steps Required

### Step 1: Create Intents Table

⚠️ **REQUIRED** - Run the SQL migration in Supabase:

1. Go to: https://supabase.com/dashboard/project/[your-project]/sql/new
2. Paste contents of `data/migrations/002_create_intents.sql`
3. Click "Run"
4. Verify: `SELECT * FROM intents LIMIT 1;` (should return no rows, not an error)

### Step 2: Add OpenAI API Key

⚠️ **REQUIRED** - Add to `.env.local`:

```bash
LLM_API_KEY=sk-your-openai-api-key-here
```

Without this key, intent detection will return `{intent: "unknown", confidence: 0}`.

### Step 3: Restart Server

After adding the API key:

```bash
pkill -f "next dev" || true
npm run dev
```

---

## 🎛️ API Endpoints Reference

### `GET /api/debug/intent?text=...`
Test intent detection directly.

**Example:**
```bash
curl "http://localhost:3000/api/debug/intent?text=I%20forgot%20my%20password"
```

### `POST /api/calls/ingest-transcript`
Now returns intent + KB articles.

**Request:**
```json
{
  "callId": "call-123",
  "seq": 1,
  "ts": "2025-11-04T10:00:00Z",
  "text": "I need help resetting my password"
}
```

**Response:**
```json
{
  "ok": true,
  "intent": "reset_password",
  "confidence": 0.92,
  "articles": [...]
}
```

### `GET /api/calls/intent?callId=...`
Retrieve latest intent for a call.

**Example:**
```bash
curl "http://localhost:3000/api/calls/intent?callId=call-123"
```

### `POST /api/calls/intent`
Manually store an intent.

**Request:**
```json
{
  "callId": "call-123",
  "seq": 5,
  "intent": "technical_support",
  "confidence": 0.75
}
```

---

## 🛡️ Error Handling

Phase 2 implements graceful degradation:

| Scenario | Behavior |
|----------|----------|
| LLM_API_KEY missing | Returns `{intent: "unknown", confidence: 0}` |
| OpenAI API timeout | Returns `{intent: "unknown", confidence: 0}` |
| Supabase insert fails | Logs warning, continues processing |
| KB search fails | Returns empty articles array |
| Invalid intent | Normalizes to valid format (e.g., `reset-password` → `reset_password`) |

---

## 📈 Performance Notes

- **OpenAI API latency**: ~500-1500ms per call
- **Model**: gpt-4o-mini (cost: ~$0.00015 per request)
- **Timeout**: No explicit timeout (uses default fetch timeout)
- **Caching**: Not implemented (future enhancement)
- **Retry logic**: Not implemented (returns unknown on failure)

---

## 🚀 Next Steps

Phase 2 complete! Ready for:

- **Phase 3**: Real-time UI updates via WebSockets
- **Phase 4**: Intent confidence thresholds
- **Phase 5**: Multi-turn context window
- **Phase 6**: Custom intent training data

---

## 📝 Testing Checklist

- [ ] LLM_API_KEY added to `.env.local`
- [ ] Intents table created in Supabase
- [ ] Server restarted with new environment variables
- [ ] `/api/debug/intent` returns valid intent
- [ ] Ingestion detects and stores intents
- [ ] KB articles are returned based on intent
- [ ] Intents table populated with test data
- [ ] Error handling works when LLM unavailable

---

**Current Milestone: v0.2-ingest + Phase 2**
Phase 2 complete — Intent detection operational with OpenAI + KB recommendations
Next phase: Real-time UI updates

---

# M2 - KB Adapter (Generic) Implementation

## ✅ Files Created/Modified

### New Files (8)

**Database Migration:**
- `data/migrations/003_create_kb_configs_and_auto_notes.sql` - Multi-tenant KB config and auto notes tables

**Core Library:**
- `lib/kb-adapter.ts` - KB adapter factory and interface definitions
- `lib/telemetry.ts` - Telemetry/metrics emitter for KB search performance
- `lib/adapters/dbAdapter.ts` - Supabase KB articles adapter
- `lib/adapters/knowmaxAdapter.ts` - Knowmax API adapter (external KB)
- `lib/adapters/noopAdapter.ts` - Fallback adapter (returns empty results)

**Helper Scripts:**
- `scripts/seed-kb-config.sh` - Bash script to seed tenant KB configuration
- `scripts/quick-kb-test.ts` - TypeScript script to test KB adapter search

### Modified Files (2)

- `app/api/kb/search/route.ts` - Updated to use adapter pattern
- `app/api/calls/ingest-transcript/route.ts` - Refactored to use KB adapter instead of HTTP fetch

---

## 🎯 Feature Overview

M2 adds multi-tenant KB adapter layer with support for multiple providers:

1. **Adapter Pattern**: Unified interface for multiple KB providers (DB, Knowmax, Zendesk)
2. **Multi-Tenant Config**: Per-tenant KB provider configuration via `kb_configs` table
3. **Factory Pattern**: `getKbAdapter(tenantId)` returns appropriate adapter based on config
4. **Graceful Fallback**: Falls back to DB adapter or noop adapter if config missing
5. **Telemetry**: KB search performance tracking with latency and result counts
6. **Provider Abstraction**: Easy to add new KB providers without changing API code

---

## 🔧 Database Schema

### Table: `kb_configs`

Stores per-tenant KB provider configuration:

```sql
CREATE TABLE kb_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,  -- 'db' | 'knowmax' | 'zendesk' | 'custom'
  config JSONB NOT NULL,   -- Provider-specific config (API keys, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT kb_configs_provider_check CHECK (provider IN ('db', 'knowmax', 'zendesk', 'custom'))
);

CREATE UNIQUE INDEX idx_kb_configs_tenant ON kb_configs(tenant_id);
```

### Table: `auto_notes`

Stores AI-generated call summaries:

```sql
CREATE TABLE auto_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  note TEXT NOT NULL,
  model TEXT,              -- LLM model used (e.g., 'gpt-4o-mini')
  prompt_version TEXT,     -- Version/template of prompt
  confidence DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🧱 Architecture

### KB Adapter Interface

```typescript
export interface KBAdapter {
  search(query: string, opts?: KBSearchOpts): Promise<KBArticle[]>;
  fetchById?(id: string): Promise<KBArticle | null>;
  init?(config?: any): Promise<void>;
}
```

### Adapter Types

| Adapter | Source | Use Case |
|---------|--------|----------|
| `dbAdapter` | Supabase `kb_articles` table | Default, built-in KB |
| `knowmaxAdapter` | Knowmax API | External KB service |
| `noopAdapter` | None | Fallback when no provider configured |
| `zendeskAdapter` | Zendesk API | TODO: Future implementation |

### Factory Pattern

```typescript
const adapter = await getKbAdapter('demo');
const articles = await adapter.search('password reset', {
  tenantId: 'demo',
  max: 10
});
```

The factory:
1. Queries `kb_configs` table for tenant
2. Reads `provider` field ('db', 'knowmax', etc.)
3. Returns appropriate adapter instance
4. Falls back to `dbAdapter` if no config found

---

## 🧪 Setup & Testing

### Step 1: Run Migration

```bash
# Copy SQL to Supabase SQL Editor
cat data/migrations/003_create_kb_configs_and_auto_notes.sql
```

Or run in Supabase SQL Editor:
https://supabase.com/dashboard/project/[your-project]/sql/new

### Step 2: Seed Demo Tenant Config

```bash
# Seed default tenant with DB adapter
source .env.local && bash scripts/seed-kb-config.sh

# Or seed Knowmax tenant
TENANT_ID=acme \
PROVIDER=knowmax \
CONFIG='{"baseUrl":"https://api.knowmax.ai","apiKey":"your-key"}' \
bash scripts/seed-kb-config.sh
```

### Step 3: Test KB Search

```bash
# Test default tenant (uses DB adapter)
npx tsx scripts/quick-kb-test.ts --query "password reset"

# Test specific tenant
npx tsx scripts/quick-kb-test.ts --tenant acme --query "billing" --max 5
```

**Expected Output:**
```
🔍 KB Adapter Test
==================
Tenant: default
Query: "password reset"
Max Results: 10

📦 Fetching adapter for tenant...
🔎 Searching...

✅ Search completed
⏱️  Latency: 145ms
📊 Results: 3
🏷️  Provider: db

📄 Top Results:

1. Resetting Customer Password
   ID: fedca6fd-79bc-41bb-be41-4d2b025c48bf
   Source: db
   Confidence: 100.0%
   URL: https://kb.exotel.com/password-reset
   Snippet: Guide agents through password reset verification steps....
   Tags: auth, password, reset
```

### Step 4: Test via API

```bash
# Test unified search endpoint
curl "http://localhost:3000/api/kb/search?query=password&tenantId=demo" | jq .

# Test with tenant header
curl "http://localhost:3000/api/kb/search?query=password" \
  -H "x-tenant-id: acme" | jq .
```

**Expected Response:**
```json
{
  "ok": true,
  "tenantId": "demo",
  "query": "password",
  "results": [
    {
      "id": "fedca6fd-...",
      "title": "Resetting Customer Password",
      "snippet": "Guide agents through...",
      "url": "https://kb.exotel.com/password-reset",
      "tags": ["auth", "password"],
      "source": "db",
      "confidence": 1.0
    }
  ]
}
```

---

## 📊 Telemetry

KB search performance is tracked via `lib/telemetry.ts`:

```typescript
await emitKBSearch(
  tenantId,    // e.g., 'demo'
  provider,    // e.g., 'db', 'knowmax'
  latencyMs,   // 145
  foundCount,  // 3
  error        // optional error message
);
```

### Telemetry Output

**Success:**
```
[kb-telemetry] kb_suggestion_latency_logged tenant=demo provider=db latency_ms=145 found=3
```

**Error:**
```
[kb-telemetry] kb_suggestion_latency_logged tenant=acme provider=knowmax latency_ms=5003 found=0 error=timeout
```

Telemetry attempts to write to `rtaa_metrics` table if it exists, otherwise logs to console.

---

## 🚨 Provider Configuration Examples

### Database Provider (Default)

```bash
TENANT_ID=demo \
PROVIDER=db \
CONFIG='{}' \
bash scripts/seed-kb-config.sh
```

Uses Supabase `kb_articles` table with ILIKE full-text search.

### Knowmax Provider

```bash
TENANT_ID=acme \
PROVIDER=knowmax \
CONFIG='{
  "baseUrl": "https://api.knowmax.ai",
  "apiKey": "km_live_xxxxx"
}' \
bash scripts/seed-kb-config.sh
```

Uses Knowmax API with 5-second timeout.

### Zendesk Provider (Future)

```bash
TENANT_ID=corp \
PROVIDER=zendesk \
CONFIG='{
  "subdomain": "mycompany",
  "apiToken": "xxx"
}' \
bash scripts/seed-kb-config.sh
```

Not yet implemented - falls back to noop adapter.

---

## 🎛️ API Changes

### Updated: `GET /api/kb/search`

Now supports multi-tenant KB routing:

**Query Parameters:**
- `query` - Search query string (required)
- `max` - Max results (default: 10)
- `tenantId` - Tenant identifier (optional)

**Headers:**
- `x-tenant-id` - Alternative way to specify tenant

**Example:**
```bash
curl "http://localhost:3000/api/kb/search?query=password&max=5&tenantId=acme"
```

### Updated: `POST /api/calls/ingest-transcript`

Now uses adapter pattern internally:

**Headers:**
- `x-tenant-id` - Tenant identifier (optional, defaults to 'default')

**Internal Changes:**
- Replaces `fetch('http://localhost:3000/api/kb/search')` with direct adapter call
- Uses `getKbAdapter(tenantId)` to get appropriate provider
- Removes hardcoded localhost URL dependency
- Improves latency by avoiding HTTP roundtrip

---

## 🔍 Adapter Implementation Details

### dbAdapter (Supabase)

**File:** `lib/adapters/dbAdapter.ts`

**Search Method:**
```typescript
const queryBuilder = supabase
  .from('kb_articles')
  .select('id, title, snippet, url, tags')
  .limit(maxResults)
  .or(`title.ilike.%${query}%,snippet.ilike.%${query}%,tags.cs.{${query}}`);
```

**Features:**
- Full-text search across title, snippet, and tags
- ILIKE pattern matching for case-insensitive search
- Tag containment search using `cs` (contains) operator
- Returns normalized `KBArticle[]` with `source: 'db'`

### knowmaxAdapter (External API)

**File:** `lib/adapters/knowmaxAdapter.ts`

**Search Method:**
```typescript
const response = await fetch(`${baseUrl}/api/search?q=${query}&limit=${max}`, {
  headers: { 'Authorization': `Bearer ${apiKey}` },
  signal: controller.signal // 5s timeout
});
```

**Features:**
- 5-second timeout using AbortController
- Bearer token authentication
- Response mapping from Knowmax format to `KBArticle`
- Graceful error handling (returns [] on failure)
- Telemetry emission for monitoring

**Configuration:**
```typescript
await knowmaxAdapter.init({
  baseUrl: 'https://api.knowmax.ai',
  apiKey: 'km_live_xxxxx'
});
```

### noopAdapter (Fallback)

**File:** `lib/adapters/noopAdapter.ts`

**Purpose:**
- Safe fallback when no KB provider configured
- Returns empty array `[]`
- Logs warning about missing configuration
- Prevents crashes from misconfigured tenants

---

## 🛡️ Error Handling

| Scenario | Behavior |
|----------|----------|
| Tenant not in `kb_configs` | Falls back to `dbAdapter` |
| Unknown provider | Falls back to `noopAdapter` |
| Adapter init fails | Falls back to `dbAdapter` |
| Search timeout (Knowmax) | Returns `[]`, logs telemetry with error |
| Supabase down | Returns `[]`, logs error |
| Invalid query | Returns `[]` gracefully |

All errors are logged and emitted to telemetry for monitoring.

---

## 📈 Performance Considerations

### dbAdapter
- **Latency**: ~50-200ms (Supabase query)
- **Scaling**: Limited by Postgres performance
- **Cost**: Included in Supabase plan

### knowmaxAdapter
- **Latency**: ~200-1000ms (external API + network)
- **Timeout**: 5 seconds
- **Cost**: Per Knowmax API pricing
- **Caching**: Not implemented (future enhancement)

### Recommendations
- Use `max: 3` for ingest pipeline (minimize latency)
- Use `max: 10` for API endpoints
- Consider Redis caching for frequently searched queries
- Monitor telemetry for adapter performance degradation

---

## 🚀 Next Steps

M2 complete! Ready for:

- **Implement Zendesk adapter** - Add third provider option
- **Add caching layer** - Redis for frequently searched queries
- **Semantic search** - Use embeddings instead of keyword matching
- **Custom adapters** - Load adapters from external modules
- **Response ranking** - Combine results from multiple adapters
- **Metrics dashboard** - Visualize KB search telemetry

---

## 📝 Testing Checklist

- [ ] Migration 003 run in Supabase
- [ ] `kb_configs` and `auto_notes` tables exist
- [ ] Demo tenant seeded with DB adapter
- [ ] `npx tsx scripts/quick-kb-test.ts` returns results
- [ ] `/api/kb/search?query=password` works
- [ ] Ingest pipeline uses adapter (check console logs)
- [ ] Telemetry logs appear in console
- [ ] Graceful fallback works (try unknown tenant)
- [ ] Knowmax adapter config documented (if using)

---

Generated: 2025-11-05
Phase: 2 + M2 (Intent Detection + KB Adapter)
Status: ✅ Ready for testing

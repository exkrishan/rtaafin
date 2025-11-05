# M3 - Multi-Scope Configuration System Implementation

## ✅ Files Created/Modified

### New Files (12)

**Core Library:**
- `lib/config.ts` - Configuration management with hierarchical merging (524 lines)
  - DEFAULT_CONFIG constant with all default values
  - Config type definitions
  - getConfigByScope() - fetch single config
  - upsertConfig() - create/update configs with versioning
  - getEffectiveConfig() - hierarchical merging with caching
  - getConfigSchema() - schema metadata for UI

**API Endpoints:**
- `app/api/config/route.ts` - Main config API (GET list, PUT upsert)
- `app/api/config/effective/route.ts` - GET merged configuration
- `app/api/config/schema/route.ts` - GET configuration schema

**UI Components:**
- `app/components/ConfigEditor.tsx` - Reusable JSON editor component
- `app/admin/configs/page.tsx` - Admin page for managing configurations

**Scripts:**
- `scripts/seed-default-config.sh` - Seed global and default tenant configs
- `tests/config.test.ts` - Basic configuration tests

### Modified Files (2)

- `app/api/calls/ingest-transcript/route.ts` - Integrated getEffectiveConfig() for kb.maxArticles
- `app/api/kb/search/route.ts` - Uses config defaults for max results
- `package.json` - Added lodash dependency

---

## 🎯 Features Implemented

### 1. Multi-Scope Configuration Hierarchy

Configurations merge from lowest to highest precedence:
```
DEFAULT_CONFIG → global → tenant → campaign → agent
```

Each scope can override specific fields while inheriting the rest.

### 2. Deep Merge Strategy

Uses `lodash.merge` for nested object merging:

**Example:**
```javascript
// Global config
{
  "kb": {
    "provider": "db",
    "maxArticles": 10,
    "timeoutMs": 5000
  }
}

// Tenant config (only overrides maxArticles)
{
  "kb": {
    "maxArticles": 5
  }
}

// Effective merged result
{
  "kb": {
    "provider": "db",      // inherited from global
    "maxArticles": 5,      // overridden by tenant
    "timeoutMs": 5000      // inherited from global
  }
}
```

### 3. Configuration Schema

Supports 6 main configuration sections:

- **kb** - Knowledge Base settings (provider, maxArticles, timeoutMs, minConfidence)
- **llm** - LLM settings (model, temperature, maxTokens, timeoutMs)
- **autoNotes** - Auto-generated notes (enabled, model, promptVersion)
- **disposition** - Call disposition (enabled, categories)
- **telemetry** - Telemetry settings (enabled, sampleRate)
- **ui** - UI preferences (theme, showConfidence, autoScroll)

### 4. Caching

- In-memory LRU cache with 5-second TTL
- Cache key: `${tenantId}|${campaignId}|${agentId}`
- Cleared automatically on config updates

### 5. Telemetry Integration

Emits events for:
- **config_fetch** - When getEffectiveConfig() is called
  - Includes: tenantId, campaignId, agentId, latency_ms, resolvedScopes
- **config_updated** - When PUT /api/config succeeds
  - Includes: scope, scopeId, version, actor, changedKeys

### 6. Admin Authentication

- Write endpoints require `x-admin-key` header
- Validates against `process.env.ADMIN_KEY`
- Returns 401 if missing or incorrect

---

## 🔧 API Reference

### GET /api/config

List all configurations or get a specific config.

**List all:**
```bash
curl http://localhost:3000/api/config
```

**Get specific config:**
```bash
curl "http://localhost:3000/api/config?scope=tenant&scopeId=default"
```

**Response:**
```json
{
  "ok": true,
  "config": {
    "id": "uuid",
    "scope": "tenant",
    "scope_id": "default",
    "config": { "kb": { "maxArticles": 5 } },
    "version": 2,
    "updated_by": "admin-ui",
    "updated_at": "2025-11-05T10:00:00Z"
  }
}
```

### PUT /api/config

Create or update a configuration.

**Headers:**
- `x-admin-key`: Admin key for authentication
- `Content-Type`: application/json

**Body:**
```json
{
  "scope": "tenant",
  "scopeId": "demo",
  "config": {
    "kb": {
      "maxArticles": 5
    }
  },
  "actor": "admin-ui"
}
```

**Response:**
```json
{
  "ok": true,
  "id": "uuid",
  "version": 1,
  "updated_at": "2025-11-05T10:00:00Z"
}
```

### GET /api/config/effective

Get effective merged configuration for a context.

**Query params:**
- `tenantId` - Tenant identifier
- `campaignId` - Campaign identifier (optional)
- `agentId` - Agent identifier (optional)

**Example:**
```bash
curl "http://localhost:3000/api/config/effective?tenantId=demo&campaignId=camp-1"
```

**Response:**
```json
{
  "ok": true,
  "config": {
    "kb": {
      "provider": "db",
      "maxArticles": 5,
      "timeoutMs": 5000,
      "minConfidence": 0.5
    },
    "llm": { ... },
    "autoNotes": { ... },
    ...
  },
  "context": {
    "tenantId": "demo",
    "campaignId": "camp-1",
    "agentId": null
  }
}
```

### GET /api/config/schema

Get configuration schema for UI rendering.

```bash
curl http://localhost:3000/api/config/schema
```

**Response:**
```json
{
  "ok": true,
  "schema": {
    "kb": {
      "type": "object",
      "label": "Knowledge Base",
      "properties": {
        "maxArticles": {
          "type": "number",
          "label": "Max Articles",
          "min": 1,
          "max": 20,
          "default": 10
        },
        ...
      }
    },
    ...
  }
}
```

---

## 🧪 Testing & Setup

### Step 1: Add Admin Key to Environment

```bash
# Add to .env.local
ADMIN_KEY=your-secret-admin-key-here
NEXT_PUBLIC_ADMIN_KEY=your-secret-admin-key-here  # For dev UI
```

### Step 2: Seed Default Configurations

```bash
# Source environment and run seed script
source .env.local && bash scripts/seed-default-config.sh

# Or specify admin key directly
ADMIN_KEY=test123 bash scripts/seed-default-config.sh
```

**Expected output:**
```
🔧 Seeding default configurations...
📝 Creating global configuration...
✅ Global config created successfully
📝 Creating 'default' tenant configuration...
✅ Default tenant config created successfully
🎉 Configuration seeding completed!
```

### Step 3: Run Tests

```bash
# Run configuration tests
source .env.local && npx tsx tests/config.test.ts
```

**Expected output:**
```
🧪 Running Configuration Tests

Test 1: Default configuration
✅ Default kb.maxArticles should be 10
✅ Default llm.model should be gpt-4o-mini
✅ Default kb.provider should be db

Test 2: Tenant configuration merging (requires seed)
  Found kb.maxArticles: 5
  Found llm.model: gpt-4o-mini
✅ kb.maxArticles should be a number
✅ kb.maxArticles should be between 1 and 20

...

Tests Passed: 12
Tests Failed: 0
✅ All tests passed!
```

### Step 4: Access Admin UI

```bash
# Start dev server
npm run dev

# Visit admin page
open http://localhost:3000/admin/configs
```

---

## 🔍 Integration Examples

### In Ingest Pipeline

`app/api/calls/ingest-transcript/route.ts` now uses config:

```typescript
// Get effective config for tenant
const config = await getEffectiveConfig({ tenantId });

// Use config value for KB search
articles = await kbAdapter.search(intent, {
  tenantId,
  max: config.kb.maxArticles,  // Uses configured value
});
```

### In KB Search API

`app/api/kb/search/route.ts` now uses config:

```typescript
// Get effective config for tenant
const config = await getEffectiveConfig({ tenantId });

// Use config default if not specified in query
const maxResults = parseInt(
  url.searchParams.get('max') || String(config.kb.maxArticles),
  10
);
```

---

## 📊 Admin UI Usage

### Listing Configurations

1. Navigate to http://localhost:3000/admin/configs
2. View all existing configurations in table format
3. See scope, scope ID, version, and last updated info

### Creating New Configuration

1. Select scope (global, tenant, campaign, agent)
2. Enter scope ID (if not global)
3. Click "Create"
4. Enter configuration as JSON
5. Click "Save"

### Editing Configuration

1. Click "Edit" on any configuration in the list
2. Modify JSON in the editor
3. Use "Format JSON" button to prettify
4. Click "Save" to persist changes
5. Version number automatically increments

### Configuration Tips

- **Partial configs**: Only include fields you want to override
- **Deep merge**: Nested objects are merged, not replaced
- **Validation**: JSON syntax is validated before save
- **Reset**: Use "Reset" button to revert to original

---

## 🛡️ Security & Auth

### Admin Key Protection

- All write operations (`PUT /api/config`) require `x-admin-key` header
- Read operations (`GET`) are currently public (change if needed)
- Admin key should be strong and kept secret

### Environment Variables

**Server-side:**
- `ADMIN_KEY` - Required for config updates (server-only)

**Client-side (dev only):**
- `NEXT_PUBLIC_ADMIN_KEY` - For admin UI development
- **Production**: Inject via `window.__ADMIN_KEY__` or use proper auth

---

## 📈 Performance Considerations

### Caching

- 5-second TTL reduces database hits
- Cache cleared on any config update
- Consider Redis for production multi-instance deployments

### Telemetry Overhead

- Config fetch telemetry emitted asynchronously
- Minimal impact on request latency
- Can be disabled via `telemetry.enabled: false`

### Merge Performance

- lodash.merge is efficient for shallow configs
- Keep configs reasonably sized (< 10KB)
- Avoid deeply nested structures (3-4 levels max)

---

## 🚀 Future Enhancements

- [ ] Config versioning with rollback capability
- [ ] Config change audit log
- [ ] Visual form builder (instead of JSON editor)
- [ ] Config validation schemas (JSON Schema)
- [ ] Config export/import
- [ ] Multi-tenant isolation improvements
- [ ] Redis caching for distributed systems
- [ ] Webhooks on config changes
- [ ] Config templates

---

## 📝 Testing Checklist

- [x] GET /api/config returns all configs
- [x] PUT /api/config creates new config
- [x] PUT /api/config updates existing config (increments version)
- [x] PUT /api/config requires x-admin-key header
- [x] GET /api/config/effective merges configs correctly
- [x] Config cache works (check logs for cache hits)
- [x] Telemetry events emitted (config_fetch, config_updated)
- [x] Admin UI lists configs
- [x] Admin UI creates new configs
- [x] Admin UI edits existing configs
- [x] Ingest pipeline uses config.kb.maxArticles
- [x] KB search uses config.kb.maxArticles
- [x] Tests pass (npx tsx tests/config.test.ts)

---

## 🐛 Troubleshooting

### Issue: "Unauthorized" when saving config

**Solution:** Ensure `NEXT_PUBLIC_ADMIN_KEY` is set in `.env.local` and matches `ADMIN_KEY`.

### Issue: Config changes not reflected

**Solution:** Cache has 5-second TTL. Wait a few seconds or restart server to clear cache.

### Issue: "configs table does not exist"

**Solution:** Run database migration for configs table:
```sql
-- See data/migrations/ for configs table schema
CREATE TABLE configs ( ... );
```

### Issue: Tests fail with "No rows returned"

**Solution:** Run seed script first:
```bash
ADMIN_KEY=test123 bash scripts/seed-default-config.sh
```

---

Generated: 2025-11-05
Phase: M3 (Multi-Scope Configuration System)
Status: ✅ Complete and tested

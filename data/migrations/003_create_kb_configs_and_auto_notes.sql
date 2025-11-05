-- Migration 003: Create kb_configs and auto_notes tables
-- Purpose: Multi-tenant KB adapter configuration and AI-generated call notes

-- Table: kb_configs
-- Stores per-tenant KB provider configuration (DB, Knowmax, Zendesk, etc.)
CREATE TABLE IF NOT EXISTS kb_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,        -- 'db' | 'knowmax' | 'zendesk' | 'custom'
  config JSONB NOT NULL,         -- provider-specific config (API keys, baseURL, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT kb_configs_provider_check CHECK (provider IN ('db', 'knowmax', 'zendesk', 'custom'))
);

-- Unique index: one config per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_configs_tenant ON kb_configs(tenant_id);

-- Index for provider lookups
CREATE INDEX IF NOT EXISTS idx_kb_configs_provider ON kb_configs(provider);

COMMENT ON TABLE kb_configs IS 'Per-tenant knowledge base provider configurations';
COMMENT ON COLUMN kb_configs.tenant_id IS 'Unique tenant identifier';
COMMENT ON COLUMN kb_configs.provider IS 'KB provider type (db=Supabase, knowmax=Knowmax API, etc.)';
COMMENT ON COLUMN kb_configs.config IS 'Provider-specific JSON config (apiKey, baseUrl, credentials)';

-- Table: auto_notes
-- Stores AI-generated call summaries and notes
CREATE TABLE IF NOT EXISTS auto_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  note TEXT NOT NULL,
  model TEXT,                     -- LLM model used (e.g., 'gpt-4o-mini')
  prompt_version TEXT,            -- Version/template of prompt used
  confidence DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for call-based lookups
CREATE INDEX IF NOT EXISTS idx_auto_notes_call ON auto_notes(call_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_auto_notes_created_at ON auto_notes(created_at);

COMMENT ON TABLE auto_notes IS 'AI-generated call summaries and notes';
COMMENT ON COLUMN auto_notes.call_id IS 'Associated call identifier';
COMMENT ON COLUMN auto_notes.note IS 'Generated note content';
COMMENT ON COLUMN auto_notes.model IS 'LLM model used for generation';
COMMENT ON COLUMN auto_notes.prompt_version IS 'Prompt template version for reproducibility';
COMMENT ON COLUMN auto_notes.confidence IS 'Confidence score (0.0-1.0)';

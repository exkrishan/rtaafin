-- Migration 004: Create call_dispositions table
-- Purpose: Store agent-selected dispositions for calls

-- Table: call_dispositions
-- Stores disposition, sub-disposition, and notes for each call
CREATE TABLE IF NOT EXISTS call_dispositions (
  call_id TEXT PRIMARY KEY,
  interaction_id TEXT,
  disposition TEXT NOT NULL,
  sub_disposition TEXT,
  notes TEXT,
  agent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for interaction_id lookups
CREATE INDEX IF NOT EXISTS idx_call_dispositions_interaction_id ON call_dispositions(interaction_id);

-- Index for agent_id lookups
CREATE INDEX IF NOT EXISTS idx_call_dispositions_agent_id ON call_dispositions(agent_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_call_dispositions_created_at ON call_dispositions(created_at);

COMMENT ON TABLE call_dispositions IS 'Agent-selected dispositions for calls';
COMMENT ON COLUMN call_dispositions.call_id IS 'Unique call identifier (primary key)';
COMMENT ON COLUMN call_dispositions.interaction_id IS 'Interaction identifier (same as call_id for compatibility)';
COMMENT ON COLUMN call_dispositions.disposition IS 'Primary disposition code (e.g., GENERAL_INQUIRY)';
COMMENT ON COLUMN call_dispositions.sub_disposition IS 'Sub-disposition code (optional)';
COMMENT ON COLUMN call_dispositions.notes IS 'Agent notes or AI-generated notes';
COMMENT ON COLUMN call_dispositions.agent_id IS 'Agent identifier who selected the disposition';


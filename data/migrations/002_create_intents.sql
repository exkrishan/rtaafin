-- Migration: Create intents table
-- This table stores detected customer intents from transcript analysis

CREATE TABLE IF NOT EXISTS intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  intent TEXT NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure uniqueness per call and sequence
  UNIQUE(call_id, seq)
);

-- Index for faster lookups by call_id
CREATE INDEX IF NOT EXISTS idx_intents_call_id ON intents(call_id);

-- Index for ordering by sequence
CREATE INDEX IF NOT EXISTS idx_intents_call_seq ON intents(call_id, seq);

-- Index for intent-based queries
CREATE INDEX IF NOT EXISTS idx_intents_intent ON intents(intent);

-- Index for confidence filtering
CREATE INDEX IF NOT EXISTS idx_intents_confidence ON intents(confidence);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_intents_created_at ON intents(created_at);

COMMENT ON TABLE intents IS 'Stores detected customer intents from transcript chunks';
COMMENT ON COLUMN intents.call_id IS 'Unique identifier for the call';
COMMENT ON COLUMN intents.seq IS 'Sequence number of the chunk within the call';
COMMENT ON COLUMN intents.intent IS 'Detected intent label (e.g., reset_password, update_billing)';
COMMENT ON COLUMN intents.confidence IS 'Confidence score from 0.0 to 1.0';
COMMENT ON COLUMN intents.created_at IS 'When this intent was detected';

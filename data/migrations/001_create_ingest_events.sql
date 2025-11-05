-- Migration: Create ingest_events table
-- This table stores transcript chunks received during call ingestion

CREATE TABLE IF NOT EXISTS ingest_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure uniqueness per call and sequence
  UNIQUE(call_id, seq)
);

-- Index for faster lookups by call_id
CREATE INDEX IF NOT EXISTS idx_ingest_events_call_id ON ingest_events(call_id);

-- Index for ordering by sequence
CREATE INDEX IF NOT EXISTS idx_ingest_events_call_seq ON ingest_events(call_id, seq);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_ingest_events_created_at ON ingest_events(created_at);

COMMENT ON TABLE ingest_events IS 'Stores transcript chunks ingested from calls';
COMMENT ON COLUMN ingest_events.call_id IS 'Unique identifier for the call';
COMMENT ON COLUMN ingest_events.seq IS 'Sequence number of the chunk within the call';
COMMENT ON COLUMN ingest_events.ts IS 'Timestamp when the chunk was generated';
COMMENT ON COLUMN ingest_events.text IS 'Transcript text content';
COMMENT ON COLUMN ingest_events.created_at IS 'When this record was inserted';

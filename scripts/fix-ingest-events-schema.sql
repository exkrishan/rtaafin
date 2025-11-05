-- Fix ingest_events table schema
-- Run this in your Supabase SQL Editor

-- Option 1: If table doesn't exist or you can recreate it, use this:
DROP TABLE IF EXISTS ingest_events CASCADE;

CREATE TABLE ingest_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(call_id, seq)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ingest_events_call_id ON ingest_events(call_id);
CREATE INDEX IF NOT EXISTS idx_ingest_events_call_seq ON ingest_events(call_id, seq);
CREATE INDEX IF NOT EXISTS idx_ingest_events_created_at ON ingest_events(created_at);

-- Option 2: If you want to keep existing data, add missing columns:
-- (Only run this if Option 1 is not suitable)

-- ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS call_id TEXT;
-- ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS seq INTEGER;
-- ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS ts TIMESTAMPTZ;
-- ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS text TEXT;
-- ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Add unique constraint if it doesn't exist
-- ALTER TABLE ingest_events ADD CONSTRAINT ingest_events_call_seq_unique UNIQUE (call_id, seq);

COMMENT ON TABLE ingest_events IS 'Stores transcript chunks ingested from calls';
COMMENT ON COLUMN ingest_events.call_id IS 'Unique identifier for the call';
COMMENT ON COLUMN ingest_events.seq IS 'Sequence number of the chunk within the call';
COMMENT ON COLUMN ingest_events.ts IS 'Timestamp when the chunk was generated';
COMMENT ON COLUMN ingest_events.text IS 'Transcript text content';
COMMENT ON COLUMN ingest_events.created_at IS 'When this record was inserted';


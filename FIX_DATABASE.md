# Fix Database Schema Issue

## Problem
Error: `column ingest_events.seq does not exist` or `column ingest_events.text does not exist`

This means the `ingest_events` table has a different structure than expected.

## Solution

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Create a new query

### Step 2: Run the Fix SQL

Copy and paste this SQL into the editor and run it:

```sql
-- Drop and recreate table (if you don't have important data)
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
```

### Step 3: Verify

Run this query to verify the table structure:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'ingest_events' 
ORDER BY ordinal_position;
```

You should see:
- `id` (uuid)
- `call_id` (text)
- `seq` (integer)
- `ts` (timestamp with time zone)
- `text` (text)
- `created_at` (timestamp with time zone)

### Step 4: Test the Demo Again

1. Refresh http://localhost:3000/demo
2. Click "▶ Start Call"
3. Wait for transcript to finish
4. Click "📝 Dispose Call"
5. Disposition modal should open successfully!

## Alternative: If You Have Existing Data

If you have data you want to keep, check what columns exist first:

```sql
SELECT * FROM ingest_events LIMIT 1;
```

Then add only the missing columns:

```sql
-- Add missing columns (adjust column names if your table uses different names)
ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS call_id TEXT;
ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS seq INTEGER;
ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS ts TIMESTAMPTZ;
ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
```

## Quick Reference

The file `scripts/fix-ingest-events-schema.sql` contains the complete fix SQL.


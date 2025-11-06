# Fix: "TypeError: fetch failed" Error

## Problem
The `/api/dispositions` endpoint is failing with `TypeError: fetch failed`. This is a **Supabase connection issue**, not a database schema issue.

## Root Cause
The error occurs at the network/fetch level when trying to connect to Supabase. This is typically caused by:

1. **TLS/SSL Certificate Issue** - Most common for local development
2. **Network Connectivity** - Firewall or proxy blocking Supabase
3. **Missing Environment Variables** - Supabase URL or key not configured

## Solutions

### Solution 1: Check TLS Certificate (Most Common)

Run the diagnostic script:
```bash
node scripts/check-certs.js <your-supabase-url>
```

If you see certificate errors, add to `.env.local`:
```bash
ALLOW_INSECURE_TLS=true
```

**⚠️ WARNING:** Only use this for local development. Never commit this to git or use in production.

### Solution 2: Verify Environment Variables

Check that these are set in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Verify they're loaded:
```bash
curl http://localhost:3000/api/debug/env
```

### Solution 3: Test Supabase Connection Directly

Test if Supabase is accessible:
```bash
# Replace with your actual Supabase URL
curl -v https://your-project.supabase.co/rest/v1/
```

### Solution 4: Check Server Logs

Look at the Next.js server console for detailed error messages. The error should show:
- TLS certificate errors
- Network timeouts
- Connection refused errors

## Quick Fix for Testing

If you need to test immediately and the view doesn't exist yet:

1. **Create the view in Supabase SQL Editor:**
```sql
-- Check if view exists
SELECT * FROM disposition_taxonomy LIMIT 1;

-- If it doesn't exist, create it (from your schema update)
CREATE VIEW disposition_taxonomy AS
SELECT
  p.id AS parent_id,
  p.code AS parent_code,
  p.label AS parent_label,
  p.category AS parent_category,
  COALESCE(
    ARRAY_AGG(
      json_build_object('id', c.id, 'code', c.code, 'label', c.label) ORDER BY c.id
    ) FILTER (WHERE c.id IS NOT NULL),
    ARRAY[]::json[]
  ) AS sub_dispositions
FROM public.dispositions_master p
LEFT JOIN public.dispositions_master c ON c.parent_disposition_id = p.id
WHERE p.parent_disposition_id IS NULL
GROUP BY p.id, p.code, p.label, p.category
ORDER BY p.id;
```

2. **Or use the fallback** - The API will automatically fallback to `dispositions_master` table if the view doesn't exist (once the connection issue is fixed).

## Verify Fix

After fixing, test the endpoint:
```bash
curl http://localhost:3000/api/dispositions | jq
```

You should see either:
- ✅ Data from `disposition_taxonomy` view
- ✅ Data from `dispositions_master` table (with warning message)

## Next Steps

Once the connection is fixed:
1. Verify the view exists in Supabase
2. Test the API endpoint
3. Test sub-dispositions endpoint
4. Test full flow in the UI


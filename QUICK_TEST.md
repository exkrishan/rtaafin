# Quick Testing Guide

## Setup (First Time Only)

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Set up environment variables** (create `.env.local`):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   LLM_API_URL=http://your-llm-endpoint  # Optional
   ```

## Testing Steps

### 1. Start the Dev Server

```bash
npm run dev
```

Wait for: `✓ Ready in X.Xs` message

### 2. Test API Endpoints (Terminal)

Open a **new terminal window** and run:

```bash
# Test KB Search
curl "http://localhost:3000/api/kb/search?q=test&tenantId=default" | jq .

# Test Auto Notes
curl -X POST http://localhost:3000/api/calls/auto_notes \
  -H "Content-Type: application/json" \
  -d '{"callId":"test-123","tenantId":"default","author":"agent-ui","notes":"Test","dispositions":[{"code":"GENERAL_INQUIRY","title":"General Inquiry","score":0.45}],"confidence":0.45,"raw_llm_output":null}' | jq .

# Or use the smoke test
npx tsx tests/ui-kb-smoke.ts
```

### 3. Test UI Components (Browser)

1. **Open test page**: http://localhost:3000/test-agent-assist
2. **You should see**:
   - Transcript Panel (left) - connects to SSE, shows transcript lines
   - KB Suggestions (right) - searchable knowledge base
3. **Try**:
   - Type in KB search box → should debounce and search
   - Click "Copy URL", "Like", "Dislike", "Open" buttons
   - If a call ends, disposition modal should auto-open

### 4. Test with Real Call Data

If you have transcript data:

```bash
# Generate a summary (this will populate auto_notes)
curl -X POST http://localhost:3000/api/calls/summary \
  -H "Content-Type: application/json" \
  -d '{"callId":"your-call-id","tenantId":"default"}'
```

Then refresh the test page and see the summary appear.

## Troubleshooting

### "next: command not found"
- Run: `npm install`

### "Cannot connect to localhost:3000"
- Check server is running: `lsof -ti:3000`
- Check console for errors

### API returns errors
- Check `.env.local` has correct Supabase credentials
- Check database tables exist (run migrations)
- Check browser console for client-side errors

### KB Search returns empty
- Verify `kb_articles` table has data
- Check `kb_configs` table has config for your tenant

## Expected Results

✅ **KB Search**: Returns array of articles
✅ **Auto Notes**: Returns `{"ok": true, "id": "...", ...}`
✅ **UI Components**: Render without errors
✅ **SSE Connection**: Shows "Live" status in transcript panel

## Next Steps

Once basic tests pass:
1. Integrate into your main app
2. Connect to real call data
3. Customize styling
4. Add error boundaries


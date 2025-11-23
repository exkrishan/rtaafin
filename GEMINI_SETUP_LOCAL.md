# 🔧 Gemini LLM Setup for Local Development

## Issue
KB suggestions and disposition are not working on `/demo` page because Gemini LLM API key is not configured.

## Quick Fix

### Step 1: Get Gemini API Key
1. Go to: https://aistudio.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key (starts with `AIza...`)

### Step 2: Create `.env.local` File
Create a file named `.env.local` in the project root (`/Users/kirti.krishnan/Desktop/Projects/rtaafin/.env.local`):

```bash
# LLM Configuration (REQUIRED for KB suggestions and disposition)
LLM_API_KEY=AIzaSy...your-gemini-api-key-here...
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash
```

### Step 3: Restart Dev Server
```bash
# Stop your current dev server (Ctrl+C)
# Then restart:
npm run dev
```

### Step 4: Verify Setup
Run the diagnostic script:
```bash
npx tsx scripts/debug-gemini-local.ts
```

You should see:
- ✅ LLM_API_KEY: Set
- ✅ Intent Detection: Working
- ✅ KB Search: Working
- ✅ Summary Generation: Working

## What This Fixes

1. **KB Suggestions**: Intent detection will work, triggering KB article recommendations
2. **Disposition**: Call summary generation will work, providing disposition suggestions
3. **Intent Detection**: Transcripts will be analyzed for customer intent

## Testing

After setup, test on `/demo` page:
1. Go to: http://localhost:3000/demo
2. Click "Start Call"
3. Watch for:
   - KB articles appearing in the right panel
   - Intent being detected from transcript
   - Disposition working when call ends

## Troubleshooting

### If still not working:

1. **Check environment variables are loaded:**
   ```bash
   npx tsx scripts/debug-gemini-local.ts
   ```

2. **Check server logs:**
   - Look for `[intent]` logs in terminal
   - Check for API errors

3. **Verify API key:**
   - Make sure the key starts with `AIza`
   - Check it's not expired or revoked

4. **Check `.env.local` location:**
   - Must be in project root (same directory as `package.json`)
   - File name must be exactly `.env.local` (not `.env` or `.env.local.txt`)

## Alternative: Use Existing .env File

If you already have a `.env` file, you can add these variables there instead:
```bash
# Add to existing .env file
LLM_API_KEY=AIzaSy...
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash
```

**Note:** `.env.local` takes precedence over `.env`, so use `.env.local` for local development.


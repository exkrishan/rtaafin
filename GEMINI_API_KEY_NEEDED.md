# ⚠️ Gemini API Key Required

## Configuration Updated
Your `.env.local` has been updated to use Gemini:
```bash
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash
```

## ⚠️ Action Required: Get Gemini API Key

Your current `LLM_API_KEY` is an **OpenAI key** (`sk-proj-...`), but you need a **Gemini API key** (`AIza...`).

### Steps to Get Gemini API Key:

1. **Go to Google AI Studio:**
   - Visit: https://aistudio.google.com/app/apikey
   - Sign in with your Google account

2. **Create API Key:**
   - Click "Create API Key" button
   - Select or create a Google Cloud project
   - Copy the API key (starts with `AIza...`)

3. **Update `.env.local`:**
   ```bash
   LLM_API_KEY=AIzaSy...your-gemini-api-key-here...
   LLM_PROVIDER=gemini
   GEMINI_MODEL=gemini-2.0-flash
   ```

4. **Restart Dev Server:**
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

## Current Status

- ✅ `LLM_PROVIDER=gemini` (configured)
- ✅ `GEMINI_MODEL=gemini-2.0-flash` (configured)
- ❌ `LLM_API_KEY` needs to be updated to Gemini key

## After Adding Gemini Key

Once you add the Gemini API key and restart:
- ✅ Intent detection will use Gemini
- ✅ KB suggestions will work
- ✅ Disposition will work
- ✅ All LLM operations will use Gemini

## Quick Test

After updating the key, test with:
```bash
npx tsx scripts/debug-gemini-local.ts
```


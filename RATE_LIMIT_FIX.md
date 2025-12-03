# ⚠️ OpenAI Rate Limit Issue - KB Suggestions Not Working

## Problem Identified

Your OpenAI API key has hit its **daily rate limit**:
- **Limit:** 200 requests per day (RPD)
- **Status:** Used 200, Requested 1
- **Wait Time:** ~7 minutes

**Result:** Intent detection is failing, which prevents KB articles from being fetched.

## Why KB Suggestions Aren't Working

1. Intent detection calls OpenAI API → **Rate limit error**
2. Intent detection returns `{ intent: 'unknown', confidence: 0 }`
3. Code only fetches KB articles if `intent !== 'unknown'` (line 246 in `ingest-transcript/route.ts`)
4. No KB articles are returned → No suggestions appear

## Solutions

### Option 1: Wait for Rate Limit Reset (Quick Fix)
- Wait ~7 minutes for the rate limit to reset
- Then restart your dev server and test again

### Option 2: Use a Different OpenAI API Key (Recommended)
1. Get a new OpenAI API key from: https://platform.openai.com/api-keys
2. Update `.env.local`:
   ```bash
   LLM_API_KEY=sk-...your-new-key...
   ```
3. Restart dev server

### Option 3: Switch to Gemini (Best for Development)
1. Get a Gemini API key from: https://aistudio.google.com/app/apikey
2. Update `.env.local`:
   ```bash
   LLM_API_KEY=AIzaSy...your-gemini-key...
   LLM_PROVIDER=gemini
   GEMINI_MODEL=gemini-2.0-flash
   ```
3. Restart dev server

**Benefits of Gemini:**
- Higher free tier limits
- Faster responses
- Better for development/testing

## Current Status

- ✅ Configuration: Correct (`LLM_PROVIDER=openai`)
- ✅ API Key: Set (but rate limited)
- ❌ Intent Detection: Failing (rate limit)
- ❌ KB Suggestions: Not appearing (blocked by intent detection failure)

## After Fixing

Once the rate limit issue is resolved:
1. Intent detection will work
2. KB articles will be fetched automatically
3. KB suggestions will appear in the demo page

## Improved Error Handling

I've added better error logging so rate limit errors are now clearly visible in server logs:
- Look for: `[intent] ❌ OpenAI API Rate Limit Exceeded`
- This will help identify the issue faster in the future


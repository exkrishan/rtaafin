# ✅ KB Suggestions Fix Applied

## Issue Found

The server was using `LLM_API_KEY` (OpenAI key) instead of `GEMINI_API_KEY` (Gemini key) because:
- Code checked: `LLM_API_KEY || GEMINI_API_KEY`
- Since `LLM_API_KEY` exists, it was used first
- But `LLM_PROVIDER=gemini`, so it tried to use OpenAI key with Gemini API → Failed

## Fix Applied

Updated `lib/intent.ts` and `lib/summary.ts` to:
- **Prefer `GEMINI_API_KEY` when `LLM_PROVIDER=gemini`**
- Fall back to `LLM_API_KEY` if `GEMINI_API_KEY` is not set
- This ensures the correct API key is used for each provider

## Current Configuration

Your `.env.local`:
```bash
GEMINI_API_KEY=AIzaSyDaQ1g7FYjKeBVUOtCchQByNNDIV9appY4
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash
LLM_API_KEY=sk-proj-... (OpenAI key - will be ignored when using Gemini)
```

## ⚠️ CRITICAL: Restart Required

**You MUST restart your dev server for the changes to take effect:**

```bash
# Stop current server (Ctrl+C in terminal)
npm run dev
```

## After Restart

1. **Intent detection will use Gemini API** (with your Gemini key)
2. **KB articles will be fetched** when intent is detected
3. **KB suggestions will appear** in the demo page

## Test After Restart

1. Go to: http://localhost:3000/demo
2. Click "Start Call"
3. Check browser console for:
   - `[intent] Calling Google Gemini API`
   - `[intent] Detected intent: credit_card_fraud` (or similar)
   - `[Demo] ✅ Received KB/intent response: { articlesCount: X }`
4. Verify KB articles appear in the right panel

## What Changed

**Before:**
- Used `LLM_API_KEY` (OpenAI key) even when `LLM_PROVIDER=gemini`
- Gemini API calls failed → Intent detection failed → No KB articles

**After:**
- Uses `GEMINI_API_KEY` when `LLM_PROVIDER=gemini`
- Gemini API calls succeed → Intent detection works → KB articles fetched


# 🔑 Gemini API Key Setup

## Issue
Your current Gemini API key is **LEAKED/INVALID** (403 error from Google).

## Solution: Get a New API Key

### Steps:
1. **Go to Google AI Studio**: https://aistudio.google.com/app/apikey
2. **Sign in** with your Google account
3. **Click "Create API Key"** button
4. **Copy the new API key** (it will start with `AIzaSy...`)
5. **Share the new key** and I'll update your `.env.local` file

### After Getting the New Key:
1. I'll update `.env.local` with the new key
2. **Restart your dev server** (Ctrl+C, then `npm run dev`)
3. KB suggestions and disposition will start working!

### Current Configuration:
- `LLM_PROVIDER=gemini` ✅ (correct)
- `GEMINI_MODEL=gemini-2.0-flash` ✅ (correct)
- `GEMINI_API_KEY=AIzaSy...` ❌ (LEAKED - needs replacement)

### Why the Key is Leaked:
Google detected that this API key was exposed publicly (possibly in a GitHub commit, log file, or screenshot). For security, they've disabled it. This is why you're getting 403 errors.

### Security Best Practice:
- Never commit API keys to Git
- Use `.env.local` (already in `.gitignore`) ✅
- Rotate keys if they're ever exposed


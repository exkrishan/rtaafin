# 🚀 Gemini Setup Instructions

## Step 1: Get Gemini API Key

1. **Go to Google AI Studio:**
   - Visit: https://aistudio.google.com/app/apikey
   - Sign in with your Google account

2. **Create API Key:**
   - Click **"Create API Key"** button
   - Select or create a Google Cloud project (or use default)
   - Copy the API key (starts with `AIza...`)

## Step 2: Update .env.local

Open `.env.local` and update the `GEMINI_API_KEY` line:

```bash
GEMINI_API_KEY=AIzaSy...your-actual-gemini-key-here...
```

**OR** if you want to use it as `LLM_API_KEY` instead:

```bash
LLM_API_KEY=AIzaSy...your-actual-gemini-key-here...
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash
```

## Step 3: Restart Dev Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

## Step 4: Test

1. Go to: http://localhost:3000/demo
2. Click "Start Call"
3. Verify KB suggestions appear
4. Verify disposition works

## Benefits of Gemini

- ✅ Higher free tier limits (60 requests/minute)
- ✅ Faster responses
- ✅ Better for development/testing
- ✅ No rate limit issues (unlike OpenAI free tier)

## Current Configuration

Your `.env.local` is already set to:
- `LLM_PROVIDER=gemini`
- `GEMINI_MODEL=gemini-2.0-flash`

**Just add your Gemini API key and restart!**


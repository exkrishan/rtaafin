# 🔐 ElevenLabs Authentication Troubleshooting Guide

## Current Error

```
[ElevenLabsProvider] ❌ Authentication error: {
  message_type: 'auth_error',
  error: 'You must be authenticated to use this endpoint.'
}
```

**Status:** WebSocket opens ✅, but authentication fails ❌

---

## Root Cause Analysis

### What's Working:
- ✅ `Scribe.connect()` succeeds - SDK connection object created
- ✅ WebSocket connection opens - Network connection established
- ✅ API key format is correct (`sk_eed7ad5...`)

### What's Failing:
- ❌ Authentication during session start - API key rejected by ElevenLabs
- ❌ Session never starts - Connection closes after auth failure

---

## Most Likely Causes (In Order of Probability)

### 1. **API Key Missing Speech-to-Text Permissions** ⚠️ **MOST LIKELY**

**Problem:** The API key doesn't have Speech-to-Text (STT) permissions enabled.

**Solution:**
1. Go to [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
2. Find your API key (starts with `sk_eed7ad5...`)
3. Click on the key to view/edit
4. **Enable "Speech-to-Text" permissions**
5. Save changes
6. **OR** Create a new API key with STT permissions enabled

**How to Verify:**
- In the API key settings, you should see permissions checkboxes
- Ensure "Speech-to-Text" or "Scribe" is checked
- If you only see "Text-to-Speech" or "Agents Platform", that's the problem

---

### 2. **API Key is Invalid or Expired**

**Problem:** The API key has been revoked, expired, or is incorrect.

**Solution:**
1. Verify the API key in ElevenLabs Dashboard
2. Check if the key is still active (not deleted/revoked)
3. Create a new API key if needed
4. Update `ELEVENLABS_API_KEY` in Render environment variables

**How to Verify:**
- Check the key status in the dashboard
- Look for "Active", "Expired", or "Revoked" status
- Try creating a new key and testing with that

---

### 3. **API Key Format Issue**

**Problem:** The API key has extra spaces, newlines, or is truncated.

**Solution:**
1. In Render Dashboard → Environment Variables
2. Check `ELEVENLABS_API_KEY` value:
   - No leading/trailing spaces
   - No newlines
   - Complete key (not truncated)
   - Starts with `sk_` and is the full length

**How to Verify:**
- Copy the key from ElevenLabs dashboard
- Paste directly into Render (no editing)
- Ensure it's exactly as shown in dashboard

---

### 4. **API Key is for Wrong Product**

**Problem:** The API key might be for Agents Platform but not for Scribe/STT.

**Solution:**
- ElevenLabs has different products:
  - **Text-to-Speech (TTS)** - Different API
  - **Speech-to-Text (STT/Scribe)** - What we need
  - **Agents Platform** - Different API
- Ensure your key has **Speech-to-Text** access

---

## SDK Authentication Method

### Current Implementation (Correct)

We're using the SDK correctly:

```typescript
connection = Scribe.connect({
  token: this.apiKey,  // ✅ Correct parameter name
  modelId: this.model,
  // ... other config
});
```

The SDK internally handles:
- Converting `token` to `xi-api-key` header
- WebSocket authentication handshake
- Session initialization

**You don't need to manually set headers** - the SDK does this.

---

## Verification Steps

### Step 1: Check API Key Permissions

1. Log into [ElevenLabs Dashboard](https://elevenlabs.io/app/settings/api-keys)
2. Find your API key
3. Verify it has **Speech-to-Text** permissions enabled
4. If not, enable it or create a new key

### Step 2: Verify API Key in Render

1. Go to Render Dashboard → `asr11labs` service
2. Environment tab
3. Check `ELEVENLABS_API_KEY`:
   - Value matches dashboard exactly
   - No extra spaces
   - Complete key (full length)

### Step 3: Test API Key with Simple Request

You can test if the API key works with a simple HTTP request:

```bash
curl 'https://api.elevenlabs.io/v1/models' \
  -H 'Content-Type: application/json' \
  -H 'xi-api-key: sk_eed7ad5...'
```

**Expected:** Should return list of models  
**If fails:** API key is invalid or lacks permissions

### Step 4: Create New API Key (If Needed)

1. Go to ElevenLabs Dashboard → API Keys
2. Click "Create API Key"
3. **Enable "Speech-to-Text" permissions** ⚠️ **CRITICAL**
4. Copy the new key
5. Update `ELEVENLABS_API_KEY` in Render
6. Redeploy service

---

## Common Mistakes

### ❌ Wrong: Using Key ID Instead of API Key
- Key ID is just an identifier
- You need the full API key (`sk_...`)

### ❌ Wrong: API Key Without STT Permissions
- TTS-only keys won't work
- Agents Platform keys won't work
- Need STT/Scribe permissions

### ❌ Wrong: Truncated or Modified API Key
- Must use complete key
- No spaces or newlines
- Copy exactly from dashboard

### ❌ Wrong: Trying to Set Headers Manually
- SDK handles authentication
- Don't try to set `xi-api-key` header manually
- Use `token` parameter in `Scribe.connect()`

---

## Expected Logs After Fix

Once the API key has correct permissions, you should see:

```
[ElevenLabsProvider] 🔌 Attempting to connect to ElevenLabs
[ElevenLabsProvider] ✅ Scribe.connect() succeeded
[ElevenLabsProvider] ✅ Connection opened
[ElevenLabsProvider] ✅ WebSocket connection opened
[ElevenLabsProvider] ✅ Session started  ← This should appear now!
[ElevenLabsProvider] ✅ Session started successfully
[ElevenLabsProvider] Connection ready
```

**Instead of:**
```
[ElevenLabsProvider] ❌ Authentication error  ← This should disappear
```

---

## Quick Fix Checklist

- [ ] API key has **Speech-to-Text** permissions enabled
- [ ] API key is active (not expired/revoked)
- [ ] `ELEVENLABS_API_KEY` in Render matches dashboard exactly
- [ ] No extra spaces or newlines in API key
- [ ] API key is complete (not truncated)
- [ ] Service redeployed after updating API key

---

## Still Not Working?

If you've verified all of the above and it still fails:

1. **Create a brand new API key** with STT permissions
2. **Test with curl** to verify the key works
3. **Check ElevenLabs status page** for service issues
4. **Contact ElevenLabs support** with:
   - API key prefix (first 10 chars)
   - Error message
   - Request to verify STT permissions

---

## Summary

**Most Likely Issue:** API key doesn't have Speech-to-Text permissions.

**Quick Fix:**
1. Go to ElevenLabs Dashboard
2. Enable STT permissions on your key (or create new key)
3. Update `ELEVENLABS_API_KEY` in Render
4. Redeploy service

The SDK implementation is correct - the issue is with the API key permissions.


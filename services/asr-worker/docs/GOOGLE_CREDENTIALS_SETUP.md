# Google Cloud Speech-to-Text Credentials Setup

## Critical Requirements

The Google Cloud Speech-to-Text API requires **proper service account configuration** with specific IAM roles and API enablement.

## Required Setup Steps

### 1. Enable Speech-to-Text API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: `gen-lang-client-0415704882`
3. Navigate to **APIs & Services** > **Library**
4. Search for "**Cloud Speech-to-Text API**"
5. Click on it and click **Enable**
6. Wait for API to be enabled (usually takes a few seconds)

### 2. Verify Service Account Permissions

Your service account (`rtaa-250@gen-lang-client-0415704882.iam.gserviceaccount.com`) needs the following IAM role:

**Required Role:**
- **Cloud Speech-to-Text API User** (`roles/speech.client`)

**To add the role:**
1. Go to **IAM & Admin** > **IAM**
2. Find your service account: `rtaa-250@gen-lang-client-0415704882.iam.gserviceaccount.com`
3. Click the **pencil icon** (Edit)
4. Click **Add Another Role**
5. Select **Cloud Speech-to-Text API User**
6. Click **Save**

**Alternative (for testing only):**
- **Owner** role (has all permissions, but less secure)

### 3. Enable Billing

**IMPORTANT:** Even for the free tier (60 minutes/month), billing must be enabled:

1. Go to **Billing** in Google Cloud Console
2. Link a billing account to your project
3. Note: You won't be charged for the first 60 minutes/month

### 4. Verify Credentials File

Your service account JSON file should have:
- ✅ Valid JSON structure
- ✅ `project_id` field
- ✅ `client_email` field
- ✅ `private_key` field
- ✅ File is readable

**Current file:** `/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json`

### 5. Set Environment Variable

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json"
```

## Common Error Codes and Solutions

### Error Code 7: PERMISSION_DENIED
**Cause:** Service account doesn't have required IAM role
**Solution:** Add "Cloud Speech-to-Text API User" role to service account

### Error Code 5: NOT_FOUND
**Cause:** Speech-to-Text API is not enabled
**Solution:** Enable the API in APIs & Services > Library

### Error Code 3: INVALID_ARGUMENT (including "Malordered Data")
**Possible causes:**
1. API not enabled
2. Billing not enabled
3. Service account lacks permissions
4. Request format issue (less likely if following docs)

**Solution:** Check API enablement, billing, and IAM roles first

## Verification Commands

Test your setup:
```bash
cd services/asr-worker
GOOGLE_APPLICATION_CREDENTIALS="/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json" \
npx ts-node scripts/test-google-auth-check.ts
```

## Quick Checklist

- [ ] Speech-to-Text API is enabled
- [ ] Service account has "Cloud Speech-to-Text API User" role
- [ ] Project has billing enabled
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` environment variable is set
- [ ] Service account JSON file is valid and readable

## References

- [Google Cloud Speech-to-Text Authentication](https://cloud.google.com/speech-to-text/docs/authentication)
- [IAM Roles for Speech-to-Text](https://cloud.google.com/speech-to-text/docs/iam)
- [API Enablement Guide](https://cloud.google.com/apis/docs/getting-started)





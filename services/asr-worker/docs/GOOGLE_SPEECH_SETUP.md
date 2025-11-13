# Google Cloud Speech-to-Text Setup Guide

## Overview

This guide covers setting up Google Cloud Speech-to-Text API for use with the ASR Worker service.

## Prerequisites

1. **Google Cloud Account**: You need a Google Cloud account
2. **Billing Enabled**: Speech-to-Text API requires billing (but has free tier)
3. **Project Created**: A Google Cloud project

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" or select existing project
3. Note your Project ID (you'll need this later)

## Step 2: Enable Speech-to-Text API

1. In Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Cloud Speech-to-Text API"
3. Click on it and click **Enable**
4. Wait for API to be enabled (usually takes a few seconds)

## Step 3: Create Service Account

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Enter name: `asr-worker-service`
4. Click **Create and Continue**
5. Grant role: **Cloud Speech-to-Text API User**
6. Click **Continue** then **Done**

## Step 4: Create Service Account Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** > **Create new key**
4. Select **JSON** format
5. Click **Create** - this downloads the key file
6. **Save this file securely** - you'll need it for authentication

## Step 5: Set Up Authentication

### Option A: Service Account Key File (Recommended for Local Testing)

Set environment variable:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
```

### Option B: Application Default Credentials (For GCP Environments)

If running on Google Cloud (Compute Engine, Cloud Run, etc.):
```bash
gcloud auth application-default login
```

## Step 6: Verify Setup

Test authentication:
```bash
# Check if credentials are set
echo $GOOGLE_APPLICATION_CREDENTIALS

# Test with gcloud (optional)
gcloud auth application-default print-access-token
```

## Environment Variables

Add these to your `.env` file or environment:

```bash
# Required
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Optional
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_SPEECH_LOCATION=us  # or us-central1, europe-west1, etc.
GOOGLE_SPEECH_MODEL=latest_long  # or latest_short, chirp_3, etc.
GOOGLE_SPEECH_LANGUAGE_CODE=en-US
```

## Audio Format Requirements

Google Speech-to-Text supports:

**Encoding:**
- `LINEAR16` (PCM16) - **Recommended for our use case**
- `MULAW`
- `ALAW`
- `FLAC`
- `OGG_OPUS`

**Sample Rates:**
- 8000 Hz (telephony quality) - **Matches our current setup**
- 16000 Hz (standard quality)
- 44100 Hz (CD quality)
- 48000 Hz (professional quality)

**Channels:**
- Mono (1 channel) - **Our current setup**
- Stereo (2 channels)

**Byte Order:**
- Little-endian (standard for PCM16)

## Streaming vs Batch Recognition

### Streaming Recognition (What We Use)
- Real-time transcription
- Sends audio chunks continuously
- Receives partial and final results
- Best for live audio streams
- **5-minute limit per stream** (then need to restart)

### Batch Recognition
- Processes complete audio files
- Returns results after processing
- Better for pre-recorded audio
- No time limit

## Pricing

**Free Tier:**
- First **60 minutes** of audio per month are free

**After Free Tier:**
- Standard models: **$0.016 per minute**
- Enhanced models: **$0.024 per minute**
- Chirp models: **$0.016 per minute**

**Note:** Pricing is based on audio duration, not number of requests.

## API Limits

- **Streaming duration:** 5 minutes per stream (then restart)
- **Rate limits:** Varies by project tier
- **Concurrent streams:** Depends on quota

## Troubleshooting

### Authentication Errors

**Error:** `Could not load the default credentials`

**Solution:**
- Check `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
- Verify the JSON key file exists and is readable
- Ensure service account has Speech-to-Text API permissions

### API Not Enabled

**Error:** `API not enabled`

**Solution:**
- Go to APIs & Services > Library
- Search for "Cloud Speech-to-Text API"
- Click Enable

### Billing Not Enabled

**Error:** `Billing account required`

**Solution:**
- Go to Billing in Google Cloud Console
- Link a billing account to your project
- Note: Free tier still requires billing account (won't charge for first 60 min/month)

## Next Steps

1. Run the standalone test: `scripts/test-google-speech-local.ts`
2. Test with ASR worker: Set `ASR_PROVIDER=google`
3. Monitor usage in Google Cloud Console

## References

- [Google Cloud Speech-to-Text Documentation](https://cloud.google.com/speech-to-text/docs)
- [Streaming Recognition Guide](https://cloud.google.com/speech-to-text/docs/streaming-recognize)
- [Node.js Client Library](https://cloud.google.com/nodejs/docs/reference/speech/latest)
- [Pricing Information](https://cloud.google.com/speech-to-text/pricing)




# Google Cloud Speech-to-Text Troubleshooting Guide

## "Malordered Data Received" Error - Complete Fix Guide

### Error Message
```
ApiError: Malordered Data Received. Expected audio_content none was set. Send exactly one config, followed by audio data.
Code: 3 (INVALID_ARGUMENT)
```

### Root Cause Analysis

This error typically indicates one of the following issues:

1. **Speech-to-Text API Not Enabled** (Most Common)
2. **Service Account Missing IAM Role**
3. **Billing Not Linked** (Even for free tier)
4. **SDK Version Issue** (Less likely)

### Step-by-Step Fix

#### Step 1: Verify API is Enabled

1. Go to: https://console.cloud.google.com/apis/library/speech.googleapis.com?project=gen-lang-client-0415704882
2. Check if "Cloud Speech-to-Text API" shows as **Enabled**
3. If not enabled:
   - Click **Enable**
   - Wait for enablement to complete (usually 10-30 seconds)

#### Step 2: Verify Service Account Permissions

1. Go to: https://console.cloud.google.com/iam-admin/iam?project=gen-lang-client-0415704882
2. Find service account: `rtaa-250@gen-lang-client-0415704882.iam.gserviceaccount.com`
3. Check if it has the role: **Cloud Speech-to-Text API User** (`roles/speech.client`)
4. If missing:
   - Click the **pencil icon** (Edit)
   - Click **Add Another Role**
   - Select **Cloud Speech-to-Text API User**
   - Click **Save**

#### Step 3: Verify Billing is Linked

1. Go to: https://console.cloud.google.com/billing?project=gen-lang-client-0415704882
2. Verify a billing account is linked to the project
3. If not linked, follow the billing linking guide

#### Step 4: Test Again

After completing all steps above, test again:

```bash
cd services/asr-worker
GOOGLE_APPLICATION_CREDENTIALS="/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json" \
GOOGLE_CLOUD_PROJECT_ID="gen-lang-client-0415704882" \
npx ts-node scripts/test-google-api-enabled.ts
```

### Quick Verification Checklist

- [ ] Speech-to-Text API is **Enabled** (not just visible, but actually enabled)
- [ ] Service account has **"Cloud Speech-to-Text API User"** role
- [ ] Billing account is **linked** to project
- [ ] Project ID is correct: `gen-lang-client-0415704882`
- [ ] Service account email: `rtaa-250@gen-lang-client-0415704882.iam.gserviceaccount.com`

### Why This Error is Misleading

The error message "Malordered Data Received" suggests a request format issue, but **Code 3 (INVALID_ARGUMENT)** with this message often indicates:
- API not enabled
- Missing permissions
- Billing not configured

The API returns this generic error even when the real issue is configuration-related.

### If Error Persists After All Steps

If you've verified all the above and the error still occurs:

1. **Check API Quotas**: Go to APIs & Services > Dashboard > Speech-to-Text API > Quotas
2. **Try Different Region**: Some regions may have different requirements
3. **Check Service Account Status**: Ensure it's not disabled
4. **Wait a Few Minutes**: API enablement can take time to propagate

### Direct Links for Your Project

- **API Library**: https://console.cloud.google.com/apis/library?project=gen-lang-client-0415704882
- **IAM & Admin**: https://console.cloud.google.com/iam-admin/iam?project=gen-lang-client-0415704882
- **Billing**: https://console.cloud.google.com/billing?project=gen-lang-client-0415704882
- **API Dashboard**: https://console.cloud.google.com/apis/dashboard?project=gen-lang-client-0415704882

### Next Steps

Once the error is resolved, you should see:
- ✅ No error messages
- ✅ Data events received from the API
- ✅ Transcripts being generated

If you continue to see the error after verifying all steps, there may be a deeper SDK or API issue that requires Google Cloud support.





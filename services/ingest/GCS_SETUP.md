# 🪣 Google Cloud Storage Setup for Audio Dumps

**Much simpler than Google Drive!** No sharing permissions needed - just create a bucket and give the service account access.

## Why GCS Instead of Drive?

✅ **No sharing needed** - Service account can directly upload  
✅ **Simpler permissions** - Just Storage Object Creator role  
✅ **Better for automation** - Designed for programmatic access  
✅ **Easier to access** - View files in Cloud Console or via API  

---

## Step 1: Create GCS Bucket

1. **Go to Google Cloud Console:** https://console.cloud.google.com
2. **Select project:** `gen-lang-client-0415704882`
3. **Navigate to:** Cloud Storage → Buckets
4. **Click "Create Bucket"**
5. **Configure:**
   - **Name:** `audiodumps` (or any name you want)
   - **Location:** Choose closest to you (e.g., `us-central1`)
   - **Storage class:** Standard (default)
   - **Access control:** Uniform (recommended)
   - **Protection:** Your choice (can enable versioning later)
6. **Click "Create"**

---

## Step 2: Grant Service Account Permissions

1. **In the bucket you just created, click on it**
2. **Go to "Permissions" tab**
3. **Click "Grant Access"**
4. **Add principal:**
   - **Email:** `audio-dump-uploader@gen-lang-client-0415704882.iam.gserviceaccount.com`
   - **Role:** `Storage Object Creator` (can upload files)
   - Or `Storage Object Admin` (can upload, delete, manage)
5. **Click "Save"**

That's it! No folder sharing, no Drive API complexity.

---

## Step 3: Configure Environment Variables

### For Render Deployment:

1. **Go to Render Dashboard → Your Ingest Service → Environment**
2. **Add these variables:**

| Key | Value | Description |
|-----|-------|-------------|
| `GCS_ENABLED` | `true` | Enable GCS uploads |
| `GCS_BUCKET_NAME` | `audiodumps` | Your bucket name |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | `{...your JSON...}` | Service account JSON (same as before) |

**Note:** You can keep `GOOGLE_DRIVE_ENABLED=false` or remove it - we're using GCS now.

---

## Step 4: Deploy

Render will auto-deploy. After deployment, files will upload to:
```
gs://audiodumps/audio-dumps/{interaction_id}/chunk-XXXXXX.wav
```

---

## How to Access Files

### Option 1: Google Cloud Console

1. Go to: https://console.cloud.google.com/storage/browser
2. Select your bucket: `audiodumps`
3. Navigate to: `audio-dumps/{interaction_id}/`
4. Download files directly

### Option 2: Public URLs (if you make bucket public)

Files will be accessible at:
```
https://storage.googleapis.com/audiodumps/audio-dumps/{interaction_id}/chunk-XXXXXX.wav
```

### Option 3: gsutil Command Line

```bash
# List files for a call
gsutil ls gs://audiodumps/audio-dumps/{interaction_id}/

# Download a file
gsutil cp gs://audiodumps/audio-dumps/{interaction_id}/chunk-000001.wav ./
```

### Option 4: API Endpoint (Coming Soon)

We can add an API endpoint to list files, similar to the Drive one.

---

## File Structure in Bucket

```
audio-dumps/
└── audio-dumps/
    ├── a2ce1d7d9744495a9ea5153ba07319be/
    │   ├── chunk-000001.wav
    │   ├── chunk-000002.wav
    │   └── ...
    └── f0b5f58060f1784e60ddeadd069c19be/
        ├── chunk-000001.wav
        └── ...
```

---

## Permissions Summary

**Service Account Needs:**
- `Storage Object Creator` - To upload files
- (Optional) `Storage Object Viewer` - To list files
- (Optional) `Storage Object Admin` - Full control

**You (as project owner) can:**
- View all files in Cloud Console
- Download files
- Manage bucket settings
- No sharing needed!

---

## Cost

GCS pricing is very cheap:
- **Storage:** ~$0.020 per GB/month
- **Operations:** ~$0.05 per 10,000 operations
- **Network egress:** Free within same region

For audio dumps, you're looking at pennies per month unless you have massive volume.

---

## Troubleshooting

### "Permission denied" error:
- Check service account has `Storage Object Creator` role on the bucket
- Verify bucket name is correct in `GCS_BUCKET_NAME`

### "Bucket not found" error:
- Check bucket name spelling
- Ensure bucket exists in the correct project
- Verify project ID in service account JSON matches

### Files not appearing:
- Check Render logs for `[gcs] ✅ Uploaded` messages
- Verify `GCS_ENABLED=true` is set
- Check bucket permissions

---

## Quick Setup Checklist

- [ ] Create GCS bucket named `audiodumps`
- [ ] Grant service account `Storage Object Creator` role
- [ ] Set `GCS_ENABLED=true` in Render
- [ ] Set `GCS_BUCKET_NAME=audiodumps` in Render
- [ ] Ensure `GOOGLE_APPLICATION_CREDENTIALS_JSON` is set
- [ ] Deploy and test!

That's it! Much simpler than Drive. 🎉


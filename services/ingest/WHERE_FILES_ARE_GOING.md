# 📍 Where Are Files Currently Going?

## Current Status

Files are being uploaded to the **Service Account's Google Drive**, not your personal Google Drive.

### Service Account Details:
- **Email:** `audio-dump-uploader@gen-lang-client-0415704882.iam.gserviceaccount.com`
- **Project:** `gen-lang-client-0415704882`
- **Location:** Service account's "My Drive" → "Audio Dumps" folder

---

## How to Check if Uploads Are Working

### 1. Check Render Logs

Look for these messages in Render logs:

**✅ Success:**
```
[google-drive] ✅ Uploaded to Google Drive { file_id: '...', web_link: '...' }
[google-drive] ✅ Created folder { folder_id: '...', folder_name: 'Audio Dumps' }
```

**❌ Failure:**
```
[google-drive] ❌ Failed to upload to Google Drive
[google-drive] ❌ Failed to get/create root folder
```

**⚠️ If you DON'T see any upload messages:**
- Uploads might not be happening
- Client might not be initializing
- Files might only be saved locally

---

## Current File Locations

### Local Files (on Render server):
- **Path:** `./audio-dumps/{interaction_id}/chunk-XXXXXX.wav`
- **Status:** ✅ Working (you see these in logs)
- **Note:** These are temporary - Render's filesystem is ephemeral

### Google Drive Files:
- **Location:** Service account's Drive
- **Path:** `My Drive/Audio Dumps/Call {interaction_id}/chunk-XXXXXX.wav`
- **Status:** ❓ Unknown (need to check logs)

---

## How to Access Service Account Files

### Option 1: Use the API Endpoints (After Deployment)

Once deployed, you can check what's in Drive:

```bash
# List all call folders
curl https://your-render-url.onrender.com/api/drive/folders

# List files in a specific call
curl https://your-render-url.onrender.com/api/drive/call/{interaction_id}
```

### Option 2: Access via Google Cloud Console

1. Go to: https://console.cloud.google.com
2. Select project: `gen-lang-client-0415704882`
3. Navigate to: IAM & Admin → Service Accounts
4. Find: `audio-dump-uploader@gen-lang-client-0415704882.iam.gserviceaccount.com`
5. Click on it → You might be able to access its Drive (if permissions allow)

### Option 3: Share Folder (After Adding Email)

Once you add `GOOGLE_DRIVE_SHARE_WITH_EMAIL` environment variable:
- Folder will be automatically shared with your email
- Files will appear in your Drive under "Shared with me"

---

## What Your Logs Show

From the logs you shared:
- ✅ Audio dumping is working (local files)
- ✅ Google Drive is enabled
- ❓ **No upload success/failure messages visible**

This suggests:
1. **Either:** Uploads aren't happening (client not initializing, errors being swallowed)
2. **Or:** Uploads are happening but logs aren't showing (only first 3 chunks and every 100th chunk are logged)

---

## Next Steps to Verify

1. **Check Render logs** for `[google-drive]` messages during an active call
2. **Use API endpoint** after deployment: `/api/drive/folders`
3. **Add email sharing** so files appear in your Drive automatically

---

## Quick Test

After deployment, make a test call and immediately check:

```bash
# In Render logs, search for:
[google-drive] ✅ Uploaded
[google-drive] ❌ Failed
[google-drive] Initializing

# Or use API:
curl https://your-service.onrender.com/api/drive/folders
```

This will tell you if files are actually being uploaded to Drive.


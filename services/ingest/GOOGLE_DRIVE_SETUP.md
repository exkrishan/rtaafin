# 📁 Google Drive Setup for Audio Dumps

This guide shows how to configure the ingest service to automatically upload audio dumps to Google Drive.

## Overview

When enabled, all audio chunks dumped to files will also be automatically uploaded to Google Drive, organized by call/interaction ID.

## Prerequisites

1. **Google Cloud Project** with Drive API enabled
2. **Service Account** with Drive API access
3. **Service Account Key** (JSON file)

---

## Step 1: Enable Google Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** > **Library**
4. Search for "**Google Drive API**"
5. Click on it and click **Enable**

---

## Step 2: Create Service Account

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Enter name: `audio-dump-uploader`
4. Click **Create and Continue**
5. Grant role: **Editor** (or **Drive File** scope for more restricted access)
6. Click **Continue** then **Done**

---

## Step 3: Create Service Account Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** > **Create new key**
4. Select **JSON** format
5. Click **Create** - this downloads the key file
6. **Save this file securely** - you'll need it for authentication

---

## Step 4: Configure Environment Variables

### For Local Development

Add to your `.env.local` or export:

```bash
# Enable Google Drive uploads
GOOGLE_DRIVE_ENABLED=true

# Path to service account JSON file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json

# Optional: Specify Google Drive folder ID (auto-creates if not set)
GOOGLE_DRIVE_FOLDER_ID=your-folder-id-here

# Optional: Parent folder name (default: 'Audio Dumps')
GOOGLE_DRIVE_PARENT_FOLDER_NAME=Audio Dumps
```

### For Render Deployment

1. Go to Render Dashboard → Your Service → **Environment**
2. Add these variables:

| Key | Value | Description |
|-----|-------|-------------|
| `GOOGLE_DRIVE_ENABLED` | `true` | Enable Google Drive uploads |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | `{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}` | **Service account JSON as string** |
| `GOOGLE_DRIVE_PARENT_FOLDER_NAME` | `Audio Dumps` | Folder name in Drive (optional) |

**Important for Render:**
- Use `GOOGLE_APPLICATION_CREDENTIALS_JSON` (not `GOOGLE_APPLICATION_CREDENTIALS`)
- Paste the **entire JSON content** from your service account key file as the value
- The JSON should be on a single line or properly escaped
- Example value: `{"type":"service_account","project_id":"my-project","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"service@project.iam.gserviceaccount.com",...}`

---

## Step 5: Install Dependencies

The `googleapis` package is already added to `package.json`. Just install:

```bash
cd services/ingest
npm install
```

---

## Step 6: Verify Setup

### Check Logs

When audio dumping starts, you should see:

```
[google-drive] Google Drive uploads enabled { parent_folder: 'Audio Dumps', folder_id: 'auto-create' }
[google-drive] ✅ Google Drive client initialized
[google-drive] ✅ Created folder { folder_id: '...', folder_name: 'Audio Dumps' }
[google-drive] ✅ Uploaded to Google Drive { file_name: 'chunk-000001.wav', file_id: '...', web_link: '...' }
```

### Check Google Drive

1. Go to [Google Drive](https://drive.google.com)
2. Look for folder: **Audio Dumps**
3. Inside, you'll see folders for each call: **Call {interaction_id}**
4. Inside each call folder, you'll see the audio chunks

---

## Folder Structure in Google Drive

```
Audio Dumps/
├── Call CA1234567890/
│   ├── chunk-000001.wav
│   ├── chunk-000002.wav
│   ├── chunk-000003.wav
│   └── ...
├── Call CA9876543210/
│   ├── chunk-000001.wav
│   └── ...
└── ...
```

---

## Configuration Options

### Use Existing Folder

If you want to upload to an existing Google Drive folder:

1. Open the folder in Google Drive
2. Copy the folder ID from the URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
3. Set environment variable:
   ```bash
   GOOGLE_DRIVE_FOLDER_ID=FOLDER_ID_HERE
   ```

### Custom Folder Name

Change the parent folder name:

```bash
GOOGLE_DRIVE_PARENT_FOLDER_NAME=My Audio Files
```

---

## Troubleshooting

### Error: "GOOGLE_APPLICATION_CREDENTIALS not set"

**Solution:** Set the environment variable to the path of your service account JSON file.

### Error: "Failed to initialize Google Drive client"

**Possible causes:**
1. Invalid JSON file
2. Service account doesn't have Drive API access
3. Drive API not enabled

**Solution:**
1. Verify JSON file is valid
2. Check service account has Editor role or Drive API access
3. Enable Drive API in Google Cloud Console

### Error: "Failed to upload to Google Drive"

**Possible causes:**
1. Network issues
2. Quota exceeded
3. Permission issues

**Solution:**
- Check Google Cloud Console for quota limits
- Verify service account has proper permissions
- Check Render logs for detailed error messages

### Files Not Appearing in Drive

1. **Check logs** for upload messages
2. **Verify folder exists** - check if "Audio Dumps" folder was created
3. **Check permissions** - service account needs Drive API access
4. **Wait a few seconds** - uploads are async and may take time

---

## Security Notes

⚠️ **Important:**
- Never commit service account JSON files to git
- Store credentials securely (use environment variables)
- Use least privilege principle (Editor role is sufficient)
- Rotate keys periodically

---

## Cost Considerations

- **Google Drive Storage:** 15GB free, then paid
- **API Calls:** Free tier includes generous limits
- **Bandwidth:** Uploads count toward Drive storage

**Estimate:**
- Each audio chunk: ~320 bytes (20ms at 8kHz) = ~16KB per second
- 1 hour call: ~57MB
- 100 calls: ~5.7GB

---

## Disabling Google Drive Uploads

To disable, simply remove or set:

```bash
GOOGLE_DRIVE_ENABLED=false
```

When disabled, files are still saved locally (if `AUDIO_DUMP_ENABLED=true`), but not uploaded to Drive.

---

## Summary

✅ **Enable Drive API** in Google Cloud Console  
✅ **Create Service Account** with Editor role  
✅ **Download JSON key** file  
✅ **Set environment variables**  
✅ **Install dependencies** (`npm install`)  
✅ **Check Google Drive** for uploaded files  

Files will be automatically uploaded as they're dumped!


# 🔍 How to Access Service Account's Google Drive

## Your Service Account Details

- **Service Account Email:** `audio-dump-uploader@gen-lang-client-0415704882.iam.gserviceaccount.com`
- **Project ID:** `gen-lang-client-0415704882`

---

## Method 1: Google Cloud Console (Easiest)

### Step 1: Go to Google Cloud Console
1. Open: https://console.cloud.google.com
2. Select your project: `gen-lang-client-0415704882`

### Step 2: Navigate to Service Accounts
1. Go to: **IAM & Admin** → **Service Accounts**
2. Find: `audio-dump-uploader`
3. Click on it

### Step 3: Access Drive (Limited)
Unfortunately, you **cannot directly browse** the service account's Drive from the console. You need to use one of the methods below.

---

## Method 2: Use Google Drive API Directly (Recommended)

### Option A: Using Google Drive Web Interface

1. **Go to Google Drive:** https://drive.google.com
2. **Sign in with service account** (if you have access):
   - This is tricky - service accounts don't have regular Google accounts
   - You'd need to impersonate the service account (requires domain admin)

### Option B: Use a Script to List Files

I can create a simple script that uses the service account credentials to list files in the "Audio Dumps" folder.

---

## Method 3: Use Google Drive API Explorer

1. **Go to:** https://developers.google.com/drive/api/v3/reference/files/list
2. **Authorize** with your service account credentials
3. **Query:** `name='Audio Dumps' and mimeType='application/vnd.google-apps.folder'`
4. **Get folder ID**, then list files in that folder

---

## Method 4: Create a Quick Script (Easiest for You)

I can create a simple Node.js script that:
- Uses your service account credentials
- Lists all files in "Audio Dumps" folder
- Shows file names, IDs, and links

**Would you like me to create this script?**

---

## Method 5: Check via Render Logs (Quick Verification)

The easiest way to verify files are uploading is to check Render logs:

1. **Go to Render Dashboard** → Your Ingest Service → **Logs**
2. **Search for:** `[google-drive] ✅ Uploaded`
3. **Look for messages like:**
   ```
   [google-drive] ✅ Uploaded to Google Drive {
     file_name: 'chunk-000001.wav',
     file_id: '1ABC...',
     web_link: 'https://drive.google.com/file/d/1ABC.../view'
   }
   ```
4. **Click the `web_link`** - it will open the file in Google Drive (if you have access)

---

## Method 6: Share Folder with Your Account (Best Long-term Solution)

Instead of accessing the service account's Drive, **share the folder with your account**:

1. **Add environment variable in Render:**
   ```
   GOOGLE_DRIVE_SHARE_WITH_EMAIL=your-email@gmail.com
   ```

2. **Deploy** - The folder will be automatically shared

3. **Check your Drive:**
   - Go to https://drive.google.com
   - Look in **"Shared with me"**
   - You'll see "Audio Dumps" folder

This is the **recommended approach** - much easier than accessing the service account's Drive directly!

---

## Quick Test: Verify Uploads Are Working

**Before worrying about access, let's verify uploads are happening:**

1. **Check Render logs** for:
   - `[google-drive] ✅ Uploaded` - Success!
   - `[google-drive] ❌ Failed` - Something's wrong

2. **If you see success messages**, files ARE being uploaded, just to the service account's Drive

3. **If you see errors**, we need to fix the upload process first

---

## Recommendation

**Use Method 6 (Auto-sharing)** - It's the simplest and most user-friendly:
- Add `GOOGLE_DRIVE_SHARE_WITH_EMAIL` environment variable
- Files automatically appear in your Drive
- No need to access service account Drive

**Or use Method 5 (Logs)** - Quick way to verify uploads are working and get direct links to files.

---

## Need Help?

If you want me to:
1. **Create a script** to list files in service account Drive → I can do that
2. **Help set up auto-sharing** → Already done! Just add the env var
3. **Debug why uploads aren't working** → Share your Render logs

Let me know what you'd prefer!


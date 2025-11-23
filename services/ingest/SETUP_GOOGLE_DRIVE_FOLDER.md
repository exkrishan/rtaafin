# 📁 How to Set Up Google Drive Folder for Audio Dumps

## Option 1: Create Folder in YOUR Drive (Recommended)

This way, files will appear in YOUR Google Drive, not the service account's.

### Steps:

1. **Go to Google Drive:** https://drive.google.com

2. **Create a new folder:**
   - Click "New" → "Folder"
   - Name it: `Audio Dumps` (exactly this name, or use `GOOGLE_DRIVE_PARENT_FOLDER_NAME` env var)

3. **Share the folder with the service account:**
   - Right-click the folder → "Share"
   - Add this email: `audio-dump-uploader@gen-lang-client-0415704882.iam.gserviceaccount.com`
   - Give it **"Editor"** permission (so it can upload files)
   - Click "Send" (you can uncheck "Notify people" since it's a service account)

4. **Get the Folder ID:**
   - Open the folder in Google Drive
   - Look at the URL: `https://drive.google.com/drive/folders/1LQzZ1xi5URUYkl9Q91cguUzXhdK-2d7N`
   - The part after `/folders/` is the Folder ID: `1LQzZ1xi5URUYkl9Q91cguUzXhdK-2d7N`

5. **Add to Render Environment Variables:**
   - Go to Render Dashboard → Your Ingest Service → Environment
   - Add: `GOOGLE_DRIVE_FOLDER_ID=1LQzZ1xi5URUYkl9Q91cguUzXhdK-2d7N`
   - (Replace with your actual folder ID)

6. **Deploy** - Files will now upload to YOUR folder!

---

## Option 2: Let Code Create Folder (Current Behavior)

The code automatically creates the folder in the **service account's Drive**.

### What Happens:
- ✅ Code creates "Audio Dumps" folder automatically
- ✅ Service account uploads files there
- ❌ **You can't see it** (it's in service account's Drive, not yours)

### To Access Files:
- Use the API endpoints: `/api/drive/folders` and `/api/drive/call/{id}`
- Or add `GOOGLE_DRIVE_SHARE_WITH_EMAIL=your-email@gmail.com` to auto-share

---

## Which Option Should You Use?

### Use Option 1 if:
- ✅ You want files in YOUR Google Drive
- ✅ You want to see them in "My Drive"
- ✅ You want easy access via Drive UI

### Use Option 2 if:
- ✅ You don't mind using API endpoints to access files
- ✅ You want the code to handle everything automatically
- ✅ You'll add email sharing later

---

## Quick Setup (Option 1):

1. Create folder in your Drive: `Audio Dumps`
2. Share with: `audio-dump-uploader@gen-lang-client-0415704882.iam.gserviceaccount.com` (Editor)
3. Get folder ID from URL
4. Set `GOOGLE_DRIVE_FOLDER_ID` in Render
5. Done! Files will appear in YOUR Drive

---

## Current Code Behavior:

If `GOOGLE_DRIVE_FOLDER_ID` is **NOT set**:
- Code creates folder in service account's Drive
- You can't see it in your Drive (unless you use API or email sharing)

If `GOOGLE_DRIVE_FOLDER_ID` **IS set**:
- Code uses YOUR folder
- Files appear in YOUR Drive
- You can see everything immediately


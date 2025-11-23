# 🔍 Debugging Google Drive Uploads

## Current Status

✅ **Audio dumping is working** - You see `[audio-dumper] 💾 Dumped audio chunk` messages  
❓ **Google Drive uploads** - Not seeing files in Drive

---

## Step 1: Check for Google Drive Logs

In Render logs, look for:

### On Startup:
```
[google-drive] Google Drive uploads enabled { ... }
[google-drive] Google Drive client will initialize on first upload
```

### During Call:
```
[google-drive] ✅ Uploaded to Google Drive { file_name: 'chunk-000001.wav', ... }
```

### If Failing:
```
[google-drive] ❌ Failed to upload to Google Drive { error: '...' }
```

---

## Step 2: Verify Environment Variables

Go to Render Dashboard → Your Service → **Environment**

Check these are set:

- [ ] `GOOGLE_DRIVE_ENABLED=true`
- [ ] `GOOGLE_APPLICATION_CREDENTIALS_JSON={...your JSON...}`

---

## Step 3: Check Google Drive Properly

### Where to Look:

1. **Go to Google Drive:** https://drive.google.com
2. **Check "My Drive"** (not "Shared with me")
3. **Look for folder:** "Audio Dumps"
4. **Inside:** "Call f0b5f58060f1784e60ddeadd069c19be" (your interaction_id)

### Folder Structure:
```
My Drive/
└── Audio Dumps/
    └── Call f0b5f58060f1784e60ddeadd069c19be/
        ├── chunk-000001.wav
        ├── chunk-000002.wav
        └── ...
```

---

## Step 4: Check Service Account Permissions

The service account needs to:
1. ✅ Have Drive API enabled
2. ✅ Have Editor role (or Drive File scope)
3. ✅ Be able to create folders and upload files

---

## Common Issues

### Issue 1: No Google Drive Logs at All

**Symptom:** No `[google-drive]` messages in logs

**Cause:** `GOOGLE_DRIVE_ENABLED` not set or not `true`

**Fix:** Set `GOOGLE_DRIVE_ENABLED=true` in Render

---

### Issue 2: "Google Drive uploads enabled but credentials not found"

**Symptom:** Log shows credentials warning

**Cause:** `GOOGLE_APPLICATION_CREDENTIALS_JSON` not set or invalid

**Fix:** 
1. Check JSON is valid
2. Make sure entire JSON is pasted (including all fields)
3. Verify JSON is on single line or properly formatted

---

### Issue 3: "Failed to upload to Google Drive"

**Symptom:** Error messages in logs

**Possible causes:**
- Invalid JSON credentials
- Service account doesn't have Drive access
- Drive API not enabled
- Network issues

**Fix:**
- Check error message in logs
- Verify service account has Editor role
- Enable Drive API in Google Cloud Console

---

### Issue 4: Files Not Appearing in Drive

**Symptom:** No errors, but files don't show up

**Possible causes:**
- Files uploaded to wrong Google account
- Service account created files (not visible in your Drive)
- Need to share folder with your account

**Fix:**
- Check which Google account the service account belongs to
- Files are created by service account, may need to share folder

---

## Quick Diagnostic Commands

### Check Logs for Google Drive Messages:

Look for these patterns in Render logs:
- `[google-drive]` - Any Google Drive message
- `✅ Uploaded` - Successful uploads
- `❌ Failed` - Failed uploads
- `enabled` - Status messages

---

## Next Steps

1. **Check Render logs** for `[google-drive]` messages
2. **Verify environment variables** are set correctly
3. **Check Google Drive** in "My Drive" → "Audio Dumps"
4. **Share what you see** in the logs

What do you see in the logs? Any `[google-drive]` messages?


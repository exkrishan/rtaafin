# 📁 Google Drive Setup for Render

## Quick Answer

**Environment Variable:** `GOOGLE_APPLICATION_CREDENTIALS_JSON`

**Value:** Paste the entire JSON content from your service account key file.

---

## Step-by-Step

### Step 1: Get Your Service Account JSON

1. Download your service account key file (JSON format)
2. Open it in a text editor
3. Copy the entire JSON content

It should look like:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "service@project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

### Step 2: Add to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your service: `rtaa-ingest`
3. Click on it → Go to **Environment** tab
4. Click **"Add Environment Variable"**
5. Add these variables:

**Variable 1:**
- **Key:** `GOOGLE_DRIVE_ENABLED`
- **Value:** `true`

**Variable 2:**
- **Key:** `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- **Value:** Paste the entire JSON content here (all on one line, or properly formatted)

**Variable 3 (Optional):**
- **Key:** `GOOGLE_DRIVE_PARENT_FOLDER_NAME`
- **Value:** `Audio Dumps`

### Step 3: Format the JSON Value

You have two options:

#### Option A: Single Line (Easier)
Remove all line breaks and paste as one line:
```
{"type":"service_account","project_id":"your-project","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"service@project.iam.gserviceaccount.com",...}
```

#### Option B: Multi-line (More Readable)
Keep the JSON formatted, but Render will handle it:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  ...
}
```

**Recommendation:** Use Option A (single line) to avoid formatting issues.

### Step 4: Save and Redeploy

1. Click **"Save Changes"**
2. Render will automatically redeploy
3. Wait for deployment to complete

---

## Example

Here's what it looks like in Render:

```
GOOGLE_DRIVE_ENABLED = true
GOOGLE_APPLICATION_CREDENTIALS_JSON = {"type":"service_account","project_id":"gen-lang-client-0415704882","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n","client_email":"rtaa-250@gen-lang-client-0415704882.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}
GOOGLE_DRIVE_PARENT_FOLDER_NAME = Audio Dumps
```

---

## Verify It's Working

After deployment, check Render logs for:

```
[google-drive] Google Drive uploads enabled { parent_folder: 'Audio Dumps', folder_id: 'auto-create', auth_method: 'JSON string' }
[google-drive] ✅ Google Drive client initialized
[google-drive] ✅ Created folder { folder_id: '...', folder_name: 'Audio Dumps' }
```

When audio chunks are dumped, you'll see:
```
[google-drive] ✅ Uploaded to Google Drive { file_name: 'chunk-000001.wav', file_id: '...', web_link: '...' }
```

---

## Troubleshooting

### Error: "Invalid JSON"

**Solution:** Make sure the JSON is valid:
- All quotes are properly escaped
- No trailing commas
- Private key has `\n` for newlines (not actual newlines)

### Error: "Failed to initialize Google Drive client"

**Possible causes:**
1. Invalid JSON format
2. Missing required fields in JSON
3. Service account doesn't have Drive API access

**Solution:**
1. Verify JSON is valid (use a JSON validator)
2. Check all required fields are present
3. Verify service account has Editor role or Drive API access

### Files Not Uploading

1. **Check logs** for `[google-drive]` messages
2. **Verify** `GOOGLE_DRIVE_ENABLED=true` is set
3. **Verify** `GOOGLE_APPLICATION_CREDENTIALS_JSON` contains valid JSON
4. **Check** Google Drive API is enabled in Google Cloud Console

---

## Summary

✅ **Variable Name:** `GOOGLE_APPLICATION_CREDENTIALS_JSON`  
✅ **Value:** Entire JSON content from service account key file  
✅ **Format:** Single line JSON (recommended)  
✅ **Location:** Render Dashboard → Environment Variables  

After adding this, files will automatically upload to Google Drive!


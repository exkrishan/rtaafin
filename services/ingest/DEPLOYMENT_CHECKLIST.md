# ✅ Deployment Checklist - Audio Dump & Google Drive

## What's Been Done

✅ Code committed and pushed to `feat/exotel-deepgram-bridge`  
✅ Environment variables added in Render  
✅ Google Drive integration code ready  

---

## Next Steps

### Step 1: Check Render Auto-Deploy

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your service: `rtaa-ingest`
3. Check if **Auto-Deploy** is enabled:
   - If **Yes** → Render will automatically deploy (wait 2-5 minutes)
   - If **No** → You need to manually deploy (see Step 2)

### Step 2: Manual Deploy (if needed)

If auto-deploy is disabled:

1. Go to Render Dashboard → Your Service
2. Click **"Manual Deploy"** button
3. Select **"Deploy latest commit"**
4. Wait for deployment to complete (2-5 minutes)

### Step 3: Verify Deployment

After deployment completes, check logs for:

```
[audio-dumper] Audio dumping enabled { dump_dir: '/tmp/audio-dumps', format: 'wav' }
[google-drive] Google Drive uploads enabled { parent_folder: 'Audio Dumps', folder_id: 'auto-create', auth_method: 'JSON string' }
[google-drive] ✅ Google Drive client initialized
```

---

## Environment Variables Checklist

Make sure these are set in Render:

- [x] `AUDIO_DUMP_ENABLED=true`
- [x] `AUDIO_DUMP_DIR=/tmp/audio-dumps`
- [x] `AUDIO_DUMP_FORMAT=wav`
- [x] `GOOGLE_DRIVE_ENABLED=true`
- [x] `GOOGLE_APPLICATION_CREDENTIALS_JSON={...your JSON...}`
- [x] `GOOGLE_DRIVE_PARENT_FOLDER_NAME=Audio Dumps` (optional)
- [x] `SUPPORT_EXOTEL=true`
- [x] `REDIS_URL=...`
- [x] `PUBSUB_ADAPTER=redis_streams`

---

## After Deployment

### Test It

1. **Make a call from Exotel**
2. **Check Render logs** for:
   - `[exotel] New Exotel WebSocket connection`
   - `[audio-dumper] 💾 Dumped audio chunk`
   - `[google-drive] ✅ Uploaded to Google Drive`

### Check Google Drive

1. Go to [Google Drive](https://drive.google.com)
2. Look for folder: **Audio Dumps**
3. Inside: **Call {interaction_id}** folders
4. Inside each: Audio chunk files

---

## Troubleshooting

### Deployment Fails

**Check:**
1. Build logs for errors
2. `package.json` has `googleapis` dependency (should be auto-installed)
3. All environment variables are set correctly

### Google Drive Not Working

**Check:**
1. `GOOGLE_DRIVE_ENABLED=true` is set
2. `GOOGLE_APPLICATION_CREDENTIALS_JSON` has valid JSON
3. Service account has Drive API access
4. Drive API is enabled in Google Cloud Console

### No Audio Dumps

**Check:**
1. `AUDIO_DUMP_ENABLED=true` is set
2. Exotel is connecting (check logs for `[exotel]` messages)
3. Call is active and audio is being sent

---

## Summary

✅ **Code:** Committed and pushed  
✅ **Environment Variables:** Added in Render  
⏳ **Deployment:** Check if auto-deploy is enabled, or manually deploy  
✅ **Ready:** After deployment, test with an Exotel call  


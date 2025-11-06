# 🔄 How to Change Environment Type in Render

## Current Situation
Your service is currently configured as **Docker** (visible from "Dockerfile Path" setting).

## Option 1: Change via Service Settings (If Available)

### Look for these locations:

1. **At the top of the Settings page**
   - Check if there's a dropdown or toggle for "Environment Type" or "Runtime"
   - It might be near the service name or in a header section

2. **In the "Build & Deploy" section**
   - Scroll up in the settings page
   - Look for a "Runtime" or "Environment" dropdown
   - Should show options like "Docker", "Node", "Python", etc.

3. **Service Overview/General Settings**
   - Go back to the main service page (not Settings tab)
   - Look for "Runtime" or "Environment Type" in the service details
   - There might be an "Edit" button to change it

## Option 2: Recreate Service (If Option 1 Not Available)

If you can't find the option to change environment type:

### Steps:

1. **Note down your current settings:**
   - Environment variables (from Environment/Secrets tab)
   - Custom domain: `ingest.axkrishan.render.com`
   - Any other custom configurations

2. **Create a new Web Service:**
   - Go to Render Dashboard → "New" → "Web Service"
   - Connect your GitHub repository
   - **Important:** When prompted for "Environment", select **"Node"** (not Docker)

3. **Configure the new service:**
   - **Root Directory:** `services/ingest`
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Environment Variables:** Copy from your old service

4. **Update Custom Domain:**
   - After deployment, go to Settings → Custom Domains
   - Add: `ingest.axkrishan.render.com`

5. **Delete old service:**
   - Once new service is working, delete the old Docker-based service

## Option 3: Use Current Docker Setup (Workaround)

If you want to keep using Docker, update your Render settings:

### In the Settings page you're viewing:

1. **Root Directory:**
   ```
   .
   ```
   (Change from `services/ingest` to `.` - repo root)

2. **Dockerfile Path:**
   ```
   services/ingest/Dockerfile
   ```

3. **Docker Build Context Directory:**
   ```
   .
   ```
   (Repo root)

This will allow Docker to access the `lib/pubsub` directory.

## Quick Check: Where to Look

1. **Scroll to the top of Settings page** - Look for "Runtime" or "Environment Type"
2. **Check the service overview page** - Click on service name (not Settings tab)
3. **Look for "Edit" or "Change" buttons** near service configuration

## Recommendation

**If you can't find the option to change environment type:**
- Use **Option 3** (update Docker settings) - it's the quickest
- Or use **Option 2** (recreate with Node) - cleaner long-term solution

---

**Need help?** Check Render's documentation or support for "changing service runtime" or "Docker to Node migration".


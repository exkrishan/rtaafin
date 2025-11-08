# 🎯 Ingest Service Build Command Update

## Service to Update

**Service Name:** `rtaa-ingest` (or `ingest` or `rtaa-ingest-service`)

**This is:** The WebSocket ingestion service (NOT the frontend)

---

## 📋 Exact Step-by-Step Instructions

### Step 1: Open Render Dashboard
1. Go to: **https://dashboard.render.com**
2. Log in to your account

### Step 2: Find the Ingest Service
Look for a service with one of these names:
- `rtaa-ingest`
- `ingest`
- `rtaa-ingest-service`
- `ingest-service`

**How to identify it:**
- It's a **Web Service** (not Static Site)
- It handles WebSocket connections
- It's separate from the frontend service

### Step 3: Open Service Settings
1. **Click on the service name** (the one you found above)
2. Click the **"Settings"** tab at the top of the page
3. Scroll down to find **"Build Command"** section

### Step 4: Update Build Command
1. Find the **"Build Command"** field
2. You should see:
   ```
   cd ../.. && npm ci && cd services/ingest && npm run build
   ```
3. **Change it to:**
   ```
   cd ../.. && npm install && cd services/ingest && npm run build
   ```
   (Only change: `npm ci` → `npm install`)

### Step 5: Save and Deploy
1. Click **"Save Changes"** button (usually at bottom of page)
2. Wait for confirmation message
3. Click **"Manual Deploy"** button (top right)
4. Select **"Deploy latest commit"**
5. Watch the build logs

---

## ✅ Verification

After updating, the build logs should show:
```
==> Running build command 'cd ../.. && npm install && cd services/ingest && npm run build'
==> npm install (installing dependencies) ✅
==> cd services/ingest && npm run build ✅
==> Build successful ✅
```

---

## 🚫 Don't Update These Services

**DO NOT update:**
- ❌ Frontend service (Next.js app) - already fixed in code
- ❌ ASR Worker service - already updated or will auto-fix

**ONLY update:**
- ✅ Ingest service (WebSocket service)

---

## 📸 Visual Guide

```
Render Dashboard
├── Services List
│   ├── rtaa-frontend (DON'T UPDATE)
│   ├── rtaa-asr-worker (DON'T UPDATE)
│   └── rtaa-ingest ← CLICK THIS ONE ✅
│       └── Settings Tab
│           └── Build Command
│               └── Change: npm ci → npm install
```

---

## ⚠️ If You Can't Find the Service

If you can't find a service named "ingest":
1. Check all services in your Render dashboard
2. Look for the one that handles WebSocket connections
3. Check the service's "Start Command" - it should mention WebSocket or port 10000
4. Or check the service's environment variables - it should have `REDIS_URL` and `PUBSUB_ADAPTER`

---

## 🆘 Still Having Issues?

If the service name is different, check:
1. Service type: Should be "Web Service"
2. Root Directory: Should be `services/ingest`
3. Environment variables: Should have `REDIS_URL`, `PUBSUB_ADAPTER`

Once you find it, follow the same steps above.


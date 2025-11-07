# 🔧 Render Build Errors - Fix Guide

## Errors Encountered

1. ❌ **Husky Error:** `sh: 1: husky: not found`
2. ❌ **Build Command:** Wrong command used
3. ❌ **Module Not Found:** `Cannot find module '/opt/render/project/src/services/ingest/dist/server.js'`

---

## Root Causes

### 1. Husky Prepare Script
- **Problem:** `package.json` has `"prepare": "husky install"` which runs during `npm install`
- **Issue:** Husky not installed in service's node_modules
- **Fix:** Changed to `"prepare": "husky install || true"` (non-blocking)

### 2. Build Command
- **Problem:** Build command was `npm install; npm run build` (wrong)
- **Issue:** Doesn't resolve workspace dependencies correctly
- **Fix:** Use `cd ../.. && npm ci && cd services/ingest && npm run build`

### 3. Missing dist/ Directory
- **Problem:** `dist/server.js` not found after build
- **Issue:** Build didn't run or ran in wrong location
- **Fix:** Ensure build command runs from correct directory

---

## Correct Render Configuration

### Build Command
```
cd ../.. && npm ci && cd services/ingest && npm run build
```

**Why:**
1. `cd ../..` - Go to repo root (from services/ingest)
2. `npm ci` - Install all workspace dependencies
3. `cd services/ingest` - Return to service directory
4. `npm run build` - Build TypeScript to dist/

### Start Command
```
npm run start
```

**This runs:** `node dist/server.js` (from services/ingest directory)

---

## Verification

After fixing, the build should:
1. ✅ Install dependencies without husky errors
2. ✅ Create `dist/server.js` in `services/ingest/dist/`
3. ✅ Start command finds `dist/server.js`

---

## Updated Configuration

| Setting | Value |
|---------|-------|
| **Root Directory** | `services/ingest` |
| **Build Command** | `cd ../.. && npm ci && cd services/ingest && npm run build` |
| **Start Command** | `npm run start` |
| **Health Check Path** | `/health` |

---

## Status

- ✅ Husky fix: Applied (committed)
- ✅ Build command: Update in Render dashboard
- ⏳ Redeploy: After updating build command

---

**Last Updated:** 2025-11-07


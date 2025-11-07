# 🔧 Render Start Command Error Fix

## Error Message

```
npm error Lifecycle script `start` failed with error:
npm error code 1
npm error path /opt/render/project/src/services/ingest
npm error command failed
npm error command sh -c node dist/server.js
```

**Root Cause:** `dist/server.js` file doesn't exist because the build didn't complete successfully.

---

## Why This Happens

The `start` command runs `node dist/server.js`, but the file doesn't exist because:

1. **Build Command Issue:** The build command didn't run correctly
2. **TypeScript Compilation Failed:** Build may have failed silently
3. **Wrong Directory:** Build ran from wrong location
4. **Workspace Dependencies:** `@rtaa/pubsub` not resolved during build

---

## Solution

### Step 1: Fix Build Command in Render

**Current (Wrong):**
```
npm install; npm run build
```

**Correct:**
```
cd ../.. && npm ci && cd services/ingest && npm run build
```

**Why:**
- `cd ../..` - Go to repo root (from services/ingest)
- `npm ci` - Install all workspace dependencies
- `cd services/ingest` - Return to service directory
- `npm run build` - Build TypeScript to dist/

### Step 2: Verify Build Output

After build, check logs for:
```
> @rtaa/ingest-service@0.1.0 build
> tsc -p tsconfig.json
```

Should complete without errors.

### Step 3: Verify dist/server.js Exists

After successful build, `dist/server.js` should exist at:
```
/opt/render/project/src/services/ingest/dist/server.js
```

---

## Complete Fix Checklist

1. ✅ **Husky Fix:** Already applied (`husky install || true`)
2. ⚠️ **Build Command:** Update in Render Dashboard
3. ⚠️ **Root Directory:** Verify it's `services/ingest`
4. ⚠️ **Redeploy:** After updating build command

---

## Updated Render Configuration

| Setting | Value |
|---------|-------|
| **Root Directory** | `services/ingest` |
| **Build Command** | `cd ../.. && npm ci && cd services/ingest && npm run build` |
| **Start Command** | `npm run start` |
| **Health Check Path** | `/health` |

---

## Expected Build Output

After correct build command:
```
> @rtaa/ingest-service@0.1.0 build
> tsc -p tsconfig.json

✅ No errors
✅ dist/server.js created
✅ dist/ directory contains compiled files
```

---

## Expected Start Output

After successful build:
```
> @rtaa/ingest-service@0.1.0 start
> node dist/server.js

[server] Ingestion server listening on port <PORT>
[server] WebSocket endpoint: ws://localhost:<PORT>/v1/ingest
[server] Health check: http://localhost:<PORT>/health
```

---

## Troubleshooting

### If build still fails:

1. **Check TypeScript errors in build logs**
2. **Verify workspace dependencies are installed**
3. **Ensure Root Directory is `services/ingest`**
4. **Check that `lib/pubsub` is accessible**

### If dist/server.js still missing:

1. **Check build logs for TypeScript compilation errors**
2. **Verify tsconfig.json is correct**
3. **Ensure outDir is set to `./dist`**

---

**Status:** Build command needs to be updated in Render  
**Last Updated:** 2025-11-07


# 🔧 Ingest Service Startup Fix Plan (Render Deployment)

**Date:** 2025-11-07  
**Service:** `services/ingest` (WebSocket Ingestion Service)  
**Status:** ❌ Startup Failure → ✅ Fix Plan

---

## 🧱 Section A — Root Cause Analysis

### Error Summary
```
npm error Lifecycle script `start` failed with error:
npm error code 1
npm error path /opt/render/project/src/services/ingest
npm error command sh -c node dist/server.js
```

### Root Causes Identified

#### 1. ❌ **Missing `dist/server.js` File**
**Reason:** Build command didn't execute correctly or TypeScript compilation failed silently.

**Evidence:**
- Error: `Cannot find module '/opt/render/project/src/services/ingest/dist/server.js'`
- Build command in Render: `npm install; npm run build` (incorrect)
- Workspace dependencies (`@rtaa/pubsub`) not resolved during build

**Impact:** Service cannot start because entry point doesn't exist.

---

#### 2. ❌ **Incorrect Build Command**
**Current (Wrong):**
```bash
npm install; npm run build
```

**Problems:**
- Runs from `services/ingest` directory
- Doesn't resolve workspace dependencies from repo root
- `@rtaa/pubsub` not available during TypeScript compilation
- Build may fail silently or create incomplete output

**Impact:** TypeScript compilation fails or creates broken output.

---

#### 3. ⚠️ **Environment Variable Dependencies**
**Code Analysis:** `services/ingest/src/server.ts` uses:
- `process.env.PORT` (with fallback to 5000) ✅ Safe
- `process.env.REDIS_URL` (via pub/sub adapter) ⚠️ May fail if missing
- `process.env.PUBSUB_ADAPTER` (defaults to redis_streams) ✅ Safe
- `process.env.JWT_PUBLIC_KEY` (for authentication) ⚠️ May fail if missing
- `process.env.SUPPORT_EXOTEL` (optional) ✅ Safe
- `process.env.SSL_KEY_PATH` / `process.env.SSL_CERT_PATH` (optional) ✅ Safe

**Potential Failure Points:**
- If `REDIS_URL` is missing, Redis connection will fail
- If `JWT_PUBLIC_KEY` is missing, JWT validation will fail
- Pub/Sub adapter initialization may throw if Redis connection fails

**Impact:** Service crashes on startup if required env vars missing.

---

#### 4. ⚠️ **Workspace Dependency Resolution**
**Issue:** `@rtaa/pubsub` is a workspace dependency, not a published npm package.

**Code References:**
- `services/ingest/src/pubsub-adapter.dev.ts`: `import { createPubSubAdapterFromEnv } from '@rtaa/pubsub';`
- `services/ingest/src/server.ts`: Uses pub/sub adapter

**Build Process:**
- Must run `npm ci` from repo root to link workspace dependencies
- Then build from `services/ingest` directory
- TypeScript path aliases in `tsconfig.json` resolve `@rtaa/pubsub` to `../../lib/pubsub`

**Impact:** If workspace not resolved, TypeScript compilation fails or runtime module resolution fails.

---

#### 5. ⚠️ **Dynamic Module Loading**
**Code Analysis:** `lib/pubsub/index.ts` uses dynamic `require()` for optional dependencies:
- `ioredis` (for Redis Streams adapter)
- `kafkajs` (for Kafka adapter)

**Potential Issues:**
- If `ioredis` not installed, Redis adapter fails
- Runtime error if adapter not available and `PUBSUB_ADAPTER=redis_streams`

**Impact:** Service crashes if adapter dependency missing.

---

#### 6. ⚠️ **Dotenv Configuration Path**
**Code:** `services/ingest/src/server.ts` line 22:
```typescript
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env.local') });
```

**Issue:** 
- Hardcoded path to `../../../.env.local` (repo root)
- On Render, `.env.local` doesn't exist (uses environment variables instead)
- Should not fail (dotenv handles missing files), but worth noting

**Impact:** Low - dotenv handles missing files gracefully.

---

#### 7. ⚠️ **Husky Prepare Script**
**Issue:** Root `package.json` has `"prepare": "husky install"` which runs during `npm install`.

**Error:** `sh: 1: husky: not found`

**Impact:** Build fails if husky not available (already fixed with `|| true`).

---

### Summary of Failure Points

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Missing `dist/server.js` | 🔴 Critical | Fix build command |
| 2 | Wrong build command | 🔴 Critical | Update in Render |
| 3 | Missing env vars | 🟡 High | Document required vars |
| 4 | Workspace deps not resolved | 🔴 Critical | Fix build command |
| 5 | Dynamic module loading | 🟡 Medium | Ensure dependencies installed |
| 6 | Dotenv path | 🟢 Low | Already handled |
| 7 | Husky prepare script | 🟡 Medium | ✅ Fixed |

---

## ⚙️ Section B — Fixed Build & Start Scripts

### Current `package.json` (services/ingest/package.json)

```json
{
  "name": "@rtaa/ingest-service",
  "version": "0.1.0",
  "scripts": {
    "dev": "ts-node src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "jest"
  }
}
```

**Status:** ✅ Scripts are correct. Issue is with **build command in Render**, not package.json.

### Root `package.json` Fix (Already Applied)

```json
{
  "scripts": {
    "prepare": "husky install || true"  // ✅ Non-blocking
  }
}
```

**Status:** ✅ Already fixed and committed.

### Verified Code (services/ingest/src/server.ts)

**Port Binding:** ✅ Correct
```typescript
const PORT = parseInt(process.env.PORT || '5000', 10);
// ...
server.listen(PORT, () => {
  console.info(`[server] Ingestion server listening on port ${PORT}`);
});
```

**Status:** ✅ Uses `process.env.PORT` with fallback. No hardcoded port.

---

## 🔐 Section C — Environment Variables Required

### Complete Environment Variable Table

| Variable | Purpose | Required? | Example Value | Source |
|----------|---------|-----------|---------------|--------|
| **PORT** | Server port | ❌ Auto-set | `5000` (default) | Render sets automatically |
| **REDIS_URL** | Redis connection for Pub/Sub | ✅ **Required** | `redis://default:password@host:port` | `.env.local` |
| **PUBSUB_ADAPTER** | Pub/Sub adapter selection | ✅ **Required** | `redis_streams` | `.env.local` |
| **JWT_PUBLIC_KEY** | JWT public key for WebSocket auth | ✅ **Required** | `-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----` | `.env.local` |
| **SUPPORT_EXOTEL** | Enable Exotel protocol | ❌ Optional | `false` or `true` | Default: `false` |
| **SSL_KEY_PATH** | SSL private key file path | ❌ Optional | `/path/to/key.pem` | Not needed (Render handles HTTPS) |
| **SSL_CERT_PATH** | SSL certificate file path | ❌ Optional | `/path/to/cert.pem` | Not needed (Render handles HTTPS) |
| **BUFFER_DURATION_MS** | Audio buffer duration | ❌ Optional | `3000` (default) | Default: 3000ms |
| **ACK_INTERVAL** | ACK message interval | ❌ Optional | `10` (default) | Default: 10 frames |

### Environment Variable Details

#### 1. REDIS_URL (Required)
**Purpose:** Redis connection string for pub/sub messaging.

**Format:**
```
redis://default:password@host:port
```

**Example (Redis Cloud):**
```
redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
```

**What happens if missing:**
- Pub/Sub adapter initialization fails
- Service crashes on startup with Redis connection error

---

#### 2. PUBSUB_ADAPTER (Required)
**Purpose:** Selects which pub/sub adapter to use.

**Valid Values:**
- `redis_streams` (recommended for production)
- `in_memory` (testing only, doesn't work across processes)
- `kafka` (if Kafka adapter implemented)

**Default:** `redis_streams` (if not set)

**What happens if missing:**
- Uses default `redis_streams`
- May fail if Redis not configured

---

#### 3. JWT_PUBLIC_KEY (Required)
**Purpose:** Public key for validating JWT tokens in WebSocket connections.

**Format:** PEM format with newlines
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----
```

**What happens if missing:**
- JWT validation fails
- WebSocket connections rejected with 401 Unauthorized
- Service may start but connections fail

---

#### 4. PORT (Auto-set by Render)
**Purpose:** Server listening port.

**Value:** Automatically set by Render (e.g., `10000`, `10001`, etc.)

**Code Handling:**
```typescript
const PORT = parseInt(process.env.PORT || '5000', 10);
```

**What happens if missing:**
- Falls back to `5000` (local dev)
- Render always sets this, so fallback not used in production

---

### Environment Variable Loading

**Code Location:** `services/ingest/src/server.ts:22`
```typescript
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env.local') });
```

**Behavior:**
- Tries to load `.env.local` from repo root
- On Render, this file doesn't exist (uses env vars from dashboard)
- Dotenv handles missing files gracefully (no error)
- Environment variables from Render dashboard take precedence

---

## 🧰 Section D — Render Deployment Settings

### Complete Render Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| **Service Type** | Web Service | |
| **Name** | `rtaa-ingest` or `ingest` | |
| **Environment** | Node | |
| **Region** | Singapore (Southeast Asia) | Match frontend service |
| **Branch** | `main` | |
| **Root Directory** | `services/ingest` | ⚠️ **Critical** |
| **Build Command** | `cd ../.. && npm ci && cd services/ingest && npm run build` | ⚠️ **Critical - Must Update** |
| **Start Command** | `npm run start` | ✅ Correct |
| **Node Version** | `20.x` | Auto-detected from `.nvmrc` |
| **Health Check Path** | `/health` | ⚠️ **Not `/api/health`** |
| **Instance Type** | Free (or Starter for production) | |
| **Auto-Deploy** | On Commit | |

### Environment Variables in Render

Add these in Render Dashboard → Environment:

| Key | Value | Required |
|-----|-------|----------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` | ✅ |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ |
| `JWT_PUBLIC_KEY` | Full PEM key (see `RENDER_ENV_VALUES.md`) | ✅ |
| `SUPPORT_EXOTEL` | `false` | ❌ Optional |

**Note:** Do NOT add `PORT` - Render sets it automatically.

---

## 🧪 Section E — Validation Checklist

### Local Validation

#### 1. Build Test
```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin

# Simulate Render build process
cd services/ingest
cd ../.. && npm ci && cd services/ingest && npm run build

# Verify dist/server.js exists
ls -lh dist/server.js
# Expected: -rw-r--r-- ... dist/server.js (13K+)
```

#### 2. Start Test
```bash
cd services/ingest

# Set required environment variables
export REDIS_URL="redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304"
export PUBSUB_ADAPTER="redis_streams"
export JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Yuy5TNziNEXIX2Vei1l
mKtqgfevXkUdMfVhDxEXEMNrwX4uU3cye4zpiW2XueBs0wiAUwaF/oGswA7L51Km
ebcDtVr9yMG2Dl/wMIhH55ZzOC1dweb+N5qY8u6H02FpStZou8KUCmQlf1tzvK4Y
sMehFTPXhGzLopA8oPbnQRkoRvL27Dn+QfLxYgnakex7F12XMI56cLcfhSSE+gQ7
z3mbYeIiBTwl9AufxslUy0aobBmKPqaAMq9vPPtkbGUwmyOVVOHuuK2Jq/wjr26z
tzyWjUNznSwHZmP0ISd4+SXJvrSHqJx/M3eTEaOokZH71TlbsHCyDbR8uXkD+uez
LQIDAQAB
-----END PUBLIC KEY-----"

# Start service
PORT=5000 npm run start

# Expected output:
# [server] Ingestion server listening on port 5000
# [server] WebSocket endpoint: ws://localhost:5000/v1/ingest
# [server] Health check: http://localhost:5000/health
```

#### 3. Health Check Test
```bash
# In another terminal
curl http://localhost:5000/health

# Expected response:
# {"status":"ok","service":"ingest"}
```

#### 4. WebSocket Test
```bash
# Generate JWT token (if you have the script)
# Then test WebSocket connection
npx wscat -c ws://localhost:5000/v1/ingest \
  -H "Authorization: Bearer <jwt-token>"

# Or use test script
npx tsx scripts/test-websocket-asr-flow.ts
```

---

### Render-Side Validation

#### 1. Build Verification
After deployment, check Render logs for:
```
> @rtaa/ingest-service@0.1.0 build
> tsc -p tsconfig.json

✅ No TypeScript errors
✅ Build completes successfully
```

#### 2. Start Verification
Check logs for:
```
> @rtaa/ingest-service@0.1.0 start
> node dist/server.js

[server] Ingestion server listening on port <PORT>
[server] WebSocket endpoint: ws://localhost:<PORT>/v1/ingest
[server] Health check: http://localhost:<PORT>/health
```

#### 3. Health Check
```bash
curl -sS https://<ingest-service-url>.onrender.com/health

# Expected:
# {"status":"ok","service":"ingest"}
```

#### 4. WebSocket Connection
```bash
# Test WebSocket endpoint
wscat -c wss://<ingest-service-url>.onrender.com/v1/ingest \
  -H "Authorization: Bearer <jwt-token>"

# Should connect successfully
```

---

### Debugging Commands (If Errors Persist)

#### Check Build Output
```bash
# In Render Shell (if available)
cd /opt/render/project/src/services/ingest
ls -la dist/
# Should show: server.js, auth.js, exotel-handler.js, etc.

cat dist/server.js | head -20
# Should show compiled JavaScript
```

#### Check Environment Variables
```bash
# In Render Shell
env | grep -E "(REDIS_URL|PUBSUB_ADAPTER|JWT_PUBLIC_KEY|PORT)"
# Should show all required variables
```

#### Check Module Resolution
```bash
# In Render Shell
cd /opt/render/project/src/services/ingest
node -e "console.log(require.resolve('@rtaa/pubsub'))"
# Should resolve to workspace package
```

#### Check Dependencies
```bash
# In Render Shell
cd /opt/render/project/src
npm ls @rtaa/pubsub
# Should show workspace link
```

---

## 📋 Summary of Fixes

### ✅ Already Fixed
1. **Husky Prepare Script:** Changed to `husky install || true` (non-blocking)
2. **Port Binding:** Already uses `process.env.PORT` correctly
3. **Health Endpoint:** Exists at `/health` in server.ts

### ⚠️ Must Fix in Render Dashboard

1. **Build Command:**
   - **Current:** `npm install; npm run build` ❌
   - **Change to:** `cd ../.. && npm ci && cd services/ingest && npm run build` ✅

2. **Root Directory:**
   - **Must be:** `services/ingest` ✅

3. **Health Check Path:**
   - **Must be:** `/health` (not `/api/health`) ✅

4. **Environment Variables:**
   - Add: `REDIS_URL`, `PUBSUB_ADAPTER`, `JWT_PUBLIC_KEY` ✅

---

## 🎯 Expected Success Output

After all fixes, the service should log:

```
[server] Ingestion server listening on port <PORT>
[server] WebSocket endpoint: ws://localhost:<PORT>/v1/ingest
[server] Health check: http://localhost:<PORT>/health
[pubsub] Using pub/sub adapter: redis_streams
[pubsub] Topic configuration: { useStreams: true, topic: 'audio_stream' }
```

**Health Check Response:**
```json
{
  "status": "ok",
  "service": "ingest"
}
```

---

## 🚀 Deployment Steps

1. ✅ Update Build Command in Render Dashboard
2. ✅ Verify Root Directory is `services/ingest`
3. ✅ Set Health Check Path to `/health`
4. ✅ Add Environment Variables (REDIS_URL, PUBSUB_ADAPTER, JWT_PUBLIC_KEY)
5. ✅ Save and Redeploy
6. ✅ Monitor logs for startup success
7. ✅ Test health endpoint
8. ✅ Test WebSocket connection

---

**Status:** Ready for deployment after Render configuration updates  
**Last Updated:** 2025-11-07


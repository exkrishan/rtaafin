# 🚀 Render Deployment Guide (Stable Flow)

## Overview

This guide provides the **stable, production-ready** deployment process for RTAA services on Render.

## Prerequisites

- ✅ npm workspaces configured
- ✅ All services use `@rtaa/pubsub` workspace dependency
- ✅ TypeScript strict mode compliance
- ✅ CI pipeline validates builds before deploy

## Service Deployment

### 1. Next.js Frontend (Web Service)

**Service Type:** Web Service  
**Environment:** Node  
**Root Directory:** `/` (repo root)  
**Build Command:** `npm ci && npm run build`  
**Start Command:** `npm run start`  
**Node Version:** 20.x

**Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
LLM_API_KEY=<your-llm-api-key>
```

**Notes:**
- Uses root `package.json` and `tsconfig.json`
- Excludes `services/**/*` and `lib/pubsub/**/*` from Next.js build
- Workspace dependencies are automatically resolved

---

### 2. Ingestion Service (Web Service)

**Service Type:** Web Service  
**Environment:** Node  
**Root Directory:** `services/ingest`  
**Build Command:** `cd ../.. && npm ci && cd services/ingest && npm run build`  
**Start Command:** `npm run start`  
**Node Version:** 20.x

**Environment Variables:**
```
PORT=5000
JWT_PUBLIC_KEY=<your-jwt-public-key>
REDIS_URL=<your-redis-url> (optional)
PUBSUB_ADAPTER=redis_streams|in_memory
```

**Notes:**
- Uses workspace dependency `@rtaa/pubsub`
- Builds from repo root to resolve workspaces
- TypeScript compiles to `dist/` directory

---

### 3. ASR Worker Service (Background Worker)

**Service Type:** Background Worker  
**Environment:** Node  
**Root Directory:** `services/asr-worker`  
**Build Command:** `cd ../.. && npm ci && cd services/asr-worker && npm run build`  
**Start Command:** `npm run start`  
**Node Version:** 20.x

**Environment Variables:**
```
ASR_PROVIDER=mock|deepgram|whisper
DEEPGRAM_API_KEY=<your-deepgram-key> (if using deepgram)
REDIS_URL=<your-redis-url>
PUBSUB_ADAPTER=redis_streams|in_memory
```

**Notes:**
- Uses workspace dependency `@rtaa/pubsub`
- Builds from repo root to resolve workspaces
- Runs as background worker (not web service)

---

## Build Process

### Local Validation (Before Deploy)

```bash
# 1. Install all workspace dependencies
npm ci

# 2. Type check everything
npx tsc --noEmit --skipLibCheck

# 3. Build Next.js app
npm run build

# 4. Build services (optional, for validation)
cd services/ingest && npm run build
cd ../asr-worker && npm run build
```

### Render Build Process

1. **Clone repository**
2. **Run `npm ci`** (installs all workspace dependencies)
3. **Run build command** (service-specific)
4. **Start service** with `npm run start`

---

## Troubleshooting

### "Cannot find module '@rtaa/pubsub'"

**Cause:** Workspace not properly linked  
**Fix:** Ensure build command runs `npm ci` from repo root first

### "TypeScript errors in lib/pubsub"

**Cause:** Next.js trying to compile excluded files  
**Fix:** Verify `tsconfig.json` excludes `lib/pubsub/**/*`

### "Build fails with implicit any errors"

**Cause:** TypeScript strict mode  
**Fix:** All parameters must have explicit types (already fixed)

---

## CI/CD Integration

GitHub Actions automatically validates:
- ✅ TypeScript compilation
- ✅ Next.js build
- ✅ Service builds (optional)

**Never deploy if CI fails!**

---

## Architecture Notes

- **Workspaces:** All services share `@rtaa/pubsub` via npm workspaces
- **Type Safety:** Full TypeScript strict mode compliance
- **Build Isolation:** Each service builds independently
- **Dependency Management:** Centralized via root `package.json`

---

## Quick Reference

| Service | Type | Root Dir | Build Cmd |
|---------|------|----------|-----------|
| Frontend | Web | `/` | `npm ci && npm run build` |
| Ingest | Web | `services/ingest` | `cd ../.. && npm ci && cd services/ingest && npm run build` |
| ASR Worker | Worker | `services/asr-worker` | `cd ../.. && npm ci && cd services/asr-worker && npm run build` |

---

**Last Updated:** 2025-11-06  
**Status:** ✅ Production Ready


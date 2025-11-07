# ✅ Render Form Configuration Checklist - Ingestion Service

## Quick Reference

Use this checklist when filling out the Render "New Web Service" form.

---

## ✅ Already Correct

- ✅ **Language:** Node
- ✅ **Branch:** main
- ✅ **Start Command:** `npm run start`
- ✅ **Instance Type:** Free (OK for POC)
- ✅ **Auto-Deploy:** On Commit

---

## ⚠️ Must Update

### 1. Name
**Current:** `web-service-name`  
**Change to:** `rtaa-ingest` or `ingest` (if available)

---

### 2. Region
**Current:** Oregon (US West)  
**Change to:** **Singapore (Southeast Asia)**  
**Reason:** Match your frontend service region for better latency

---

### 3. Root Directory
**Current:** (empty)  
**Set to:** `services/ingest`  
**Reason:** Service code is in a subdirectory, not repo root

---

### 4. Build Command
**Current:** `npm install && npm run build`  
**Change to:** `cd ../.. && npm ci && cd services/ingest && npm run build`  
**Reason:** Must resolve workspace dependencies from repo root first

---

### 5. Health Check Path (Advanced Section)
**Current:** (empty)  
**Set to:** `/health`  
**Reason:** Ingestion service exposes `/health` endpoint (not `/api/health`)

---

### 6. Environment Variables

**Remove these (not needed):**
- ❌ `PORT` (Render sets this automatically)
- ❌ `NEXT_PUBLIC_API_KEY` (not used by ingestion service)
- ❌ `POSTGRES_ADAPTER` (not used)

**Add these (required):**

1. **JWT_PUBLIC_KEY**
   - Value: See `RENDER_ENV_VALUES.md` for full PEM key
   - Format: Multi-line with `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----`

2. **REDIS_URL**
   - Value: `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304`

3. **PUBSUB_ADAPTER**
   - Value: `redis_streams`

---

## 📋 Complete Form Values

| Field | Value |
|-------|-------|
| **Name** | `rtaa-ingest` |
| **Language** | `Node` |
| **Branch** | `main` |
| **Region** | `Singapore (Southeast Asia)` |
| **Root Directory** | `services/ingest` |
| **Build Command** | `cd ../.. && npm ci && cd services/ingest && npm run build` |
| **Start Command** | `npm run start` |
| **Instance Type** | `Free` (or upgrade if needed) |
| **Health Check Path** | `/health` |
| **Auto-Deploy** | `On Commit` |

---

## 🔐 Environment Variables Summary

| Key | Value | Source |
|-----|-------|--------|
| `JWT_PUBLIC_KEY` | Full PEM key | `RENDER_ENV_VALUES.md` |
| `REDIS_URL` | `redis://default:...@redis-12304...` | `.env.local` |
| `PUBSUB_ADAPTER` | `redis_streams` | `.env.local` |

**Note:** Do NOT add `PORT` - Render sets it automatically.

---

## ✅ Final Checklist Before Deploy

- [ ] Name changed to `rtaa-ingest`
- [ ] Region set to Singapore
- [ ] Root Directory set to `services/ingest`
- [ ] Build Command updated
- [ ] Health Check Path set to `/health`
- [ ] Environment variables added (JWT_PUBLIC_KEY, REDIS_URL, PUBSUB_ADAPTER)
- [ ] Unnecessary env vars removed (PORT, NEXT_PUBLIC_API_KEY, POSTGRES_ADAPTER)

---

## 🚀 After Deployment

1. Check logs for: `[server] Ingestion server listening on port <PORT>`
2. Test health: `curl https://<service-url>/health`
3. Should return: `{"status":"ok","service":"ingest"}`

---

**Last Updated:** 2025-11-07


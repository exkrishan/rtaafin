# 🔐 Render Environment Variables - Ingestion Service

## Service Configuration

**Language:** ✅ **Node** (Node.js)  
**Runtime:** Node.js 20.x

---

## Required Environment Variables

Add these in Render Dashboard → Your Service → Environment:

### 1. JWT_PUBLIC_KEY

**Purpose:** Public key for JWT authentication of WebSocket connections

**How to get:**
```bash
# From your local .env.local file
grep JWT_PUBLIC_KEY .env.local
```

**Format:**
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----
```

**Important:**
- Copy the ENTIRE key including BEGIN/END markers
- Keep newlines intact (Render supports multi-line env vars)
- Or use single line with `\n` for newlines

---

### 2. REDIS_URL

**Purpose:** Redis connection string for pub/sub messaging

**How to get:**
```bash
# From your local .env.local file
grep REDIS_URL .env.local
```

**Format:**
```
redis://default:password@host:port
# or
redis://:password@host:port
# or (Redis Cloud)
redis://default:password@redis-xxx.cxxx.us-east-1-3.ec2.redns.redis-cloud.com:12304
```

**Example:**
```
redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
```

---

### 3. PUBSUB_ADAPTER

**Purpose:** Pub/sub adapter to use

**Value:**
```
redis_streams
```

**Options:**
- `redis_streams` (recommended for production)
- `in_memory` (for testing only, doesn't work across processes)

---

### 4. PORT

**Purpose:** Server port (auto-set by Render)

**Value:** 
- Automatically set by Render
- Don't manually set this
- Service uses `process.env.PORT` automatically

---

## Optional Environment Variables

### SUPPORT_EXOTEL

**Purpose:** Enable Exotel protocol support

**Value:**
```
false
```
(or `true` if you need Exotel integration)

---

### SSL_KEY_PATH / SSL_CERT_PATH

**Purpose:** SSL/TLS certificates for HTTPS/WSS

**Value:**
- Leave empty for HTTP/WS (Render handles HTTPS automatically)
- Only needed if you want custom certificates

---

## How to Add in Render

1. Go to Render Dashboard → Your Service → **Environment**
2. Click **"Add Environment Variable"**
3. Add each variable:
   - **Key:** `JWT_PUBLIC_KEY`
   - **Value:** (paste from .env.local)
   - Click **"Save Changes"**
4. Repeat for all variables
5. **Redeploy** the service for changes to take effect

---

## Verification

After adding variables, check logs:

```bash
# In Render Dashboard → Logs
# Look for:
[server] Using pub/sub adapter: redis_streams
[server] Ingestion server listening on port <PORT>
```

---

## Security Notes

⚠️ **Never commit .env.local to git!**

- JWT_PUBLIC_KEY is sensitive
- REDIS_URL contains credentials
- Always use Render's environment variable UI
- Don't hardcode in code

---

## Quick Copy Commands

To extract values from local .env.local:

```bash
# JWT_PUBLIC_KEY
grep "^JWT_PUBLIC_KEY" .env.local | cut -d'=' -f2-

# REDIS_URL
grep "^REDIS_URL" .env.local | cut -d'=' -f2-

# PUBSUB_ADAPTER (if set)
grep "^PUBSUB_ADAPTER" .env.local | cut -d'=' -f2- || echo "redis_streams"
```

---

**Last Updated:** 2025-11-07


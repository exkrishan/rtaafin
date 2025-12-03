# 🚀 Ingest Service - Quick Reference Card

## Render Service Configuration

### Basic Settings
```
Name: rtaa-ingest
Type: Web Service
Environment: Node
Branch: feat/exotel-deepgram-bridge
Root Directory: services/ingest
```

### Build & Start
```
Build Command: cd ../.. && npm ci && cd services/ingest && npm run build
Start Command: npm run start
Health Check: /health
```

---

## Environment Variables (Copy-Paste Ready)

### Required Variables

#### REDIS_URL
```
redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
```

#### PUBSUB_ADAPTER
```
redis_streams
```

#### JWT_PUBLIC_KEY
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Yuy5TNziNEXIX2Vei1l
mKtqgfevXkUdMfVhDxEXEMNrwX4uU3cye4zpiW2XueBs0wiAUwaF/oGswA7L51Km
ebcDtVr9yMG2Dl/wMIhH55ZzOC1dweb+N5qY8u6H02FpStZou8KUCmQlf1tzvK4Y
sMehFTPXhGzLopA8oPbnQRkoRvL27Dn+QfLxYgnakex7F12XMI56cLcfhSSE+gQ7
z3mbYeIiBTwl9AufxslUy0aobBmKPqaAMq9vPPtkbGUwmyOVVOHuuK2Jq/wjr26z
tzyWjUNznSwHZmP0ISd4+SXJvrSHqJx/M3eTEaOokZH71TlbsHCyDbR8uXkD+uez
LQIDAQAB
-----END PUBLIC KEY-----
```

### Optional Variables (Defaults)

#### SUPPORT_EXOTEL
```
false
```

#### EXO_BRIDGE_ENABLED
```
false
```

#### BUFFER_DURATION_MS
```
3000
```

#### ACK_INTERVAL
```
10
```

---

## Quick Checklist

### Service Setup
- [ ] Service Type: Web Service
- [ ] Root Directory: `services/ingest`
- [ ] Build Command: `cd ../.. && npm ci && cd services/ingest && npm run build`
- [ ] Start Command: `npm run start`
- [ ] Health Check: `/health`
- [ ] Branch: `feat/exotel-deepgram-bridge`

### Environment Variables
- [ ] `REDIS_URL` (required)
- [ ] `PUBSUB_ADAPTER` = `redis_streams` (required)
- [ ] `JWT_PUBLIC_KEY` (required, full PEM key)

### Verification
- [ ] Build completes successfully
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Logs show "Ingestion server listening"

---

**For detailed instructions, see:** `RENDER_INGEST_SERVICE_FRESH_DEPLOYMENT.md`


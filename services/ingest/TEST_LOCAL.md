# 🧪 Local Testing Guide

## Quick Start

### From Any Directory

```bash
# Go to repo root first
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin

# Then go to ingest service
cd services/ingest

# Build and start with environment variables
REDIS_URL='redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304' \
PUBSUB_ADAPTER=redis_streams \
PORT=5000 \
npm run build && npm run start
```

### One-Liner (from repo root)

```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin/services/ingest && \
REDIS_URL='redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304' \
PUBSUB_ADAPTER=redis_streams \
PORT=5000 \
npm run build && npm run start
```

### Using Test Script

```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin/services/ingest
./scripts/test-local.sh
```

## Test Health Endpoint

In another terminal:

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "ingest",
  "pubsub": true,
  "timestamp": "2025-11-07T..."
}
```

## Troubleshooting

### Error: "cd: no such file or directory: services/ingest"
**Solution:** You're not in the repo root. Run:
```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
```

### Error: "Cannot find module 'dist/server.js'"
**Solution:** Build first:
```bash
npm run build
```

### Error: "REDIS_URL is required"
**Solution:** Set the environment variable:
```bash
export REDIS_URL='redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304'
```


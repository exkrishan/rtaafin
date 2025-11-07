# 🧪 Local Testing Command

## Quick Test (One Command)

```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin/services/ingest && \
REDIS_URL='redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304' \
PUBSUB_ADAPTER=redis_streams \
PORT=5000 \
npm run build && npm run start
```

## Step-by-Step Test

### 1. Build lib/pubsub
```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin/lib/pubsub
npm run build
```

### 2. Build ingestion service
```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin/services/ingest
npm run build
```

### 3. Start service
```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin/services/ingest
REDIS_URL='redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304' \
PUBSUB_ADAPTER=redis_streams \
PORT=5000 \
npm run start
```

### 4. Test health endpoint (in another terminal)
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

## Using Test Script

```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin/services/ingest
./scripts/test-local.sh
```

## Expected Output

When the service starts successfully, you should see:
```
[auth] JWT_PUBLIC_KEY loaded, length: 451
[server] Pub/Sub adapter initialized: redis_streams
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', ... }
[server] ✅ Ingestion server listening on port 5000
[server] WebSocket endpoint: ws://localhost:5000/v1/ingest
[server] Health check: http://localhost:5000/health
```

## Troubleshooting

### Error: "Cannot find module"
- **Solution:** Run `npm run build` first

### Error: "REDIS_URL is required"
- **Solution:** Set the REDIS_URL environment variable

### Error: "Port 5000 is already in use"
- **Solution:** Use a different port: `PORT=5001 npm run start`

### Error: "RedisStreamsAdapter is not a constructor"
- **Solution:** Rebuild lib/pubsub: `cd ../../lib/pubsub && npm run build`


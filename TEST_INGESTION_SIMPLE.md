# 🧪 Simple Ingestion Test Guide

## Quick Test (3 Steps)

### Step 1: Generate JWT Token
```bash
node scripts/generate-test-jwt.js
```

Copy the token that's printed (the long string starting with `eyJ...`)

### Step 2: Set the Token
```bash
export JWT_TOKEN="<paste-token-here>"
```

### Step 3: Run the Test
```bash
./services/ingest/scripts/simulate_exotel_client.sh
```

---

## What You Should See

✅ **Success looks like:**
```
Starting Exotel client simulation...
WebSocket URL: ws://localhost:8443/v1/ingest
Connecting to ws://localhost:8443/v1/ingest...
✓ WebSocket connected
Sending start event: {...}
✓ Start acknowledged
Streaming audio frames...
Sent 10/50 frames
✓ Received ACK: seq=10
...
✓ All 50 frames sent
✓ Received 5 ACK messages
Simulation complete!
```

❌ **If you see "401" error:**
- The JWT token validation failed
- Make sure the ingestion service has `JWT_PUBLIC_KEY` set in `.env.local`
- Verify the public key matches: `cat scripts/keys/jwt-public-key.pem`

---

## Troubleshooting

### "Cannot find module 'ws'"
```bash
npm install ws
```

### "401 Unauthorized"
1. Check ingestion service is running: `curl http://localhost:8443/health`
2. Verify JWT_PUBLIC_KEY is set: `grep JWT_PUBLIC_KEY .env.local`
3. Regenerate keys if needed:
   ```bash
   openssl genrsa -out scripts/keys/jwt-private-key.pem 2048
   openssl rsa -in scripts/keys/jwt-private-key.pem -pubout -out scripts/keys/jwt-public-key.pem
   ```

### "Connection refused"
Start the ingestion service:
```bash
cd services/ingest
npm run dev
```

---

## One-Line Test

```bash
JWT_TOKEN=$(node scripts/generate-test-jwt.js 2>/dev/null | grep -v "^✅\|^📋\|^💡\|^$" | head -1 | xargs) && \
export JWT_TOKEN && \
./services/ingest/scripts/simulate_exotel_client.sh
```


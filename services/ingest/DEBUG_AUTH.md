# 🔍 Debugging JWT Authentication

## Current Status

- ✅ JWT token generation works
- ✅ Ingestion service is running
- ❌ Authentication returns 401

## Steps to Debug

### 1. Check Service Logs

When you run the test, check the terminal where the ingestion service is running. You should see:

```
[auth] JWT_PUBLIC_KEY loaded, length: 451
[server] WebSocket upgrade request { hasAuthHeader: true, authHeaderPrefix: 'Bearer eyJhbGciOiJSU...' }
[server] Authentication successful { tenant_id: 'test-tenant', ... }
```

If you see errors, note them.

### 2. Verify JWT Key Format

```bash
# Check the key in .env.local
grep JWT_PUBLIC_KEY ../../.env.local | head -c 100

# The key should have \n for newlines, like:
# JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG...\n-----END PUBLIC KEY-----"
```

### 3. Test Token Validation Manually

```bash
cd services/ingest

# Generate token
JWT_TOKEN=$(node scripts/generate-test-jwt.js 2>/dev/null | grep -v "^✅\|^📋\|^💡\|^$" | head -1 | xargs)

# Test validation
node -e "
require('dotenv').config({path:'../../.env.local'});
const jwt = require('jsonwebtoken');
let pubKey = process.env.JWT_PUBLIC_KEY || '';
if (pubKey.startsWith('\"') && pubKey.endsWith('\"')) {
  pubKey = pubKey.slice(1, -1);
}
pubKey = pubKey.replace(/\\\\n/g, '\n');
const token = '$JWT_TOKEN';
try {
  const decoded = jwt.verify(token, pubKey, { algorithms: ['RS256'] });
  console.log('✅ Token is valid!');
} catch(e) {
  console.log('❌ Failed:', e.message);
}
"
```

### 4. Check WebSocket Headers

The WebSocket library should pass the Authorization header. Verify it's being sent:

```bash
# Use the test script
node test-jwt-connection.js
```

## Common Issues

### Issue: JWT_PUBLIC_KEY not loaded
**Solution**: Make sure `.env.local` is in the project root and the service loads it:
```typescript
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env.local') });
```

### Issue: Key format wrong (quotes/newlines)
**Solution**: The auth.ts now handles this automatically, but verify the key format in `.env.local`

### Issue: Token not being sent
**Solution**: Verify the WebSocket client is setting the Authorization header:
```javascript
const ws = new WebSocket('ws://localhost:8443/v1/ingest', {
  headers: {
    'Authorization': `Bearer ${JWT_TOKEN}`,
  },
});
```

## Next Steps

1. Run the test and check service logs
2. If still failing, share the error message from service logs
3. Verify the JWT_PUBLIC_KEY format matches what's expected


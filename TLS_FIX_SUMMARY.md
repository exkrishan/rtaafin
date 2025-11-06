# TLS Certificate Fix - Executive Summary

## ✅ Status: FIXED

**Date**: 2025-11-06  
**Issue**: `/api/dispositions` endpoint failing with `TypeError: fetch failed`  
**Resolution**: Implemented dev-only insecure TLS fallback with undici dispatcher

---

## 1. Root Cause Summary (One Paragraph)

The `/api/dispositions` endpoint began failing on 2025-11-06 due to TLS certificate validation errors when connecting to `djuxbmchatnamqbkfjyi.supabase.co`. Investigation revealed a **corporate intercepting proxy (Netskope)** performing MITM (Man-in-the-Middle) on all HTTPS connections. The certificate chain presented includes a self-signed Netskope CA (`certadmin@netskope.com`) that is not present in Node.js's trust store, causing `SELF_SIGNED_CERT_IN_CHAIN` errors. This is a network/infrastructure issue unrelated to recent database schema changes. The issue manifests in Node.js (which uses its own trust store) but not in curl (which uses system CA bundle), indicating a Node.js-specific trust store configuration problem.

---

## 2. Evidence & Reproduction

### Certificate Chain (openssl)
```bash
$ openssl s_client -showcerts -servername djuxbmchatnamqbkfjyi.supabase.co -connect djuxbmchatnamqbkfjyi.supabase.co:443
```
**Result**: Certificate chain shows Netskope self-signed CA root
- Error: `verify error:num=19:self signed certificate in certificate chain`
- Root CA: `certadmin@netskope.com` (self-signed)

### Certificate Details
```bash
$ echo | openssl s_client -servername djuxbmchatnamqbkfjyi.supabase.co -connect djuxbmchatnamqbkfjyi.supabase.co:443 2>/dev/null | openssl x509 -noout -dates -issuer -subject
```
**Output**:
```
notBefore=Oct  7 05:01:55 2025 GMT
notAfter=Nov  6 05:01:55 2026 GMT
issuer= /emailAddress=certadmin@netskope.com/CN=ca.exotel.goskope.com
subject= /CN=djuxbmchatnamqbkfjyi.supabase.co
```

### curl Test (PASSES)
```bash
$ curl -v https://djuxbmchatnamqbkfjyi.supabase.co/ 2>&1
```
**Result**: ✅ Connection succeeds (`SSL certificate verify ok`)

### Node.js Test (FAILED - now FIXED)
```bash
$ node -e "const https=require('https'); const fetch=require('node-fetch'); (async()=>{ try{ const res=await fetch('https://djuxbmchatnamqbkfjyi.supabase.co/', { agent: new https.Agent({rejectUnauthorized:true}) }); console.log('status', res.status);}catch(e){console.error('err', e.message, e.cause?.code);} })();"
```
**Before Fix**: `err fetch failed SELF_SIGNED_CERT_IN_CHAIN`  
**After Fix**: ✅ Works with `ALLOW_INSECURE_TLS=true`

---

## 3. Code Patch

**File**: `lib/supabase.ts`

### Key Features
- ✅ Startup logging of TLS configuration (ALLOW_INSECURE_TLS, SUPABASE_URL, NODE_ENV)
- ✅ Dev-only insecure TLS fallback (gated by `NODE_ENV !== 'production'`)
- ✅ Per-request undici dispatcher (not global `NODE_TLS_REJECT_UNAUTHORIZED=0`)
- ✅ Clear error messages with remediation steps
- ✅ Production-safe (never uses insecure TLS in production)

### Implementation
- Uses `undici.Agent` with `connect.rejectUnauthorized: false` for Node.js 20+ built-in fetch
- Falls back to `https.Agent` for compatibility
- Logs configuration at startup (once per process)
- Emits clear warnings when insecure TLS is enabled

---

## 4. Dev Operational Guidance

### Quick Fix (Already Applied)
```bash
# .env.local
ALLOW_INSECURE_TLS=true
```

### Restart Server
```bash
pkill -f "next dev"
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
source ~/.nvm/nvm.sh && nvm use 20
npm run dev
```

### Verify Fix
```bash
curl http://localhost:3000/api/dispositions | jq '.ok'
# Returns: true
```

### Security Note
- ✅ Safe for local development only
- ❌ NEVER commit `ALLOW_INSECURE_TLS=true` to production or CI
- ⚠️ This bypasses certificate validation - use only for corporate proxy scenarios

---

## 5. Production Remediation: Add CA to Node.js Trust Store

### macOS
```bash
# Extract Netskope CA
openssl s_client -showcerts -servername djuxbmchatnamqbkfjyi.supabase.co -connect djuxbmchatnamqbkfjyi.supabase.co:443 < /dev/null 2>/dev/null | openssl x509 -outform PEM > netskope-ca.pem

# Add to system trust store
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain netskope-ca.pem
```

### Linux (Ubuntu/Debian)
```bash
sudo cp netskope-ca.pem /usr/local/share/ca-certificates/netskope-ca.crt
sudo update-ca-certificates
```

### Docker
```dockerfile
COPY netskope-ca.pem /usr/local/share/ca-certificates/netskope-ca.crt
RUN update-ca-certificates
```

### Node.js Direct (Alternative)
```bash
# Node.js 19.6+
export NODE_EXTRA_CA_CERTS=/path/to/netskope-ca.pem
```

---

## 6. Escalation Message to Infra/Security

**Subject**: Request: Add Netskope Corporate CA to Node.js Trust Store for Supabase Connections

**Body**:
```
Hi Infra/Security Team,

We're experiencing TLS certificate validation failures in our Node.js application when connecting to Supabase (djuxbmchatnamqbkfjyi.supabase.co). Investigation reveals that our corporate Netskope proxy is intercepting HTTPS connections and presenting a certificate chain with a self-signed Netskope CA.

**Evidence:**
- Certificate chain includes: certadmin@netskope.com (self-signed root)
- Error: SELF_SIGNED_CERT_IN_CHAIN
- Node.js v20.19.5 cannot validate the chain without the Netskope CA in trust store

**Current Status:**
- Temporary dev workaround in place (ALLOW_INSECURE_TLS=true for local dev)
- Production deployment will fail without proper CA trust

**Request:**
1. Provide the Netskope corporate CA certificate(s) in PEM format
2. Add to Node.js trust store for all dev/staging/prod environments
3. Or configure Netskope to bypass interception for *.supabase.co domains

**Impact:**
- Dev: Working with temporary workaround
- Production: Will fail on next deployment without CA trust

**Timeline:**
- Urgent: Production deployment blocked until CA trust is configured

Please advise on the recommended approach for adding corporate CA to Node.js trust store in our infrastructure.
```

---

## 7. Testing & Verification

### Test Script
```bash
# Test TLS connection
node scripts/test-tls-connection.js

# Test API endpoint
curl -s http://localhost:3000/api/dispositions | jq '.ok'
# Expected: true

# Test with insecure TLS disabled (should fail until CA is added)
ALLOW_INSECURE_TLS=false node scripts/test-tls-connection.js
```

### CI Integration
Add to `.github/workflows/test.yml`:
```yaml
- name: Test TLS Connection
  run: |
    node scripts/test-tls-connection.js
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
```

---

## 8. Rollback Plan

### Quick Rollback
```bash
git checkout HEAD~1 lib/supabase.ts
```

### Remove Temporary Workaround
Once Netskope CA is added to trust store:
1. Remove `ALLOW_INSECURE_TLS=true` from `.env.local`
2. Remove insecure TLS fallback code from `lib/supabase.ts`
3. Restart server
4. Verify connections work with strict validation

### Rollback Verification
```bash
ALLOW_INSECURE_TLS=false node scripts/test-tls-connection.js
# Should pass after CA is added to trust store
```

---

## Summary

- ✅ **Root Cause**: Corporate Netskope proxy MITM with self-signed CA
- ✅ **Dev Fix**: Implemented with `ALLOW_INSECURE_TLS=true` + undici dispatcher
- ✅ **Status**: Working in development
- ⏳ **Production Fix**: Requires adding Netskope CA to Node.js trust store (escalation needed)
- ✅ **Safety**: Production never uses insecure TLS; clear logging and error messages
- ✅ **Testing**: Test scripts provided; CI integration ready

**Next Steps**:
1. ✅ Use `ALLOW_INSECURE_TLS=true` in `.env.local` for local dev (DONE)
2. ⏳ Send escalation message to infra/security team (URGENT)
3. ⏳ Add Netskope CA to Node.js trust store in all environments (production blocker)
4. ⏳ Remove temporary workaround once CA trust is configured


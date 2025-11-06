# TLS Certificate Issue - Remediation Report
**Date**: 2025-11-06  
**Issue**: `/api/dispositions` endpoint failing with `TypeError: fetch failed`  
**Status**: ✅ Root cause identified, dev fix implemented, production remediation required

---

## 1. Root Cause Summary

The `/api/dispositions` endpoint began failing on 2025-11-06 due to TLS certificate validation errors when connecting to `djuxbmchatnamqbkfjyi.supabase.co`. Investigation revealed a **corporate intercepting proxy (Netskope)** is performing MITM (Man-in-the-Middle) on all HTTPS connections. The certificate chain presented includes a self-signed Netskope CA (`certadmin@netskope.com`) that is not present in Node.js's trust store, causing `SELF_SIGNED_CERT_IN_CHAIN` errors. This is a network/infrastructure issue, not related to recent database schema changes. The issue manifests in Node.js but not in curl (which uses system CA bundle), indicating a Node.js-specific trust store configuration problem.

---

## 2. Evidence & Reproduction

### Certificate Chain Analysis
```bash
$ openssl s_client -showcerts -servername djuxbmchatnamqbkfjyi.supabase.co -connect djuxbmchatnamqbkfjyi.supabase.co:443
```
**Output**: Certificate chain shows:
- Server cert: `CN=djuxbmchatnamqbkfjyi.supabase.co` (issued by `ca.exotel.goskope.com`)
- Intermediate: `ca.exotel.goskope.com` (Netskope/Exotel)
- Root: `certadmin@netskope.com` (self-signed Netskope CA)
- **Error**: `verify error:num=19:self signed certificate in certificate chain`

### Certificate Details
```bash
$ echo | openssl s_client -servername djuxbmchatnamqbkfjyi.supabase.co -connect djuxbmchatnamqbkfjyi.supabase.co:443 2>/dev/null | openssl x509 -noout -dates -issuer -subject
```
**Output**:
- Validity: Oct 7 05:01:55 2025 GMT to Nov 6 05:01:55 2026 GMT
- Issuer: `emailAddress=certadmin@netskope.com/CN=ca.exotel.goskope.com`
- Subject: `CN=djuxbmchatnamqbkfjyi.supabase.co`

### curl Test (PASSES - uses system CA)
```bash
$ curl -v https://djuxbmchatnamqbkfjyi.supabase.co/ 2>&1
```
**Result**: ✅ Connection succeeds (200/404), `SSL certificate verify ok`

### Node.js Test (FAILS - uses Node.js trust store)
```bash
$ node -e "const https=require('https'); const fetch=require('node-fetch'); (async()=>{ try{ const res=await fetch('https://djuxbmchatnamqbkfjyi.supabase.co/', { agent: new https.Agent({rejectUnauthorized:true}) }); console.log('status', res.status);}catch(e){console.error('err', e.message, e.cause?.code);} })();"
```
**Output**: `err fetch failed SELF_SIGNED_CERT_IN_CHAIN`

### Node Version
```bash
$ node -v
v20.19.5
```

---

## 3. Code Patch

**File**: `lib/supabase.ts`

The patch implements:
- ✅ Startup logging of TLS configuration (ALLOW_INSECURE_TLS, SUPABASE_URL, NODE_ENV)
- ✅ Dev-only insecure TLS fallback (gated by `NODE_ENV !== 'production'`)
- ✅ Per-request HTTPS agent (not global `NODE_TLS_REJECT_UNAUTHORIZED=0`)
- ✅ Clear error messages with remediation steps
- ✅ Production-safe (never uses insecure TLS in production)

**Key Changes**:
1. Logs configuration at startup (once per process)
2. Uses `ALLOW_INSECURE_TLS=true` + `NODE_ENV !== 'production'` gates
3. Creates per-request `https.Agent({ rejectUnauthorized: false })` only for Supabase URLs
4. Provides clear error messages with root cause explanation

---

## 4. Dev Operational Guidance

### Quick Dev Fix (Temporary)
Add to `.env.local`:
```bash
ALLOW_INSECURE_TLS=true
```

Then restart the dev server:
```bash
# Kill existing server
pkill -f "next dev"

# Restart
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
source ~/.nvm/nvm.sh && nvm use 20
npm run dev
```

### Security Note
- ✅ Safe for local development only
- ❌ NEVER commit `ALLOW_INSECURE_TLS=true` to production or CI
- ⚠️ This bypasses certificate validation - use only for corporate proxy scenarios

### Verify Fix
```bash
curl http://localhost:3000/api/dispositions | jq '.ok'
# Should return: true
```

---

## 5. Production Remediation: Add CA to Node.js Trust Store

### macOS (Homebrew)
```bash
# Extract Netskope CA from certificate chain
openssl s_client -showcerts -servername djuxbmchatnamqbkfjyi.supabase.co -connect djuxbmchatnamqbkfjyi.supabase.co:443 < /dev/null 2>/dev/null | openssl x509 -outform PEM > netskope-ca.pem

# Find Node.js CA bundle location
node -e "console.log(require('tls').rootCertificates.length + ' root CAs')"
# Typically: /usr/local/etc/ca-certificates or /opt/homebrew/etc/ca-certificates

# Add CA to system trust store (requires admin)
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain netskope-ca.pem

# Or add to Node.js CA bundle directly
# Find Node.js install location:
which node
# Example: /Users/username/.nvm/versions/node/v20.19.5/bin/node
# CA bundle: /Users/username/.nvm/versions/node/v20.19.5/lib/node_modules/npm/node_modules/cacache/...
```

### Linux (Ubuntu/Debian)
```bash
# Extract Netskope CA
openssl s_client -showcerts -servername djuxbmchatnamqbkfjyi.supabase.co -connect djuxbmchatnamqbkfjyi.supabase.co:443 < /dev/null 2>/dev/null | openssl x509 -outform PEM > netskope-ca.pem

# Add to system CA bundle
sudo cp netskope-ca.pem /usr/local/share/ca-certificates/netskope-ca.crt
sudo update-ca-certificates

# Verify
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt netskope-ca.pem
```

### Docker
```dockerfile
# Add to Dockerfile
COPY netskope-ca.pem /usr/local/share/ca-certificates/netskope-ca.crt
RUN update-ca-certificates

# Or use NODE_EXTRA_CA_CERTS (Node.js 19.6+)
ENV NODE_EXTRA_CA_CERTS=/path/to/netskope-ca.pem
```

### Node.js Direct (Alternative)
```bash
# Set NODE_EXTRA_CA_CERTS environment variable (Node.js 19.6+)
export NODE_EXTRA_CA_CERTS=/path/to/netskope-ca.pem

# Or use --use-openssl-ca flag (if Node.js built with OpenSSL)
node --use-openssl-ca app.js
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

**Certificate Chain Output (attached):**
[Attach openssl output from section 2]

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
Create `scripts/test-tls-connection.js`:
```javascript
const https = require('https');
const fetch = require('node-fetch');

async function testConnection() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://djuxbmchatnamqbkfjyi.supabase.co';
  
  try {
    // Test with strict validation
    const res = await fetch(url, {
      agent: new https.Agent({ rejectUnauthorized: true })
    });
    console.log('✅ PASS: Strict TLS validation succeeded');
    return true;
  } catch (err) {
    if (err.cause?.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
      console.log('❌ FAIL: SELF_SIGNED_CERT_IN_CHAIN (corporate proxy detected)');
      console.log('   Fix: Add Netskope CA to Node.js trust store');
      return false;
    }
    throw err;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
```

### Run Tests
```bash
# Test TLS connection
node scripts/test-tls-connection.js

# Test API endpoint
curl -s http://localhost:3000/api/dispositions | jq '.ok'
# Expected: true

# Test with insecure TLS disabled (should fail)
ALLOW_INSECURE_TLS=false node scripts/test-tls-connection.js
```

### CI Integration
Add to `.github/workflows/test.yml` or similar:
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
If the fix causes issues, revert `lib/supabase.ts`:
```bash
git checkout HEAD~1 lib/supabase.ts
```

### Remove Temporary Workaround
Once Netskope CA is added to trust store:
1. Remove `ALLOW_INSECURE_TLS=true` from `.env.local`
2. Remove the insecure TLS fallback code from `lib/supabase.ts`
3. Restart server
4. Verify connections work with strict validation

### Rollback Verification
```bash
# Verify strict validation works
ALLOW_INSECURE_TLS=false node scripts/test-tls-connection.js
# Should pass after CA is added to trust store
```

---

## Summary

- ✅ **Root Cause**: Corporate Netskope proxy MITM with self-signed CA
- ✅ **Dev Fix**: Implemented with `ALLOW_INSECURE_TLS=true` gated by `NODE_ENV !== 'production'`
- ⏳ **Production Fix**: Requires adding Netskope CA to Node.js trust store (escalation needed)
- ✅ **Safety**: Production never uses insecure TLS; clear logging and error messages
- ✅ **Testing**: Test scripts provided; CI integration ready

**Next Steps**:
1. Use `ALLOW_INSECURE_TLS=true` in `.env.local` for local dev (immediate)
2. Send escalation message to infra/security team (urgent)
3. Add Netskope CA to Node.js trust store in all environments (production blocker)
4. Remove temporary workaround once CA trust is configured


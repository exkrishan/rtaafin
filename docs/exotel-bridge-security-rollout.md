# Exotel → Deepgram Bridge: Security Verification & Rollout Plan

## Security Verification Checklist

### 1. WebSocket Security (TLS/SSL)

**Current Status:** ⚠️ **REQUIRES CONFIGURATION**

The ingest service supports TLS/SSL via environment variables:
- `SSL_KEY_PATH` - Path to SSL private key
- `SSL_CERT_PATH` - Path to SSL certificate

**Verification Steps:**

1. **Check TLS Configuration:**
   ```bash
   # Verify SSL certificates are configured
   echo $SSL_KEY_PATH
   echo $SSL_CERT_PATH
   
   # Test TLS connection
   openssl s_client -connect your-domain.com:8443 -starttls
   ```

2. **Production Requirements:**
   - [ ] Valid SSL certificate from trusted CA (Let's Encrypt, etc.)
   - [ ] Certificate not expired
   - [ ] Certificate matches domain name
   - [ ] TLS 1.2 or higher enforced
   - [ ] Strong cipher suites only

3. **Configuration:**
   ```bash
   # In production environment
   export SSL_KEY_PATH=/path/to/private-key.pem
   export SSL_CERT_PATH=/path/to/certificate.pem
   export PORT=8443  # Standard HTTPS port
   ```

**Action Items:**
- [ ] Obtain SSL certificate for production domain
- [ ] Configure SSL paths in production environment
- [ ] Test WSS (WebSocket Secure) connection
- [ ] Verify certificate chain is valid

---

### 2. IP Allowlist / Firewall Rules

**Current Status:** ⚠️ **NOT IMPLEMENTED**

The service currently accepts connections from any IP address. For production, implement IP allowlisting.

**Recommended Implementation:**

1. **Option A: Network-Level (Recommended)**
   - Use load balancer (AWS ALB, GCP LB, etc.) with IP allowlist rules
   - Configure firewall rules at infrastructure level
   - Whitelist only Exotel IP ranges

2. **Option B: Application-Level**
   - Add IP validation in `services/ingest/src/server.ts`
   - Check `req.socket.remoteAddress` against allowed IPs
   - Reject connections from unauthorized IPs

**Exotel IP Ranges (Example - Verify with Exotel):**
```
# Example IP ranges (verify with Exotel support)
52.84.0.0/16
54.230.0.0/16
# Add all Exotel IP ranges
```

**Implementation Example:**
```typescript
// In services/ingest/src/server.ts
const ALLOWED_IPS = process.env.ALLOWED_IPS?.split(',') || [];

function isAllowedIP(ip: string): boolean {
  if (ALLOWED_IPS.length === 0) return true; // Allow all if not configured
  return ALLOWED_IPS.some(allowed => {
    // Simple prefix match (enhance with CIDR parsing if needed)
    return ip.startsWith(allowed);
  });
}

// In WebSocket upgrade handler
const clientIP = req.socket.remoteAddress;
if (!isAllowedIP(clientIP)) {
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('Forbidden: IP not allowed');
  return;
}
```

**Action Items:**
- [ ] Obtain Exotel IP ranges from Exotel support
- [ ] Configure IP allowlist (network or application level)
- [ ] Test connection from allowed IP
- [ ] Test rejection from unauthorized IP
- [ ] Document IP ranges in runbook

---

### 3. Authentication & Authorization

**Current Status:** ✅ **IMPLEMENTED**

JWT authentication is already implemented:
- RS256 signature verification
- Token validation on connection

**Verification Steps:**

1. **Test Valid Token:**
   ```bash
   # Generate test token
   cd services/ingest/scripts
   node generate-test-jwt.js
   
   # Test connection with token
   # (Use WebSocket client with Authorization header)
   ```

2. **Test Invalid Token:**
   - Connection should be rejected
   - Appropriate error logged

3. **Test Expired Token:**
   - Connection should be rejected
   - Error message indicates expiration

**Action Items:**
- [ ] Verify JWT public key is correctly configured
- [ ] Test token validation
- [ ] Verify expired tokens are rejected
- [ ] Document token generation process

---

### 4. Rate Limiting

**Current Status:** ⚠️ **NOT IMPLEMENTED**

**Recommendations:**

1. **Connection Rate Limiting:**
   - Limit connections per IP
   - Limit connections per tenant
   - Use token bucket or sliding window algorithm

2. **Frame Rate Limiting:**
   - Limit audio frames per second
   - Prevent DoS via excessive frame sending

**Implementation Priority:** Medium (can be added post-launch)

---

### 5. Input Validation

**Current Status:** ✅ **PARTIALLY IMPLEMENTED**

**Current Validations:**
- ✅ Audio format validation (PCM16, sample rate, channels)
- ✅ Base64 decoding validation
- ✅ Event type validation

**Additional Recommendations:**
- [ ] Validate interaction_id format
- [ ] Validate tenant_id format
- [ ] Validate frame sequence numbers
- [ ] Enforce maximum frame size

---

## Rollback Plan

### Quick Rollback (Feature Flag)

**Time to Rollback:** < 1 minute

**Steps:**

1. **Disable Bridge in Ingest Service:**
   ```bash
   # Set environment variable
   export EXO_BRIDGE_ENABLED=false
   
   # Restart service
   # (Method depends on deployment platform)
   ```

2. **Disable Bridge in ASR Worker:**
   ```bash
   export EXO_BRIDGE_ENABLED=false
   # Restart service
   ```

3. **Verify Rollback:**
   ```bash
   # Check health endpoints
   curl http://ingest-service/health | jq '.exotelBridge'
   # Should show: "disabled"
   
   curl http://asr-worker/health | jq '.deepgram'
   # Should show normal operation
   ```

4. **Monitor:**
   - Verify normal operation resumes
   - Check error rates return to baseline
   - Confirm no impact on existing features

**Rollback Triggers:**
- Error rate > 5%
- Latency > 5 seconds
- Service degradation
- Security incident
- Customer-reported issues

---

### Full Rollback (Code Revert)

**Time to Rollback:** 5-15 minutes (depending on deployment)

**Steps:**

1. **Revert Code Changes:**
   ```bash
   # Revert to previous commit
   git revert <commit-hash>
   # Or
   git reset --hard <previous-commit>
   ```

2. **Redeploy Services:**
   - Deploy reverted code
   - Verify services start correctly
   - Check health endpoints

3. **Verify Normal Operation:**
   - Test existing features
   - Monitor error rates
   - Confirm no regressions

---

## Rollout Plan

### Phase 1: Internal Testing (Week 1)

**Objective:** Validate feature in controlled environment

**Steps:**
1. Deploy to staging environment
2. Run smoke tests
3. Perform manual acceptance testing
4. Monitor for 48 hours
5. Document any issues

**Success Criteria:**
- ✅ All smoke tests pass
- ✅ No critical errors
- ✅ Latency within acceptable range
- ✅ Resource usage normal

---

### Phase 2: Limited Production (Week 2)

**Objective:** Test with small subset of traffic

**Steps:**
1. Enable feature flag for 10% of traffic
2. Monitor metrics closely
3. Watch for errors or anomalies
4. Gradually increase to 50% if stable

**Success Criteria:**
- ✅ Error rate < 1%
- ✅ Latency < 2 seconds
- ✅ No customer complaints
- ✅ Resource usage acceptable

---

### Phase 3: Full Production (Week 3)

**Objective:** Enable for all traffic

**Steps:**
1. Enable feature flag for 100% of traffic
2. Monitor for 24 hours
3. Continue monitoring for 1 week
4. Document any issues

**Success Criteria:**
- ✅ All metrics within acceptable range
- ✅ No increase in error rates
- ✅ Customer satisfaction maintained
- ✅ Performance targets met

---

## Monitoring & Alerting

### Key Metrics to Monitor

1. **Ingest Service:**
   - Connection count
   - Frame processing rate
   - Buffer drops
   - Publish failures
   - Error rate

2. **ASR Worker:**
   - Deepgram connection count
   - Audio chunks sent
   - Transcripts received
   - Average latency
   - Error rate

3. **System Health:**
   - CPU usage
   - Memory usage
   - Network throughput
   - Redis pub/sub health

### Alert Thresholds

**Critical Alerts:**
- Error rate > 5%
- Service unavailable
- Latency > 5 seconds
- Connection failures > 10%

**Warning Alerts:**
- Error rate > 1%
- Latency > 2 seconds
- Buffer drops > 0
- High CPU/Memory usage

### Alert Channels

- [ ] PagerDuty / On-call system
- [ ] Slack / Teams notifications
- [ ] Email alerts for critical issues
- [ ] Dashboard for real-time monitoring

---

## Post-Rollout Checklist

After successful rollout:

- [ ] Document production configuration
- [ ] Update runbook with production IPs
- [ ] Create monitoring dashboards
- [ ] Set up alerting rules
- [ ] Schedule post-mortem review (1 week)
- [ ] Gather customer feedback
- [ ] Document lessons learned
- [ ] Update documentation

---

## Emergency Contacts

**On-Call Engineer:**
- Name: [TBD]
- Phone: [TBD]
- Email: [TBD]

**Exotel Support:**
- Support Portal: [TBD]
- Emergency: [TBD]

**Deepgram Support:**
- Support Email: [TBD]
- Status Page: https://status.deepgram.com

---

## Appendix: Security Best Practices

### 1. Secrets Management

- [ ] Use secret management service (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] Never commit secrets to code
- [ ] Rotate API keys regularly
- [ ] Use least-privilege access

### 2. Network Security

- [ ] Use VPC/private networks where possible
- [ ] Implement network segmentation
- [ ] Use VPN for administrative access
- [ ] Enable DDoS protection

### 3. Logging & Auditing

- [ ] Log all connection attempts
- [ ] Log authentication failures
- [ ] Log security events
- [ ] Retain logs for compliance period
- [ ] Monitor for suspicious activity

### 4. Compliance

- [ ] Verify GDPR compliance (if applicable)
- [ ] Verify HIPAA compliance (if applicable)
- [ ] Document data retention policies
- [ ] Implement data encryption at rest

---

## Sign-off

**Security Review:**
- Reviewed by: [Name]
- Date: [Date]
- Status: ✅ Approved / ❌ Needs Changes

**Operations Review:**
- Reviewed by: [Name]
- Date: [Date]
- Status: ✅ Approved / ❌ Needs Changes

**Ready for Production:**
- [ ] Security checklist complete
- [ ] Rollback plan tested
- [ ] Monitoring configured
- [ ] Alerting configured
- [ ] Documentation complete
- [ ] Team trained

**Final Approval:**
- Approved by: [Name]
- Date: [Date]






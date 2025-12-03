# Security Review & Compliance

This document reviews authentication, authorization, and data privacy compliance for the agent copilot module.

## Authentication

### Exotel Connection Authentication

**Location:** `services/ingest/src/server.ts`, `services/ingest/src/auth.ts`

**Methods Supported:**
1. **IP Whitelisting** (Recommended for Exotel)
   - Exotel IPs whitelisted in firewall/load balancer
   - No credentials needed in URL

2. **Basic Authentication**
   - Format: `wss://API_KEY:API_TOKEN@domain.com/v1/ingest`
   - Exotel sends: `Authorization: Basic base64(API_KEY:API_TOKEN)`

3. **JWT Bearer Token** (For custom clients)
   - Format: `Authorization: Bearer <JWT_TOKEN>`
   - Token validated against secret

**Configuration:**
- `SUPPORT_EXOTEL=true`: Enables Exotel protocol (no auth required if IP whitelisted)
- JWT secret: Configured in environment variables

### Frontend API Authentication

**Current Status:** No authentication required (development)

**Production Recommendations:**
- Implement API key authentication
- Use JWT tokens for user sessions
- Rate limiting per API key/user

## Authorization

### Service-to-Service Communication

**Current Status:** Services communicate via Redis pub/sub (internal network)

**Security:**
- Redis should be on private network
- Redis authentication enabled (if exposed)
- No external access to Redis

### API Endpoint Access

**Current Status:** All endpoints publicly accessible

**Production Recommendations:**
- Implement authentication middleware
- Use role-based access control (RBAC)
- Restrict sensitive endpoints (e.g., `/api/debug/*`)

## Data Privacy

### Data Encryption

#### In Transit
- **WebSocket**: WSS (TLS) for production
- **HTTP**: HTTPS for all API calls
- **Redis**: Redis over TLS (rediss://) for production

#### At Rest
- **Database**: Supabase encrypts data at rest
- **Logs**: Sensitive data should be redacted
- **API Keys**: Stored as environment variables (never in code)

### PII Handling

**Data Collected:**
- Phone numbers (from/to)
- Call transcripts (may contain PII)
- Customer information

**Compliance Requirements:**
1. **Data Minimization**: Only collect necessary data
2. **Data Retention**: Implement retention policies
3. **Data Deletion**: Provide data deletion capabilities
4. **Access Control**: Limit access to sensitive data
5. **Audit Logging**: Log access to sensitive data

### Logging Best Practices

**Do NOT log:**
- Full API keys
- Passwords
- Full phone numbers (mask last 4 digits)
- Full transcripts in error logs (use previews)

**Do log:**
- Call IDs (interaction IDs)
- Timestamps
- Error messages (sanitized)
- Service events

**Example:**
```typescript
// ❌ Bad
console.log('API Key:', process.env.ELEVENLABS_API_KEY);

// ✅ Good
console.log('API Key configured:', !!process.env.ELEVENLABS_API_KEY);

// ❌ Bad
console.log('Phone:', customer.phone);

// ✅ Good
console.log('Phone:', maskPhoneNumber(customer.phone));
```

## API Key Security

### Storage

**Environment Variables:**
- Never commit to version control
- Use `.env.local` for local (gitignored)
- Use deployment platform secrets for production

### Rotation

**Best Practices:**
1. Rotate API keys regularly (every 90 days)
2. Use separate keys for dev/staging/prod
3. Monitor API key usage
4. Revoke compromised keys immediately

### Access Control

**API Key Permissions:**
- Use least-privilege access
- Limit API key scopes
- Monitor API key usage
- Set rate limits per key

## Network Security

### Firewall Rules

**Recommended:**
- Whitelist Exotel IPs only
- Block all other external access to ingest service
- Use private network for service-to-service communication
- Restrict Redis access to internal network only

### SSL/TLS Configuration

**Required for Production:**
- Valid SSL certificates
- TLS 1.2+ only
- Certificate rotation
- HSTS headers

## Database Security

### Supabase Security

**Configuration:**
- Use Row Level Security (RLS) policies
- Limit service role key access
- Use connection pooling
- Enable audit logging

### Data Access

**Best Practices:**
1. Use parameterized queries (prevent SQL injection)
2. Validate all inputs
3. Limit database user permissions
4. Regular security audits

## Compliance

### GDPR Compliance

**Requirements:**
1. **Right to Access**: Provide data export
2. **Right to Erasure**: Implement data deletion
3. **Data Portability**: Export data in standard format
4. **Privacy by Design**: Minimize data collection

### Implementation Checklist

- [ ] Data minimization implemented
- [ ] Data retention policies configured
- [ ] Data deletion capabilities available
- [ ] Privacy policy published
- [ ] User consent obtained (if required)
- [ ] Data processing agreements in place

## Security Checklist

### Authentication & Authorization

- [ ] Exotel authentication configured (IP whitelist or Basic Auth)
- [ ] JWT tokens validated (if used)
- [ ] API keys stored securely
- [ ] Service-to-service communication secured
- [ ] Frontend API authentication implemented (production)

### Data Protection

- [ ] Data encrypted in transit (TLS/SSL)
- [ ] Data encrypted at rest (database)
- [ ] PII handling compliant
- [ ] Logs sanitized (no sensitive data)
- [ ] API keys never logged

### Network Security

- [ ] Firewall rules configured
- [ ] Redis on private network
- [ ] SSL/TLS certificates valid
- [ ] CORS configured correctly

### Compliance

- [ ] GDPR requirements met (if applicable)
- [ ] Data retention policies set
- [ ] Data deletion capabilities available
- [ ] Privacy policy published
- [ ] Security audit completed

## Security Recommendations

### Immediate Actions

1. **Enable Redis Authentication**: Set password for Redis
2. **Implement API Authentication**: Add auth to frontend APIs
3. **Sanitize Logs**: Remove sensitive data from logs
4. **Enable TLS**: Use WSS/HTTPS for all connections
5. **Restrict Access**: Use firewall rules to limit access

### Future Enhancements

1. **Rate Limiting**: Implement per-user/IP rate limits
2. **Audit Logging**: Log all access to sensitive data
3. **Security Monitoring**: Set up security event monitoring
4. **Penetration Testing**: Regular security audits
5. **Incident Response Plan**: Document security incident procedures

## Security Testing

### Vulnerability Scanning

Run security scans:
```bash
npm audit
```

### Security Review Checklist

- [ ] No hardcoded secrets in code
- [ ] All API keys in environment variables
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (input sanitization)
- [ ] CSRF protection (if needed)
- [ ] Rate limiting implemented
- [ ] Error messages don't leak sensitive info

## Incident Response

### Security Incident Procedure

1. **Identify**: Detect security incident
2. **Contain**: Isolate affected systems
3. **Eradicate**: Remove threat
4. **Recover**: Restore normal operations
5. **Document**: Record incident details
6. **Review**: Post-incident review

### Contact Information

- **Security Team**: [Contact info]
- **On-Call Engineer**: [Contact info]
- **Management**: [Contact info]


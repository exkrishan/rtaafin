# 🔧 Redis Authentication Troubleshooting

## Issue: WRONGPASS invalid username-password pair

This error means Redis Cloud is rejecting the authentication credentials.

## Possible Causes

1. **Wrong username**: Redis Cloud might not use "default" as username
2. **Wrong password**: Password might be incorrect
3. **URL format**: Connection string format might be wrong

## Solutions

### Solution 1: Try Without Username (Password Only)

Some Redis Cloud instances only need the password:

```bash
# Format: redis://:password@host:port
REDIS_URL=redis://:Aevf85dre89oi6bnvf0wh0gpu9j2bufndnwjb1marb5v2c1ief@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
```

### Solution 2: Check Redis Cloud Dashboard

1. Go to Redis Cloud dashboard
2. Find your database connection details
3. Look for the **exact connection string** format
4. It might show:
   - `redis://default:password@host:port` (with default)
   - `redis://:password@host:port` (password only)
   - `redis://username:password@host:port` (custom username)

### Solution 3: Verify Password

1. Check Redis Cloud dashboard
2. Go to your database → Security/Access Control
3. Verify the password is correct
4. If unsure, reset the password and update `.env.local`

### Solution 4: Use Redis CLI to Test

Test the connection directly:

```bash
# With username
redis-cli -h redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com -p 12304 -a Aevf85dre89oi6bnvf0wh0gpu9j2bufndnwjb1marb5v2c1ief ping

# Without username (if Redis Cloud doesn't require it)
redis-cli -h redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com -p 12304 --no-auth-warning -a Aevf85dre89oi6bnvf0wh0gpu9j2bufndnwjb1marb5v2c1ief ping
```

## Common Redis Cloud URL Formats

### Format 1: With Default Username
```
redis://default:password@host:port
```

### Format 2: Password Only
```
redis://:password@host:port
```

### Format 3: Custom Username
```
redis://username:password@host:port
```

### Format 4: With TLS (if required)
```
rediss://default:password@host:port
```

## How to Find the Correct Format

1. **Redis Cloud Dashboard**:
   - Go to your database
   - Look for "Connection String" or "Connection URL"
   - Copy the exact format shown

2. **Redis Cloud Email**:
   - Check your welcome email
   - Connection details are usually included

3. **Test Different Formats**:
   - Try each format above
   - Check service logs for authentication success

## Current Status

We've updated `.env.local` to use password-only format:
```
REDIS_URL=redis://:password@host:port
```

If this doesn't work, check your Redis Cloud dashboard for the exact connection string format.

## Next Steps

1. Restart services: `./stop-all-services.sh && ./start-all-services.sh`
2. Check logs: `tail -f /tmp/rtaa-ingest.log | grep Redis`
3. If still failing, check Redis Cloud dashboard for correct format
4. Test with: `npx tsx scripts/test-websocket-asr-flow.ts`


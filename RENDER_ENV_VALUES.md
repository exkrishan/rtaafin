# 🔐 Render Environment Variables - Actual Values

## Language
✅ **Node** (Node.js)

---

## Environment Variables to Add in Render

### 1. JWT_PUBLIC_KEY

**Value:**
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

**Important:** 
- Copy the ENTIRE value including BEGIN/END markers
- Keep newlines as-is (Render supports multi-line env vars)
- Or use single line with `\n` for newlines

---

### 2. REDIS_URL

**Value:**
```
redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
```

---

### 3. PUBSUB_ADAPTER

**Value:**
```
redis_streams
```

---

## How to Add in Render

1. Go to **Render Dashboard** → Your Service → **Environment**
2. Click **"Add Environment Variable"**
3. Add each variable:
   - **Key:** `JWT_PUBLIC_KEY`
   - **Value:** (paste the full key above)
   - Click **"Save Changes"**
4. Repeat for `REDIS_URL` and `PUBSUB_ADAPTER`
5. **Redeploy** the service

---

## Quick Copy Checklist

- [ ] JWT_PUBLIC_KEY (full PEM key with BEGIN/END markers)
- [ ] REDIS_URL (complete connection string)
- [ ] PUBSUB_ADAPTER (`redis_streams`)

---

**Language:** Node (Node.js)  
**Last Updated:** 2025-11-07


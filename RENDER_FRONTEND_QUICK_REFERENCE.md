# 🚀 Frontend Render Deployment - Quick Reference

## ⚡ Quick Setup (5 Minutes)

### 1. Create Web Service
- **Type:** Web Service
- **Name:** `rtaa-frontend`
- **Environment:** Node
- **Root Directory:** `/` (empty)
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm run start`
- **Node Version:** `20`
- **Health Check Path:** `/api/health` ⚠️

### 2. Environment Variables (Required)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
LLM_API_KEY=sk-... or AIza...
LLM_PROVIDER=openai
NODE_ENV=production
```

### 3. Deploy
- Click "Create Web Service"
- Wait 3-5 minutes
- Test: `https://your-service.onrender.com/demo`

---

## 🔗 Service URLs

| Page | URL |
|------|-----|
| Demo | `https://your-service.onrender.com/demo` |
| Dashboard | `https://your-service.onrender.com/dashboard` |
| Health | `https://your-service.onrender.com/api/health` |

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Build fails | Check `package-lock.json` committed, Node 20.x |
| Health check fails | Set Health Check Path to `/api/health` |
| Blank page | Check browser console, verify env vars |
| KB articles missing | Verify `LLM_API_KEY` is set correctly |

---

## 📞 Support

- Check service logs in Render Dashboard
- Verify environment variables are set
- Test health endpoint: `/api/health`


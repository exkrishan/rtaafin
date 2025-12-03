# 🔄 Keep Services Alive - Setup Guide

This guide provides multiple options to keep your Render services awake and prevent the 50-second cold start delay.

---

## Option 1: GitHub Actions (Recommended - Free & Automated)

We've set up a GitHub Actions workflow that automatically pings your services every 10 minutes.

### Setup:
1. **Already configured!** The workflow file is at `.github/workflows/keep-alive.yml`
2. **Enable GitHub Actions:**
   - Go to your GitHub repository settings
   - Navigate to **Actions** → **General**
   - Under "Workflow permissions", select **"Read and write permissions"**
   - Save changes

### How it works:
- Runs automatically every 10 minutes
- Pings all three services (Frontend, Ingest, ASR Worker)
- Keeps services awake 24/7
- **Completely free** - GitHub Actions has 2,000 free minutes/month

### Manual trigger:
You can also trigger it manually:
1. Go to **Actions** tab in GitHub
2. Select **"Keep Render Services Alive"** workflow
3. Click **"Run workflow"**

---

## Option 2: UptimeRobot (Free - 50 Monitors)

UptimeRobot is a free uptime monitoring service that can ping your services every 5 minutes.

### Setup Steps:

1. **Sign up:** Go to https://uptimerobot.com/ (free account)

2. **Add Monitors:**
   - Click **"+ Add New Monitor"**
   - For each service, create a monitor:

   **Frontend Service:**
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `RTAA Frontend`
   - URL: `https://frontend-8jdd.onrender.com/api/health`
   - Monitoring Interval: **5 minutes**

   **Ingest Service:**
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `RTAA Ingest`
   - URL: `https://rtaa-ingest.onrender.com/health`
   - Monitoring Interval: **5 minutes**

   **ASR Worker:**
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `RTAA ASR Worker`
   - URL: `https://rtaa-asr-worker.onrender.com/health`
   - Monitoring Interval: **5 minutes**

3. **Save** all monitors

### Benefits:
- Free tier: 50 monitors, 5-minute intervals
- Email/SMS alerts if services go down
- Uptime statistics and history
- Mobile app available

---

## Option 3: Local Cron Job (For Your Machine)

If you want to run the keep-alive script from your local machine:

### Setup:

1. **Make script executable:**
   ```bash
   chmod +x scripts/keep-alive.sh
   ```

2. **Test the script:**
   ```bash
   ./scripts/keep-alive.sh
   ```

3. **Add to crontab:**
   ```bash
   crontab -e
   ```

4. **Add this line (runs every 10 minutes):**
   ```cron
   */10 * * * * /path/to/rtaafin/scripts/keep-alive.sh >> /tmp/keep-alive.log 2>&1
   ```

   **Note:** Replace `/path/to/rtaafin` with your actual project path

### Limitations:
- Only works when your machine is on
- Requires your machine to be connected to internet
- Not ideal for 24/7 operation

---

## Option 4: Better Uptime (Alternative Free Service)

Similar to UptimeRobot, but with different features.

### Setup:
1. Go to https://betteruptime.com/
2. Sign up for free account
3. Add monitors for each service URL
4. Set check interval to 5 minutes

---

## Option 5: Render Paid Tier (Always-On)

If you upgrade to Render's paid tier:
- **Starter Plan:** $7/month per service
- Services stay awake 24/7
- No cold start delays
- Better performance

---

## Recommended Approach

**For Free Solution:**
1. ✅ **Use GitHub Actions** (already configured) - Set it and forget it
2. ✅ **Add UptimeRobot** as backup - Provides monitoring + alerts

**For Production:**
- Upgrade to Render paid tier for always-on services
- Or use both GitHub Actions + UptimeRobot for redundancy

---

## Testing Keep-Alive

After setting up, test that services stay awake:

1. **Wait 20 minutes** (longer than Render's 15-minute sleep timer)
2. **Make a request:**
   ```bash
   curl https://frontend-8jdd.onrender.com/api/health
   ```
3. **Response should be immediate** (< 1 second) if keep-alive is working
4. **If it takes 30-60 seconds**, the service slept - check your keep-alive setup

---

## Troubleshooting

### GitHub Actions not running?
- Check repository settings → Actions → General
- Ensure "Allow all actions and reusable workflows" is enabled
- Check Actions tab for any errors

### UptimeRobot not working?
- Verify monitor URLs are correct
- Check monitor status in UptimeRobot dashboard
- Ensure monitoring interval is set (not paused)

### Services still sleeping?
- Verify keep-alive is actually pinging (check logs)
- Reduce ping interval (e.g., every 5 minutes instead of 10)
- Check if Render has changed their sleep timer

---

## Service URLs Reference

```
Frontend:    https://frontend-8jdd.onrender.com/api/health
Ingest:      https://rtaa-ingest.onrender.com/health
ASR Worker:  https://rtaa-asr-worker.onrender.com/health
```

---

**Last Updated:** 2025-01-23


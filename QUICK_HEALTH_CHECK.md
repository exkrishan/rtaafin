# Quick Health Check Guide

## Running the Health Check Script

The health check script needs environment variables to verify Redis and ElevenLabs configuration. Here's how to run it:

### Option 1: Set Environment Variables in Terminal

```bash
# Set required environment variables
export REDIS_URL="redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304"
export ELEVENLABS_API_KEY="sk_d687c22a3dbf04db3097f3791abcd39abba69058fe835e8b"

# Run health check
npx tsx scripts/verify-pipeline-health.ts
```

### Option 2: Inline Environment Variables

```bash
REDIS_URL="redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304" \
ELEVENLABS_API_KEY="sk_d687c22a3dbf04db3097f3791abcd39abba69058fe835e8b" \
npx tsx scripts/verify-pipeline-health.ts
```

### Option 3: Create a .env File (Recommended)

Create a `.env` file in the project root:

```bash
# .env
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
ELEVENLABS_API_KEY=sk_d687c22a3dbf04db3097f3791abcd39abba69058fe835e8b
```

Then load it before running:

```bash
# Load .env file (if using dotenv)
source .env
npx tsx scripts/verify-pipeline-health.ts

# OR use dotenv-cli
npx dotenv-cli -e .env -- npx tsx scripts/verify-pipeline-health.ts
```

## Expected Results After Setting Variables

Once you set the environment variables, you should see:

```
✅ Render Ingest Service: Service is healthy, Exotel bridge enabled
✅ Local ASR Worker: Service is healthy, ASR provider: elevenlabs
✅ Transcript Consumer: Consumer is running, X active subscription(s)
✅ Redis Connection: Successfully connected to Redis, audio_stream exists
⏭️  Redis URL Consistency: Manual verification required
✅ ElevenLabs Configuration: ElevenLabs API key configured and connection available
```

## Notes

1. **Render Ingest Service**: If it shows "Failed to connect", the service might be:
   - Down or sleeping (Render free tier services sleep after inactivity)
   - Unreachable from your network
   - Check Render dashboard for service status

2. **Local ASR Worker**: The "ElevenLabs connection not available" message is expected if:
   - No active calls are in progress
   - The connection is only created when audio is being processed
   - This is normal when the worker is idle

3. **Redis URL**: Make sure you're using the same Redis URL that:
   - Render Ingest Service is using (check Render dashboard)
   - Local ASR Worker is using (check your ASR worker startup command)

4. **ElevenLabs API Key**: Use your actual ElevenLabs API key. The one shown above is just an example.

## Troubleshooting

### If Render Ingest Service fails:
- Check if service is running in Render dashboard
- Try accessing the health endpoint directly: `curl https://rtaa-ingest-service.onrender.com/health`
- If service is sleeping, wake it up by making a request

### If Redis Connection fails:
- Verify the Redis URL is correct
- Test connection: `redis-cli -u $REDIS_URL ping`
- Check if Redis is accessible from your network

### If ElevenLabs Configuration fails:
- Verify the API key is correct
- Check if the API key has Speech-to-Text access
- Verify your ElevenLabs account subscription level




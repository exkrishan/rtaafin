# 📊 Log Fetching Scripts

Scripts to fetch and analyze logs from Render services for transcript monitoring.

## 🚀 Quick Start

### Option 1: Analyze Logs from Render Dashboard (Recommended)

Since Render's API logs endpoint may not be available, use this method:

1. **Copy logs from Render Dashboard:**
   - Go to https://dashboard.render.com
   - Click on your service (e.g., `rtaa-asr-worker`)
   - Click the **"Logs"** tab
   - Copy the last 5-10 minutes of logs
   - Save to a file: `logs.txt`

2. **Analyze the logs:**
   ```bash
   npm run logs:analyze logs.txt
   ```

3. **Or filter for a specific interaction_id:**
   ```bash
   npm run logs:analyze logs.txt <interaction_id>
   ```

### Option 2: Try Render API (May Not Work)

The Render API logs endpoint may return 404. If it works for you:

```bash
npm run logs:render
```

Or filter for a specific interaction_id:
```bash
npm run logs:render <interaction_id>
```

## 📋 What the Scripts Do

### `analyze-transcript-logs.js`

- Extracts interaction IDs from logs
- Filters for transcript-related events
- Shows summary statistics:
  - Transcripts published
  - Deepgram transcripts received
  - Empty transcripts
  - Timeouts
  - Socket state events
- Provides health assessment

### `fetch-render-logs.js`

- Fetches logs from all Render services (ASR Worker, Ingest, Frontend)
- Filters for transcript-related logs
- Finds the latest interaction_id automatically
- Shows logs grouped by service

## 🔍 What to Look For

### ✅ Healthy Flow:
- `[DeepgramProvider] 📨 STEP 2: DEEPGRAM TRANSCRIPT RECEIVED`
- `[ASRWorker] Published partial transcript`
- `[RedisStreamsAdapter] ✅ Successfully published message to transcript.{id}`
- `[TranscriptConsumer] ✅ Forwarded transcript successfully`

### ❌ Problem Indicators:
- `Empty transcript received` → Deepgram sending empty transcripts
- `STEP 2 TIMEOUT` → Deepgram timeout (1011 error)
- `Socket stuck in CONNECTING` → WebSocket not opening
- `Published transcript with EMPTY text` → Empty transcripts being published

## 📝 Example Usage

```bash
# 1. Copy logs from Render Dashboard → ASR Worker → Logs
# 2. Save to logs.txt
# 3. Analyze:
npm run logs:analyze logs.txt

# Output will show:
# - Latest interaction_id found
# - All transcript-related logs
# - Summary statistics
# - Health assessment
```

## 🔧 Troubleshooting

### No logs found?
- Make sure you copied logs from the correct service (ASR Worker)
- Check that the log file contains the expected format
- Try copying more logs (last 10-15 minutes)

### API returns 404?
- Render's logs API endpoint may not be available for all service types
- Use the manual method (Option 1) instead
- Check Render API documentation for updates

### Can't find interaction_id?
- The script will show all transcript-related logs if no interaction_id is found
- Look for `interaction_id` or `interactionId` in the logs
- Copy logs from a time when a call was active





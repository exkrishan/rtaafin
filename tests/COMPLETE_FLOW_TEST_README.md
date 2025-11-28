# Complete Flow Unit Test

## Overview

This comprehensive unit test validates the entire agent assist pipeline:

1. **Transcript Ingestion** - Receiving and processing transcripts
2. **Intent Detection** - Using Gemini LLM to classify customer intent
3. **KB Article Surfacing** - Searching and retrieving relevant knowledge base articles
4. **Disposition Generation** - Generating call summaries and disposition recommendations
5. **Complete End-to-End Flow** - Full pipeline from transcript to disposition

## Prerequisites

### ⚠️ Important: Local vs Render Environment Variables

**This test runs LOCALLY on your machine**, not on Render. 

- **If you only want to deploy to Render**: You don't need these env vars locally. They're already configured on Render.
- **If you want to test locally before deploying**: You need these env vars in `.env.local` on your machine.

### Environment Variables (for LOCAL testing only)

The test requires the following environment variables **only if running locally**:

```bash
# Required for Intent Detection
GEMINI_API_KEY=your-gemini-api-key
# OR
LLM_API_KEY=your-llm-api-key
LLM_PROVIDER=gemini  # or 'openai'

# Required for Database Access
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional (for Redis transcript storage)
REDIS_URL=your-redis-url
```

**Note**: These should be the same values as on Render, but you only need them locally if you want to run the test.

### Database Setup

Ensure your Supabase database has:
- `ingest_events` table (for storing transcripts)
- `intents` table (for storing detected intents)
- `kb_articles` table (for knowledge base articles)
- `dispositions_master` table (for disposition taxonomy)
- `disposition_taxonomy` view (for hierarchical disposition data)

## Running the Test

### Method 1: Using npm script (Recommended)

```bash
npm run test:complete-flow
```

### Method 2: Direct execution

```bash
npx tsx tests/complete-flow.test.ts
```

## Test Cases

### 1. Transcript Ingestion Test
- **Purpose**: Validates that transcripts are ingested correctly
- **Test Data**: "I need to block my credit card because it was stolen"
- **Validates**:
  - Transcript is ingested successfully
  - Intent is detected (if text is long enough)
  - KB articles are surfaced (if `waitForKB: true`)

### 2. Intent Detection Test
- **Purpose**: Validates intent detection accuracy
- **Test Cases**:
  - Credit card block → `credit_card_block`
  - Account balance inquiry → `account_balance`
  - Debit card issue → `debit_card`
- **Validates**:
  - Correct intent labels are detected
  - Confidence scores are reasonable (> 0.5)

### 3. KB Article Surfacing Test
- **Purpose**: Validates KB article search functionality
- **Test Queries**:
  - "credit card block"
  - "account balance"
  - "debit card"
- **Validates**:
  - Articles are found for relevant queries
  - Articles have proper structure (id, title, confidence)

### 4. Disposition Generation Test
- **Purpose**: Validates call summary and disposition generation
- **Test Data**: Multi-turn conversation about credit card blocking
- **Validates**:
  - Summary is generated (issue, resolution, next_steps)
  - Dispositions are mapped correctly
  - Disposition taxonomy is used

### 5. Complete End-to-End Flow Test
- **Purpose**: Validates the entire pipeline from start to finish
- **Test Flow**:
  1. Ingest multiple transcript lines sequentially
  2. Wait for async intent detection
  3. Generate disposition summary
- **Validates**:
  - All transcripts are ingested
  - Intent is detected for at least one transcript
  - KB articles are surfaced
  - Disposition is generated successfully

## Expected Output

```
🧪 Complete Flow Unit Test
======================================================================
Test Call ID: test-call-1234567890
Environment: development
======================================================================

📝 Running tests...

✅ Transcript Ingestion (1234.56ms)
✅ Intent Detection (2345.67ms)
✅ KB Article Surfacing (567.89ms)
✅ Disposition Generation (3456.78ms)
✅ Complete End-to-End Flow (4567.89ms)

======================================================================
📊 Test Summary
======================================================================
Total Tests: 5
✅ Passed: 5
❌ Failed: 0

1. ✅ Transcript Ingestion (1234.56ms)
2. ✅ Intent Detection (2345.67ms)
3. ✅ KB Article Surfacing (567.89ms)
4. ✅ Disposition Generation (3456.78ms)
5. ✅ Complete End-to-End Flow (4567.89ms)

======================================================================
✅ All tests passed!
```

## Troubleshooting

### Test Hangs or Times Out

If the test hangs, it might be because:
1. **TranscriptConsumer is auto-starting**: The test now stops the consumer before running, but if it still hangs, check that `DISABLE_TRANSCRIPT_CONSUMER=true` is set.

2. **LLM API is slow**: Intent detection and disposition generation require LLM API calls which can be slow. The test has a 5-minute timeout.

3. **Database connection issues**: Ensure Supabase credentials are correct and the database is accessible.

### Intent Detection Fails

- Check that `GEMINI_API_KEY` or `LLM_API_KEY` is set correctly
- Verify that `LLM_PROVIDER` is set to `gemini` if using Gemini
- Check API quota/rate limits

### KB Articles Not Found

- Ensure `kb_articles` table has data
- Check that search queries match article titles/snippets/tags
- Verify `getKbAdapter` is returning the correct adapter

### Disposition Generation Fails

- Ensure `dispositions_master` table has disposition taxonomy data
- Check that `disposition_taxonomy` view exists and is accessible
- Verify transcripts are stored in `ingest_events` table

## Notes

- The test uses real API calls (Gemini LLM, Supabase) - it's an integration test, not a pure unit test
- Test data is created with unique call IDs to avoid conflicts
- The test cleans up TranscriptConsumer before and after running
- Each test case is independent and can be run separately if needed


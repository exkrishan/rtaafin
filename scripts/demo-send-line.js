#!/usr/bin/env node

/**
 * Demo Script: Send Single Transcript Line
 *
 * Manually posts a transcript chunk to test real-time event broadcasting.
 *
 * Usage:
 *   node scripts/demo-send-line.js --callId call-123 --seq 99 --text "Customer: Please reset my password"
 *
 * Options:
 *   --callId  Call ID (required)
 *   --seq     Sequence number (required)
 *   --text    Transcript text (required)
 *   --ts      Timestamp (optional, defaults to now)
 */

const INGEST_URL = 'http://localhost:3000/api/calls/ingest-transcript';

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      parsed[key] = value;
      i++;
    }
  }

  return parsed;
}

async function sendTranscriptLine(callId, seq, text, ts) {
  const payload = {
    callId,
    seq: parseInt(seq, 10),
    text,
    ts: ts || new Date().toISOString(),
  };

  console.log('[demo-send-line] Sending transcript chunk:', payload);

  try {
    const response = await fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('[demo-send-line] ✓ Success:', {
        ok: data.ok,
        intent: data.intent,
        confidence: data.confidence,
        articlesCount: data.articles?.length || 0,
      });
    } else {
      console.error('[demo-send-line] ✗ Error:', data);
      process.exit(1);
    }
  } catch (err) {
    console.error('[demo-send-line] ✗ Network error:', err.message);
    process.exit(1);
  }
}

// Main
async function main() {
  const args = parseArgs();

  // Validate required arguments
  if (!args.callId || !args.seq || !args.text) {
    console.error('Usage: node scripts/demo-send-line.js --callId <id> --seq <num> --text <text>');
    console.error('');
    console.error('Example:');
    console.error('  node scripts/demo-send-line.js --callId call-123 --seq 99 --text "Customer: Reset my password"');
    process.exit(1);
  }

  await sendTranscriptLine(args.callId, args.seq, args.text, args.ts);
}

main();

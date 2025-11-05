#!/usr/bin/env tsx
/**
 * CLI tool to start transcript ingestion (TypeScript version).
 * Usage: npx tsx scripts/start-ingest.ts --callId call-123 --mode dev
 */

import { startIngest, stopIngest } from '../lib/ingest';

interface Args {
  callId: string | null;
  mode: 'dev' | 's3';
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Args = { callId: null, mode: 'dev' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--callId' && i + 1 < args.length) {
      parsed.callId = args[i + 1];
      i++;
    } else if (args[i] === '--mode' && i + 1 < args.length) {
      parsed.mode = args[i + 1] as 'dev' | 's3';
      i++;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs();

  if (!args.callId) {
    console.error('Error: --callId is required');
    console.error('Usage: npx tsx scripts/start-ingest.ts --callId call-123 --mode dev');
    process.exit(1);
  }

  console.log('[start-ingest] Starting ingestion...');
  console.log(`[start-ingest] callId: ${args.callId}`);
  console.log(`[start-ingest] mode: ${args.mode}`);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[start-ingest] Received SIGINT, stopping ingest...');
    stopIngest(args.callId!);
    setTimeout(() => {
      console.log('[start-ingest] Exiting...');
      process.exit(0);
    }, 1000);
  });

  process.on('SIGTERM', () => {
    console.log('\n[start-ingest] Received SIGTERM, stopping ingest...');
    stopIngest(args.callId!);
    setTimeout(() => {
      console.log('[start-ingest] Exiting...');
      process.exit(0);
    }, 1000);
  });

  try {
    // Start ingestion
    await startIngest(args.callId, { mode: args.mode });
    console.log('[start-ingest] Ingestion complete');
  } catch (err) {
    console.error('[start-ingest] Error:', err);
    process.exit(1);
  }
}

main();

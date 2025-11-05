#!/usr/bin/env node
/**
 * CLI tool to start transcript ingestion.
 * Usage: node scripts/start-ingest.js --callId call-123 --mode dev
 */

const path = require('path');
const { register } = require('module');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { callId: null, mode: 'dev' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--callId' && i + 1 < args.length) {
      parsed.callId = args[i + 1];
      i++;
    } else if (args[i] === '--mode' && i + 1 < args.length) {
      parsed.mode = args[i + 1];
      i++;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs();

  if (!args.callId) {
    console.error('Error: --callId is required');
    console.error('Usage: node scripts/start-ingest.js --callId call-123 --mode dev');
    process.exit(1);
  }

  console.log('[start-ingest] Starting ingestion...');
  console.log(`[start-ingest] callId: ${args.callId}`);
  console.log(`[start-ingest] mode: ${args.mode}`);

  try {
    // Dynamically import the TypeScript module using tsx
    // First, try to load using tsx or ts-node if available
    let ingest;

    try {
      // Try to use tsx for TypeScript support
      const tsxPath = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'loader.mjs');
      try {
        require('tsx/cjs');
        ingest = require('../lib/ingest.ts');
      } catch {
        // Fall back to dynamic import
        const ingestPath = path.join(process.cwd(), 'lib', 'ingest.ts');
        console.log(`[start-ingest] Loading from ${ingestPath}`);

        // Use tsx directly if available
        const { pathToFileURL } = require('url');
        const ingestUrl = pathToFileURL(ingestPath).href;

        // Try dynamic import (works with Node 18+)
        ingest = await import(ingestUrl);
      }
    } catch (err) {
      console.error('[start-ingest] Error: TypeScript loader not available');
      console.error('[start-ingest] Please install tsx: npm install --save-dev tsx');
      console.error('[start-ingest] Then run: npx tsx scripts/start-ingest.js --callId call-123 --mode dev');
      process.exit(1);
    }

    const { startIngest, stopIngest } = ingest;

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n[start-ingest] Received SIGINT, stopping ingest...');
      stopIngest(args.callId);
      setTimeout(() => {
        console.log('[start-ingest] Exiting...');
        process.exit(0);
      }, 1000);
    });

    process.on('SIGTERM', () => {
      console.log('\n[start-ingest] Received SIGTERM, stopping ingest...');
      stopIngest(args.callId);
      setTimeout(() => {
        console.log('[start-ingest] Exiting...');
        process.exit(0);
      }, 1000);
    });

    // Start ingestion
    await startIngest(args.callId, { mode: args.mode });

    console.log('[start-ingest] Ingestion complete');
  } catch (err) {
    console.error('[start-ingest] Error:', err);
    process.exit(1);
  }
}

main();

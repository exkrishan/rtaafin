#!/usr/bin/env tsx

/**
 * Minimal smoke test for the Auto Notes endpoint.
 * Usage:
 *   source .env.local && npx tsx tests/ui-auto-disposition-smoke.ts
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const endpoint = process.env.AUTO_NOTES_ENDPOINT || 'http://localhost:3000/api/calls/auto_notes';

async function main() {
  const payload = {
    callId: `smoke-${Date.now()}`,
    tenantId: process.env.AUTO_NOTES_TENANT || 'default',
    author: 'smoke-script',
    notes: 'Sample notes from smoke test',
    dispositions: [
      {
        code: 'GENERAL_INQUIRY',
        title: 'General Inquiry',
        score: 0.4,
      },
    ],
    confidence: 0.4,
  };

  try {
    console.log(`POST ${endpoint}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', text);

    if (!response.ok) {
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error('Request failed:', err);
    process.exit(1);
  }
}

main();

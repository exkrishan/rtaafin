#!/usr/bin/env tsx
/**
 * Summary Generation Smoke Test / Unit Harness
 *
 * Usage:
 *   # Mocked unit test harness (no Supabase required)
 *   npx tsx tests/summary.test.ts --mock
 *
 *   # Live integration test (requires Supabase + LLM endpoint)
 *   source .env.local && npx tsx tests/summary.test.ts <callId> [tenantId]
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import dotenv from 'dotenv';

const args = process.argv.slice(2);

if (args[0] === '--mock') {
  runMockedTests()
    .then(() => {
      console.log('✅ Mocked summary tests passed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Mocked summary tests failed:', err);
      process.exit(1);
    });
} else {
  runLiveTest(args).catch((err) => {
    console.error('❌ Fatal error while generating summary:', err?.message ?? err);
    process.exit(1);
  });
}

async function runLiveTest(argv: string[]) {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
  } else {
    dotenv.config();
  }

  const REQUIRED_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingEnv = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missingEnv.length > 0) {
    console.error('❌ Missing environment variables:');
    missingEnv.forEach((key) => console.error(`   - ${key}`));
    console.error('\nLoad .env.local before running this test.');
    process.exit(1);
  }

  const callId = argv[0];
  const tenantId = argv[1];

  if (!callId) {
    console.error('❌ Usage: npx tsx tests/summary.test.ts <callId> [tenantId]');
    process.exit(1);
  }

  const { generateCallSummary } = await import('../lib/summary');

  const result = await generateCallSummary(callId, tenantId);
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error('⚠️  Summary generation completed with errors.');
    process.exit(1);
  }

  console.log('✅ Summary generated successfully.');
}

type MockStore = {
  transcripts: Record<string, string[]>;
  taxonomy: Array<{ code: string; title: string; tags?: string[] }>;
  autoNotes: any[];
  metrics: any[];
};

function createMockSupabase(store: MockStore, supabaseClient: any): () => void {
  const originalFrom = supabaseClient.from?.bind(supabaseClient);
  supabaseClient.from = (table: string) => {
    switch (table) {
      case 'ingest_events':
        return {
          select: () => ({
            eq: (_col: string, callId: string) => ({
              order: () =>
                Promise.resolve({
                  data: (store.transcripts[callId] || []).map((text, index) => ({
                    text,
                    seq: index + 1,
                  })),
                  error: null,
                }),
            }),
          }),
        };
      case 'disposition_taxonomy':
        return {
          select: () =>
            Promise.resolve({
              data: store.taxonomy,
              error: null,
            }),
        };
      case 'auto_notes':
        return {
          upsert: (payload: any) => ({
            select: () => ({
              single: async () => {
                const row = Array.isArray(payload) ? payload[0] : payload;
                store.autoNotes.push(row);
                return {
                  data: { id: `${row.call_id}-note` },
                  error: null,
                };
              },
            }),
          }),
        };
      case 'rtaa_metrics':
        return {
          insert: async (payload: any) => {
            store.metrics.push(payload);
            return { data: null, error: null };
          },
        };
      default:
        if (typeof originalFrom === 'function') {
          return originalFrom(table);
        }
        throw new Error(`Mock Supabase: unhandled table ${table}`);
    }
  };

  return () => {
    if (originalFrom) {
      supabaseClient.from = originalFrom;
    }
  };
}

async function runMockedTests() {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://mock.supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

  const summaryModule = await import('../lib/summary');
  const { generateCallSummary, resetSummaryCache } = summaryModule;
  const { supabase } = await import('../lib/supabase');

  const store: MockStore = {
    transcripts: {
      'call-valid': [
        'Customer: I have an issue with my order.',
        'Agent: Happy to help, let me check that for you.',
        'Customer: Thank you!',
      ],
      'call-invalid': [
        'Customer: Something weird happened.',
        'Agent: I will escalate this for further review.',
      ],
    },
    taxonomy: [
      { code: 'RESOLVED', title: 'Resolved', tags: ['resolved'] },
      { code: 'GENERAL_INQUIRY', title: 'General Inquiry', tags: ['general', 'inquiry'] },
      { code: 'OTHER', title: 'Other', tags: ['other'] },
    ],
    autoNotes: [],
    metrics: [],
  };

  const restoreSupabase = createMockSupabase(store, supabase);
  const server = http.createServer((req, res) => {
    if (req.url === '/valid' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issue: 'Customer reported an order issue.',
          resolution: 'Agent identified the order and processed a refund.',
          next_steps: 'Inform customer via email once refund completes.',
          dispositions: [
            { label: 'resolved', score: 0.92 },
            { label: 'general_inquiry', score: 0.4 },
          ],
          confidence: 0.87,
        })
      );
      return;
    }

    if (req.url === '/invalid' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ issue: 123, dispositions: 'bad-data' }));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise<void>((resolve) => server.listen(4321, '127.0.0.1', resolve));

  const originalLLM = process.env.LLM_API_URL;
  try {
    process.env.LLM_API_URL = 'http://127.0.0.1:4321/valid';
    resetSummaryCache();
    const successResult = await generateCallSummary('call-valid', 'tenant-mock');
    if (!successResult.ok) {
      throw new Error('Expected successful summary generation for valid mock response.');
    }
    if (!successResult.summary || successResult.usedFallback) {
      throw new Error('Valid summary should not use fallback.');
    }
    if (!(successResult.mappedDispositions || []).length) {
      throw new Error('Expected mapped dispositions for valid response.');
    }

    process.env.LLM_API_URL = 'http://127.0.0.1:4321/invalid';
    resetSummaryCache();
    const malformedResult = await generateCallSummary('call-invalid', 'tenant-mock');
    if (malformedResult.ok) {
      throw new Error('Malformed payload should not produce ok=true.');
    }
    if (!malformedResult.usedFallback) {
      throw new Error('Malformed payload should trigger fallback.');
    }
    if (!malformedResult.summary?.resolution.includes('See raw output')) {
      throw new Error('Fallback summary should prompt to review raw output.');
    }

    if (store.autoNotes.length < 2) {
      throw new Error('Auto-notes upsert should run for both scenarios.');
    }
  } finally {
    process.env.LLM_API_URL = originalLLM;
    server.close();
    restoreSupabase();
  }
}

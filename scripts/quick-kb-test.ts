#!/usr/bin/env tsx
/**
 * Quick KB Adapter Test Script
 * Tests KB adapter search functionality with various tenants and queries
 *
 * Usage:
 *   # Option 1: Source environment first
 *   source .env.local && npx tsx scripts/quick-kb-test.ts --query "password reset"
 *
 *   # Option 2: Use env-bootstrap (loads .env.local automatically)
 *   node scripts/env-bootstrap.mjs scripts/quick-kb-test.ts --query "password reset"
 *
 * More examples:
 *   source .env.local && npx tsx scripts/quick-kb-test.ts --tenant acme --query "billing" --max 5
 *   node scripts/env-bootstrap.mjs scripts/quick-kb-test.ts --tenant demo --query "account"
 */

// Environment check - verify critical env vars are present
const REQUIRED_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);

if (missingVars.length > 0) {
  console.error('❌ Error: Missing required environment variables:');
  missingVars.forEach(key => console.error(`   - ${key}`));
  console.error('\n💡 Run this script using one of these methods:\n');
  console.error('   1. Source environment first:');
  console.error('      source .env.local && npx tsx scripts/quick-kb-test.ts --query "password"\n');
  console.error('   2. Use env-bootstrap (loads .env.local automatically):');
  console.error('      node scripts/env-bootstrap.mjs scripts/quick-kb-test.ts --query "password"\n');
  process.exit(1);
}

import { getKbAdapter } from '../lib/kb-adapter';

interface Args {
  tenant?: string;
  query?: string;
  max?: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): Args {
  const args: Args = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    switch (arg) {
      case '--tenant':
      case '-t':
        args.tenant = nextArg;
        i++;
        break;
      case '--query':
      case '-q':
        args.query = nextArg;
        i++;
        break;
      case '--max':
      case '-m':
        args.max = parseInt(nextArg, 10);
        i++;
        break;
    }
  }

  return args;
}

/**
 * Main test function
 */
async function main() {
  const args = parseArgs();

  // Defaults
  const tenantId = args.tenant || 'default';
  const query = args.query || 'password reset';
  const max = args.max || 10;

  console.log('🔍 KB Adapter Test');
  console.log('==================');
  console.log(`Tenant: ${tenantId}`);
  console.log(`Query: "${query}"`);
  console.log(`Max Results: ${max}`);
  console.log('');

  try {
    // Get adapter for tenant
    console.log('📦 Fetching adapter for tenant...');
    const adapter = await getKbAdapter(tenantId);

    // Search
    console.log('🔎 Searching...');
    const startTime = Date.now();
    const results = await adapter.search(query, {
      tenantId,
      max,
    });
    const latencyMs = Date.now() - startTime;

    console.log('');
    console.log('✅ Search completed');
    console.log(`⏱️  Latency: ${latencyMs}ms`);
    console.log(`📊 Results: ${results.length}`);

    if (results.length > 0) {
      console.log(`🏷️  Provider: ${results[0].source}`);
      console.log('');
      console.log('📄 Top Results:');
      console.log('');

      results.forEach((article, idx) => {
        console.log(`${idx + 1}. ${article.title}`);
        console.log(`   ID: ${article.id}`);
        console.log(`   Source: ${article.source}`);
        if (article.confidence) {
          console.log(`   Confidence: ${(article.confidence * 100).toFixed(1)}%`);
        }
        if (article.url) {
          console.log(`   URL: ${article.url}`);
        }
        console.log(`   Snippet: ${article.snippet.substring(0, 80)}...`);
        if (article.tags && article.tags.length > 0) {
          console.log(`   Tags: ${article.tags.join(', ')}`);
        }
        console.log('');
      });
    } else {
      console.log('');
      console.log('⚠️  No results found');
    }
  } catch (err: any) {
    console.error('');
    console.error('❌ Error:', err.message || err);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

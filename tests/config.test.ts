#!/usr/bin/env tsx
/**
 * Configuration System Tests
 * Basic tests for multi-scope configuration merging
 *
 * Usage:
 *   # Option 1: Source environment first
 *   source .env.local && npx tsx tests/config.test.ts
 *
 *   # Option 2: Use env-bootstrap (loads .env.local automatically)
 *   node scripts/env-bootstrap.mjs tests/config.test.ts
 */

// Environment check - verify critical env vars are present
const REQUIRED_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);

if (missingVars.length > 0) {
  console.error('❌ Error: Missing required environment variables:');
  missingVars.forEach(key => console.error(`   - ${key}`));
  console.error('\n💡 Run this script using one of these methods:\n');
  console.error('   1. Source environment first:');
  console.error('      source .env.local && npx tsx tests/config.test.ts\n');
  console.error('   2. Use env-bootstrap (loads .env.local automatically):');
  console.error('      node scripts/env-bootstrap.mjs tests/config.test.ts\n');
  process.exit(1);
}

import { getEffectiveConfig, DEFAULT_CONFIG } from '../lib/config';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('🧪 Running Configuration Tests\n');

  // Test 1: Default config should be returned for non-existent tenant
  console.log('Test 1: Default configuration');
  try {
    const config = await getEffectiveConfig({ tenantId: 'non-existent-tenant-xyz' });

    assert(
      config.kb.maxArticles === DEFAULT_CONFIG.kb.maxArticles,
      `Default kb.maxArticles should be ${DEFAULT_CONFIG.kb.maxArticles}`
    );
    assert(
      config.llm.model === DEFAULT_CONFIG.llm.model,
      `Default llm.model should be ${DEFAULT_CONFIG.llm.model}`
    );
    assert(
      config.kb.provider === DEFAULT_CONFIG.kb.provider,
      `Default kb.provider should be ${DEFAULT_CONFIG.kb.provider}`
    );
  } catch (err) {
    console.error(`❌ Test 1 failed:`, err);
    testsFailed++;
  }

  console.log('');

  // Test 2: Config merging with seeded tenant
  console.log('Test 2: Tenant configuration merging (requires seed)');
  try {
    const config = await getEffectiveConfig({ tenantId: 'default' });

    // After seeding, default tenant should have kb.maxArticles = 5
    // If not seeded, will use DEFAULT_CONFIG values
    console.log(`  Found kb.maxArticles: ${config.kb.maxArticles}`);
    console.log(`  Found llm.model: ${config.llm.model}`);
    console.log(`  Found kb.provider: ${config.kb.provider}`);

    // Basic validation
    assert(
      typeof config.kb.maxArticles === 'number',
      'kb.maxArticles should be a number'
    );
    assert(
      config.kb.maxArticles >= 1 && config.kb.maxArticles <= 20,
      'kb.maxArticles should be between 1 and 20'
    );
  } catch (err) {
    console.error(`❌ Test 2 failed:`, err);
    testsFailed++;
  }

  console.log('');

  // Test 3: All config sections should exist
  console.log('Test 3: Configuration structure validation');
  try {
    const config = await getEffectiveConfig({ tenantId: 'default' });

    assert(!!config.kb, 'Config should have kb section');
    assert(!!config.llm, 'Config should have llm section');
    assert(!!config.autoNotes, 'Config should have autoNotes section');
    assert(!!config.disposition, 'Config should have disposition section');
    assert(!!config.telemetry, 'Config should have telemetry section');
    assert(!!config.ui, 'Config should have ui section');
  } catch (err) {
    console.error(`❌ Test 3 failed:`, err);
    testsFailed++;
  }

  console.log('');

  // Test 4: Nested merging
  console.log('Test 4: Deep merge validation');
  try {
    const config = await getEffectiveConfig({ tenantId: 'default' });

    // KB should have all default fields even if tenant only overrides some
    assert(!!config.kb.provider, 'kb.provider should exist');
    assert(!!config.kb.maxArticles, 'kb.maxArticles should exist');
    assert(!!config.kb.timeoutMs, 'kb.timeoutMs should exist');
    assert(config.kb.minConfidence !== undefined, 'kb.minConfidence should exist');
  } catch (err) {
    console.error(`❌ Test 4 failed:`, err);
    testsFailed++;
  }

  console.log('');
  console.log('='.repeat(50));
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log('='.repeat(50));

  if (testsFailed > 0) {
    console.log('\n⚠️  Some tests failed. Run seed script first:');
    console.log('   ADMIN_KEY=test123 bash scripts/seed-default-config.sh');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Test Supabase Connection
 * Verifies that Supabase connection is working
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env.local
try {
  const envPath = join(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  const env = dotenv.parse(envContent);
  Object.assign(process.env, env);
} catch (err) {
  console.warn('[test] No .env.local found, using existing env vars');
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Supabase Connection...\n');

if (!SUPABASE_URL) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL is not set');
  process.exit(1);
}

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set');
  process.exit(1);
}

console.log('✅ Environment variables found');
console.log(`   URL: ${SUPABASE_URL.substring(0, 30)}...`);
console.log(`   Key: ${SUPABASE_KEY.substring(0, 20)}...\n`);

// Try to import and test Supabase
async function testConnection() {
  try {
    const { supabase } = await import('../lib/supabase');
    
    console.log('Testing database connection...');
    
    // Try a simple query
    const { data, error } = await supabase
      .from('ingest_events')
      .select('id')
      .limit(1);
    
    if (error) {
      if (error.message.includes('does not exist')) {
        console.error('❌ Table "ingest_events" does not exist');
        console.log('\n📋 Run the migration SQL in scripts/fix-ingest-events-schema.sql\n');
        return false;
      }
      console.error('❌ Database query failed:', error.message);
      return false;
    }
    
    console.log('✅ Database connection successful!');
    console.log('✅ Table "ingest_events" exists');
    
    // Check table structure
    const { data: testData, error: testError } = await supabase
      .from('ingest_events')
      .select('*')
      .limit(1);
    
    if (testError) {
      console.error('❌ Error checking table structure:', testError.message);
      return false;
    }
    
    if (testData && testData.length > 0) {
      const columns = Object.keys(testData[0]);
      console.log(`✅ Table has columns: ${columns.join(', ')}`);
      
      const required = ['call_id', 'seq', 'ts', 'text'];
      const missing = required.filter(col => !columns.includes(col));
      
      if (missing.length > 0) {
        console.error(`❌ Missing columns: ${missing.join(', ')}`);
        console.log('\n📋 Run the migration SQL in scripts/fix-ingest-events-schema.sql\n');
        return false;
      }
      
      console.log('✅ All required columns exist');
    } else {
      console.log('✅ Table structure OK (empty table)');
    }
    
    return true;
  } catch (err: any) {
    console.error('❌ Connection failed:', err.message);
    
    if (err.message.includes('fetch failed') || err.message.includes('network')) {
      console.error('\n⚠️  This looks like a network/TLS issue.');
      console.log('Possible fixes:');
      console.log('  1. Check your Supabase URL is correct');
      console.log('  2. Check network connectivity');
      console.log('  3. If using self-signed cert, see scripts/USAGE.md');
      console.log('  4. Verify Supabase service is running');
    }
    
    return false;
  }
}

testConnection()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });


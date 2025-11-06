#!/usr/bin/env tsx
/**
 * Check Database Schema Script
 * Verifies that required tables and columns exist
 */

import { supabase } from '../lib/supabase';

async function checkSchema() {
  console.log('🔍 Checking database schema...\n');

  // Check ingest_events table
  console.log('Checking ingest_events table...');
  try {
    const { data, error } = await (supabase as any)
      .from('ingest_events')
      .select('*')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist')) {
        console.error('❌ Table ingest_events does not exist!');
        console.log('\n📋 Run this SQL in Supabase SQL Editor:');
        console.log('See: data/migrations/001_create_ingest_events.sql\n');
        return false;
      }
      throw error;
    }

    // Check if we have data, inspect columns
    if (data && data.length > 0) {
      const columns = Object.keys(data[0]);
      console.log(`✅ Table exists with columns: ${columns.join(', ')}`);
      
      if (!columns.includes('text')) {
        console.error('❌ Column "text" not found!');
        console.log('Available columns:', columns);
        console.log('\n📋 Run this SQL to add the column:');
        console.log('ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS text TEXT;');
        return false;
      }
      console.log('✅ Column "text" exists');
    } else {
      console.log('✅ Table exists (empty)');
      // Try to insert a test row to check schema
      const { error: testError } = await (supabase as any)
        .from('ingest_events')
        .insert({
          call_id: 'schema-test',
          seq: 0,
          ts: new Date().toISOString(),
          text: 'test',
        })
        .select();
      
      if (testError) {
        console.error('❌ Schema test failed:', testError.message);
        return false;
      }
      
      // Clean up test row
      await (supabase as any)
        .from('ingest_events')
        .delete()
        .eq('call_id', 'schema-test');
      
      console.log('✅ Schema validation passed');
    }
  } catch (err: any) {
    console.error('❌ Error checking schema:', err.message);
    return false;
  }

  console.log('\n✅ All schema checks passed!');
  return true;
}

checkSchema()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });


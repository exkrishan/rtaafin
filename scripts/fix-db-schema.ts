#!/usr/bin/env tsx
/**
 * Fix Database Schema Script
 * Creates or fixes the ingest_events table structure
 */

import { supabase } from '../lib/supabase';

async function fixSchema() {
  console.log('🔧 Fixing database schema...\n');

  // First, check what columns exist
  console.log('Step 1: Checking current table structure...');
  try {
    const { data, error } = await supabase
      .from('ingest_events')
      .select('*')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('❌ Table does not exist. Creating it...');
        // Table doesn't exist - we'll need to create it via SQL
        console.log('\n📋 Please run this SQL in Supabase SQL Editor:');
        console.log(`
CREATE TABLE IF NOT EXISTS ingest_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(call_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_ingest_events_call_id ON ingest_events(call_id);
CREATE INDEX IF NOT EXISTS idx_ingest_events_call_seq ON ingest_events(call_id, seq);
CREATE INDEX IF NOT EXISTS idx_ingest_events_created_at ON ingest_events(created_at);
        `);
        return false;
      }
      throw error;
    }

    // Table exists, check columns
    if (data && data.length > 0) {
      const columns = Object.keys(data[0]);
      console.log(`✅ Table exists with columns: ${columns.join(', ')}`);
      
      const requiredColumns = ['call_id', 'seq', 'ts', 'text'];
      const missingColumns = requiredColumns.filter(col => !columns.includes(col));
      
      if (missingColumns.length > 0) {
        console.log(`\n❌ Missing columns: ${missingColumns.join(', ')}`);
        console.log('\n📋 Please run this SQL in Supabase SQL Editor to add missing columns:');
        
        const alterStatements = missingColumns.map(col => {
          let type = 'TEXT';
          if (col === 'seq') type = 'INTEGER';
          if (col === 'ts') type = 'TIMESTAMPTZ';
          return `ALTER TABLE ingest_events ADD COLUMN IF NOT EXISTS ${col} ${type}${col === 'seq' ? '' : col === 'text' ? ' NOT NULL' : ' NOT NULL'};`;
        });
        
        console.log(alterStatements.join('\n'));
        return false;
      }
      
      console.log('✅ All required columns exist!');
      return true;
    } else {
      // Empty table - try to insert a test row to verify schema
      console.log('Table exists but is empty. Testing schema...');
      const testData = {
        call_id: 'schema-test',
        seq: 0,
        ts: new Date().toISOString(),
        text: 'test',
      };
      
      const { error: insertError } = await supabase
        .from('ingest_events')
        .insert(testData);
      
      if (insertError) {
        console.error('❌ Schema test failed:', insertError.message);
        console.log('\n📋 Error suggests table structure is different.');
        console.log('Please check the table structure in Supabase and ensure it matches:');
        console.log('  - call_id (TEXT)');
        console.log('  - seq (INTEGER)');
        console.log('  - ts (TIMESTAMPTZ)');
        console.log('  - text (TEXT)');
        return false;
      }
      
      // Clean up
      await supabase
        .from('ingest_events')
        .delete()
        .eq('call_id', 'schema-test');
      
      console.log('✅ Schema validation passed!');
      return true;
    }
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

console.log('📋 Database Schema Fixer\n');
console.log('This script will check and help fix the ingest_events table structure.\n');

fixSchema()
  .then((success) => {
    if (success) {
      console.log('\n✅ Schema is correct! You can now use the demo.');
    } else {
      console.log('\n⚠️  Please fix the schema using the SQL provided above, then run this script again.');
    }
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });


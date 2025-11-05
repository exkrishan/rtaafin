/**
 * Test script to check disposition taxonomy API and structure
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { supabase } from '../lib/supabase';

async function testDispositionTaxonomy() {
  console.log('\n🔍 Testing Disposition Taxonomy\n');
  console.log('='.repeat(60));

  try {
    // Check if table exists
    const { data, error } = await supabase
      .from('disposition_taxonomy')
      .select('code, title, tags')
      .limit(10);

    if (error) {
      console.error('❌ Error querying disposition_taxonomy:', error);
      console.log('\n📋 Possible issues:');
      console.log('   1. Table does not exist');
      console.log('   2. Table exists but no data');
      console.log('   3. Permission issue');
      return;
    }

    console.log(`✅ Found ${data?.length || 0} dispositions in taxonomy\n`);

    if (!data || data.length === 0) {
      console.log('⚠️  No dispositions found in taxonomy table');
      console.log('   The table may need to be seeded with data.');
      return;
    }

    console.log('📋 Sample Dispositions:');
    data.slice(0, 5).forEach((item, i) => {
      console.log(`\n   ${i + 1}. Code: ${item.code}`);
      console.log(`      Title: ${item.title}`);
      console.log(`      Tags: ${JSON.stringify(item.tags || [])}`);
    });

    // Check for sub-dispositions (if they exist in a different structure)
    const { data: allData } = await supabase
      .from('disposition_taxonomy')
      .select('*')
      .limit(1);

    if (allData && allData.length > 0) {
      console.log('\n📊 Table Structure:');
      console.log('   Columns:', Object.keys(allData[0]));
    }

  } catch (err: any) {
    console.error('❌ Unexpected error:', err.message);
  }
}

testDispositionTaxonomy();

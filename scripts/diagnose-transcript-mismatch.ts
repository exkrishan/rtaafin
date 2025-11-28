#!/usr/bin/env tsx
/**
 * Diagnostic script to identify callId mismatch between API and UI
 * 
 * This script:
 * 1. Checks what transcripts exist in the database
 * 2. Shows what callIds are being used
 * 3. Helps identify why transcripts aren't showing in UI
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function diagnose() {
  console.log('🔍 Diagnosing transcript callId mismatch...\n');
  
  // 1. Check all recent transcripts
  console.log('📊 Recent transcripts in database:');
  console.log('─'.repeat(80));
  
  const { data: recentTranscripts, error: transcriptError } = await supabase
    .from('ingest_events')
    .select('call_id, seq, text, ts, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (transcriptError) {
    console.error('❌ Error fetching transcripts:', transcriptError);
    return;
  }
  
  if (!recentTranscripts || recentTranscripts.length === 0) {
    console.log('⚠️  No transcripts found in database');
    return;
  }
  
  // Group by callId
  const callIds = new Set<string>();
  const transcriptsByCallId = new Map<string, any[]>();
  
  for (const transcript of recentTranscripts) {
    callIds.add(transcript.call_id);
    if (!transcriptsByCallId.has(transcript.call_id)) {
      transcriptsByCallId.set(transcript.call_id, []);
    }
    transcriptsByCallId.get(transcript.call_id)!.push(transcript);
  }
  
  console.log(`Found ${callIds.size} unique callId(s):\n`);
  
  for (const callId of callIds) {
    const transcripts = transcriptsByCallId.get(callId)!;
    const sortedTranscripts = transcripts.sort((a, b) => a.seq - b.seq);
    const latestTranscript = sortedTranscripts[sortedTranscripts.length - 1];
    
    console.log(`\n📞 Call ID: ${callId}`);
    console.log(`   📝 Transcript count: ${transcripts.length}`);
    console.log(`   🔢 Seq range: ${sortedTranscripts[0].seq} - ${latestTranscript.seq}`);
    console.log(`   🕐 Latest timestamp: ${latestTranscript.created_at}`);
    console.log(`   💬 Latest text: "${latestTranscript.text.substring(0, 60)}${latestTranscript.text.length > 60 ? '...' : ''}"`);
  }
  
  console.log('\n' + '─'.repeat(80));
  
  // 2. Check if test-deployment-001 exists
  console.log('\n🔍 Checking for "test-deployment-001" (from your curl command):');
  
  const { data: testData, error: testError } = await supabase
    .from('ingest_events')
    .select('*')
    .eq('call_id', 'test-deployment-001')
    .order('seq', { ascending: true });
  
  if (testError) {
    console.error('❌ Error checking test-deployment-001:', testError);
  } else if (!testData || testData.length === 0) {
    console.log('⚠️  No transcripts found for callId="test-deployment-001"');
    console.log('   This means the curl command either failed or used a different callId');
  } else {
    console.log(`✅ Found ${testData.length} transcript(s) for "test-deployment-001":`);
    for (const t of testData) {
      console.log(`   seq=${t.seq}, text="${t.text}", ts=${t.ts}`);
    }
  }
  
  // 3. Provide guidance
  console.log('\n' + '='.repeat(80));
  console.log('💡 DIAGNOSIS & SOLUTION:');
  console.log('='.repeat(80));
  
  console.log('\nThe UI shows "Waiting for transcript..." because of a callId mismatch.');
  console.log('\n📌 To fix this:');
  console.log('\n1️⃣  Check what callId the UI is using:');
  console.log('   - Open browser DevTools (F12)');
  console.log('   - Check the Console tab');
  console.log('   - Look for logs like: "[API-CALL] 🌐 Making polling request"');
  console.log('   - Note the callId in the URL');
  
  console.log('\n2️⃣  Then send your curl command with that EXACT callId:');
  console.log('\n   curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{');
  console.log('       "callId": "<USE_THE_CALLID_FROM_BROWSER_CONSOLE>",');
  console.log('       "transcript": "Testing external ASR integration",');
  console.log('       "session_id": null,');
  console.log('       "asr_service": "Azure",');
  console.log('       "timestamp": "2024-11-28T12:00:00Z",');
  console.log('       "isFinal": true');
  console.log('     }\'');
  
  console.log('\n3️⃣  Or test with the callIds found in the database:');
  for (const callId of callIds) {
    console.log(`   - "${callId}"`);
  }
  
  console.log('\n' + '='.repeat(80));
}

diagnose().catch(err => {
  console.error('❌ Script error:', err);
  process.exit(1);
});


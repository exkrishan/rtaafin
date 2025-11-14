#!/usr/bin/env node
/**
 * Analyze transcript logs from Render (copied from dashboard)
 * 
 * Usage:
 *   1. Copy logs from Render Dashboard → Service → Logs
 *   2. Save to a file: logs.txt
 *   3. Run: node scripts/analyze-transcript-logs.js logs.txt [interaction_id]
 */

const fs = require('fs');

function main() {
  const logFile = process.argv[2];
  const interactionIdArg = process.argv[3];

  if (!logFile) {
    console.log('Usage: node scripts/analyze-transcript-logs.js <log-file> [interaction_id]');
    console.log('');
    console.log('Steps:');
    console.log('1. Go to Render Dashboard → ASR Worker → Logs');
    console.log('2. Copy recent logs (last 5-10 minutes)');
    console.log('3. Save to a file: logs.txt');
    console.log('4. Run: node scripts/analyze-transcript-logs.js logs.txt');
    process.exit(1);
  }

  if (!fs.existsSync(logFile)) {
    console.error(`❌ Log file not found: ${logFile}`);
    process.exit(1);
  }

  const logContent = fs.readFileSync(logFile, 'utf-8');
  const lines = logContent.split('\n');

  console.log(`📊 Analyzing ${lines.length} log lines from ${logFile}\n`);

  // Extract interaction IDs
  const interactionIds = new Set();
  lines.forEach(line => {
    const matches = line.match(/interaction_id[:\s]+['"]([a-f0-9]+)['"]/i) ||
                    line.match(/interaction_id[:\s]+([a-f0-9]{32})/i) ||
                    line.match(/interactionId[:\s]+['"]([a-f0-9]+)['"]/i);
    if (matches) {
      interactionIds.add(matches[1]);
    }
  });

  // Determine target interaction_id
  let targetInteractionId = interactionIdArg;
  if (!targetInteractionId && interactionIds.size > 0) {
    const recentIds = Array.from(interactionIds);
    targetInteractionId = recentIds[0];
    console.log(`🎯 Found ${interactionIds.size} interaction ID(s). Using most recent: ${targetInteractionId}`);
    if (recentIds.length > 1) {
      console.log(`   Other IDs: ${recentIds.slice(1).join(', ')}`);
    }
    console.log('');
  } else if (targetInteractionId) {
    console.log(`🎯 Filtering for interaction_id: ${targetInteractionId}\n`);
  } else {
    console.log('⚠️  No interaction_id found. Showing all transcript-related logs...\n');
  }

  // Filter logs
  let filteredLines = lines;
  if (targetInteractionId) {
    filteredLines = lines.filter(line => line.includes(targetInteractionId));
  }

  // Filter for transcript-related logs
  const transcriptLines = filteredLines.filter(line => {
    const lower = line.toLowerCase();
    return lower.includes('transcript') ||
           lower.includes('deepgram') ||
           lower.includes('step 2') ||
           lower.includes('published') ||
           lower.includes('empty') ||
           lower.includes('timeout') ||
           lower.includes('socket') ||
           lower.includes('ready') ||
           lower.includes('interaction_id');
  });

  console.log('='.repeat(80));
  console.log(`📨 Transcript-related logs${targetInteractionId ? ` for ${targetInteractionId}` : ''}:`);
  console.log('='.repeat(80));
  console.log('');

  if (transcriptLines.length === 0) {
    console.log('❌ No transcript-related logs found.');
    if (targetInteractionId) {
      console.log(`   Try without interaction_id to see all logs.`);
    }
    process.exit(1);
  }

  // Show logs
  transcriptLines.slice(0, 200).forEach(line => {
    console.log(line);
  });

  if (transcriptLines.length > 200) {
    console.log(`\n... and ${transcriptLines.length - 200} more log lines`);
  }

  // Summary statistics
  console.log('\n' + '='.repeat(80));
  console.log('📊 Summary:');
  console.log('='.repeat(80));

  const summary = {
    totalLogs: transcriptLines.length,
    transcriptsPublished: transcriptLines.filter(l => 
      l.includes('Published') && l.includes('transcript')
    ).length,
    emptyTranscripts: transcriptLines.filter(l => 
      l.toLowerCase().includes('empty') && 
      l.toLowerCase().includes('transcript')
    ).length,
    timeouts: transcriptLines.filter(l => 
      l.includes('TIMEOUT') || l.includes('1011')
    ).length,
    deepgramReceived: transcriptLines.filter(l => 
      l.includes('DEEPGRAM TRANSCRIPT RECEIVED')
    ).length,
    socketOpen: transcriptLines.filter(l => 
      l.includes('Socket is OPEN')
    ).length,
    socketConnecting: transcriptLines.filter(l => 
      l.includes('CONNECTING')
    ).length,
    audioChunksSent: transcriptLines.filter(l => 
      l.includes('Sending audio chunk')
    ).length,
  };

  console.log(`Total transcript-related logs: ${summary.totalLogs}`);
  console.log(`✅ Transcripts published: ${summary.transcriptsPublished}`);
  console.log(`📨 Deepgram transcripts received: ${summary.deepgramReceived}`);
  console.log(`📤 Audio chunks sent: ${summary.audioChunksSent}`);
  console.log(`🔌 Socket OPEN events: ${summary.socketOpen}`);
  console.log(`⚠️  Socket CONNECTING events: ${summary.socketConnecting}`);
  console.log(`⚠️  Empty transcripts: ${summary.emptyTranscripts}`);
  console.log(`❌ Timeouts: ${summary.timeouts}`);

  // Health assessment
  console.log('\n' + '='.repeat(80));
  console.log('🏥 Health Assessment:');
  console.log('='.repeat(80));

  if (summary.transcriptsPublished > 0 && summary.emptyTranscripts === 0 && summary.timeouts === 0) {
    console.log('✅ HEALTHY: Transcripts are flowing correctly');
  } else if (summary.transcriptsPublished === 0) {
    console.log('❌ CRITICAL: No transcripts published');
    if (summary.deepgramReceived === 0) {
      console.log('   → Deepgram is not sending transcripts');
    }
    if (summary.socketConnecting > summary.socketOpen) {
      console.log('   → Socket is stuck in CONNECTING state');
    }
    if (summary.audioChunksSent === 0) {
      console.log('   → No audio chunks being sent to Deepgram');
    }
  } else if (summary.emptyTranscripts > 0) {
    console.log('⚠️  WARNING: Empty transcripts detected');
    console.log(`   → ${summary.emptyTranscripts} empty transcript(s) found`);
  } else if (summary.timeouts > 0) {
    console.log('❌ ERROR: Timeouts detected');
    console.log(`   → ${summary.timeouts} timeout(s) found`);
  }

  console.log('');
}

main();




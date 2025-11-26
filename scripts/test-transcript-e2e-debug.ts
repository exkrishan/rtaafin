#!/usr/bin/env tsx
/**
 * Phase 2: E2E Transcript Pipeline Test
 * 
 * Comprehensive test that simulates the complete flow:
 * 1. Connect to SSE endpoint (like frontend)
 * 2. Send progressive transcripts via ingest API
 * 3. Monitor each step of the pipeline
 * 4. Identify exactly where transcripts are lost
 * 
 * Usage:
 *   npx tsx scripts/test-transcript-e2e-debug.ts [callId]
 * 
 * Example:
 *   npx tsx scripts/test-transcript-e2e-debug.ts test-call-123
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  timestamp: string;
}

interface SSEEvent {
  type: string;
  callId?: string;
  seq?: number;
  text?: string;
  speaker?: string;
  ts?: string;
  [key: string]: any;
}

class TranscriptE2ETester {
  private callId: string;
  private baseUrl: string;
  private results: TestResult[] = [];
  private sseEvents: SSEEvent[] = [];
  private sseConnection: any = null;
  private sseConnected: boolean = false;
  private transcriptsSent: number = 0;
  private transcriptsReceived: number = 0;

  constructor(callId: string) {
    this.callId = callId;
    this.baseUrl = baseUrl;
  }

  private logResult(result: TestResult): void {
    this.results.push(result);
    const icon = result.success ? '✅' : '❌';
    console.log(`\n${icon} ${result.step}`);
    console.log(`   ${result.message}`);
    if (result.data) {
      console.log(`   Data:`, JSON.stringify(result.data, null, 2));
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log(`   Time: ${result.timestamp}`);
  }

  /**
   * Step 0: Check server health
   */
  async checkServerHealth(): Promise<boolean> {
    console.log('\n' + '='.repeat(80));
    console.log('STEP 0: Checking Server Health');
    console.log('='.repeat(80));

    try {
      // Try a simple health check endpoint or root
      const healthUrl = `${this.baseUrl}/api/calls/active?limit=1`;
      console.log(`   Checking: ${healthUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.ok || response.status === 200) {
        console.log(`   ✅ Server is responding (${response.status})`);
        return true;
      } else {
        console.log(`   ⚠️  Server returned ${response.status} (but it's responding)`);
        return true; // Still proceed if server responds
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`   ❌ Server not responding (timeout after 3s)`);
        console.log(`   💡 Make sure Next.js dev server is running: npm run dev`);
      } else {
        console.log(`   ❌ Server check failed: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Step 1: Test SSE Connection
   */
  async testSSEConnection(): Promise<boolean> {
    console.log('\n' + '='.repeat(80));
    console.log('STEP 1: Testing SSE Connection');
    console.log('='.repeat(80));

    const sseUrl = `${this.baseUrl}/api/events/stream?callId=${encodeURIComponent(this.callId)}`;
    console.log(`   Connecting to: ${sseUrl}`);
    console.log(`   Note: SSE connections stay open, this may take a moment...`);
    
    try {
      // For SSE, we need to allow more time for the connection to establish
      // The headers should come back quickly, but the stream stays open
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for SSE
      
      const response = await fetch(sseUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logResult({
          step: 'SSE Connection',
          success: false,
          message: `SSE endpoint returned ${response.status}`,
          error: await response.text(),
          timestamp: new Date().toISOString(),
        });
        return false;
      }

      // Start reading the stream
      if (!response.body) {
        this.logResult({
          step: 'SSE Connection',
          success: false,
          message: 'SSE response has no body',
          timestamp: new Date().toISOString(),
        });
        return false;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Set up event listener (simulating EventSource)
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log('\n   📴 SSE stream closed');
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            let currentEvent: string | null = null;
            let currentData: string | null = null;

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.substring(7).trim();
              } else if (line.startsWith('data: ')) {
                currentData = line.substring(6).trim();
              } else if (line === '') {
                // Empty line = end of event
                if (currentData) {
                  try {
                    const parsed = JSON.parse(currentData) as SSEEvent;
                    this.handleSSEEvent(currentEvent || 'message', parsed);
                  } catch (e) {
                    // Not JSON, might be a comment or other data
                    if (currentData && !currentData.startsWith(':')) {
                      console.log(`   📨 Received non-JSON data: ${currentData.substring(0, 100)}`);
                    }
                  }
                }
                currentEvent = null;
                currentData = null;
              }
            }
          }
        } catch (error: any) {
          if (error.message !== 'AbortError') {
            console.error(`   ❌ Error reading SSE stream: ${error.message}`);
          }
        }
      };

      // Start processing stream in background (non-blocking)
      processStream().catch((err) => {
        // Only log non-abort errors
        if (err.name !== 'AbortError' && err.message !== 'AbortError') {
          console.error(`   ⚠️  Stream processing error: ${err.message}`);
        }
      });

      this.sseConnection = { reader, response };
      this.sseConnected = true;

      this.logResult({
        step: 'SSE Connection',
        success: true,
        message: `Connected to SSE endpoint`,
        data: {
          url: sseUrl,
          callId: this.callId,
          contentType: response.headers.get('content-type'),
        },
        timestamp: new Date().toISOString(),
      });

      // Wait briefly for initial connection event, then proceed (non-blocking)
      console.log('   ⏳ Waiting 2 seconds for initial connection event...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('   ✅ Proceeding to next step (stream continues in background)');

      return true;
    } catch (error: any) {
      // Handle timeout specifically
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        this.logResult({
          step: 'SSE Connection',
          success: false,
          message: 'SSE connection timeout (10 seconds)',
          error: 'Connection took too long. This may be normal for SSE - will continue testing ingest API',
          timestamp: new Date().toISOString(),
        });
        // Don't return false - allow script to continue and test ingest API
        console.log('\n   ⚠️  Continuing anyway - will test ingest API to see if events are broadcast');
        return true; // Allow continuation
      } else {
        this.logResult({
          step: 'SSE Connection',
          success: false,
          message: 'Failed to connect to SSE endpoint',
          error: error.message || String(error),
          timestamp: new Date().toISOString(),
        });
        // Still allow continuation
        console.log('\n   ⚠️  Continuing anyway - will test ingest API');
        return true;
      }
    }
  }

  /**
   * Handle SSE events
   */
  private handleSSEEvent(eventType: string, data: SSEEvent): void {
    this.sseEvents.push(data);
    
    if (eventType === 'transcript_line' || data.type === 'transcript_line') {
      this.transcriptsReceived++;
      
      console.log(`\n   📥 Received transcript_line event:`);
      console.log(`      CallId: ${data.callId}`);
      console.log(`      Expected: ${this.callId}`);
      console.log(`      Match: ${data.callId === this.callId ? '✅' : '❌'}`);
      console.log(`      Seq: ${data.seq}`);
      console.log(`      Text: ${data.text?.substring(0, 50)}...`);
      console.log(`      Speaker: ${data.speaker || 'not provided'}`);
      
      // Check if this matches what we sent
      if (data.callId === this.callId && data.text) {
        console.log(`      ✅ VALID TRANSCRIPT - Should appear in UI!`);
      } else if (data.callId !== this.callId) {
        console.log(`      ⚠️  CallId mismatch - Will be filtered by frontend`);
      } else if (!data.text) {
        console.log(`      ⚠️  Empty text - Will be filtered by frontend`);
      }
    } else if (eventType === 'intent_update' || data.type === 'intent_update') {
      console.log(`\n   📚 Received intent_update event:`);
      console.log(`      Intent: ${data.intent}`);
      console.log(`      Confidence: ${data.confidence}`);
      console.log(`      Articles: ${data.articles?.length || 0}`);
    } else {
      console.log(`\n   📨 Received ${eventType} event:`, JSON.stringify(data, null, 2));
    }
  }

  /**
   * Step 2: Send progressive transcripts
   */
  async sendProgressiveTranscripts(): Promise<boolean> {
    console.log('\n' + '='.repeat(80));
    console.log('STEP 2: Sending Progressive Transcripts');
    console.log('='.repeat(80));

    const testTranscripts = [
      { text: "Customer: Hi, I'm calling about my credit card. I noticed a fraudulent transaction.", speaker: "customer" },
      { text: "Agent: I understand your concern. Let me help you with that. Can you provide your card number?", speaker: "agent" },
      { text: "Customer: Yes, it's ending in 7792. The transaction was for $500 yesterday.", speaker: "customer" },
      { text: "Agent: Thank you. I can see the unauthorized charge. I'll help you dispute this transaction.", speaker: "agent" },
      { text: "Customer: That would be great. How long will it take to get a replacement card?", speaker: "customer" },
    ];

    const ingestUrl = `${this.baseUrl}/api/calls/ingest-transcript`;

    for (let i = 0; i < testTranscripts.length; i++) {
      const transcript = testTranscripts[i];
      const seq = i + 1;
      const delay = i * 1000; // 1 second between transcripts

      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        const payload = {
          callId: this.callId,
          seq,
          ts: new Date().toISOString(),
          text: transcript.text,
        };

        console.log(`\n   📤 Sending transcript ${seq}/${testTranscripts.length}:`);
        console.log(`      Text: ${transcript.text.substring(0, 60)}...`);
        console.log(`      CallId: ${this.callId}`);

        const response = await fetch(ingestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'default',
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (response.ok && result.ok) {
          this.transcriptsSent++;
          console.log(`      ✅ Ingest successful`);
          console.log(`      Intent: ${result.intent || 'none'}`);
          console.log(`      Articles: ${result.articles?.length || 0}`);
          
          this.logResult({
            step: `Send Transcript ${seq}`,
            success: true,
            message: `Transcript ingested successfully`,
            data: {
              seq,
              textLength: transcript.text.length,
              intent: result.intent,
              articlesCount: result.articles?.length || 0,
            },
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log(`      ❌ Ingest failed: ${result.error || 'Unknown error'}`);
          this.logResult({
            step: `Send Transcript ${seq}`,
            success: false,
            message: `Failed to ingest transcript`,
            error: result.error || 'Unknown error',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error: any) {
        console.log(`      ❌ Network error: ${error.message}`);
        this.logResult({
          step: `Send Transcript ${seq}`,
          success: false,
          message: `Network error sending transcript`,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Wait for all events to be received
    console.log('\n   ⏳ Waiting 5 seconds for all SSE events to arrive...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    return true;
  }

  /**
   * Step 3: Analyze results
   */
  analyzeResults(): void {
    console.log('\n' + '='.repeat(80));
    console.log('STEP 3: Analysis & Diagnostics');
    console.log('='.repeat(80));

    const transcriptEvents = this.sseEvents.filter(e => 
      e.type === 'transcript_line' || 
      (e as any).type === 'transcript_line'
    );

    console.log(`\n📊 Summary:`);
    console.log(`   Transcripts Sent: ${this.transcriptsSent}`);
    console.log(`   Transcript Events Received: ${transcriptEvents.length}`);
    console.log(`   Total SSE Events: ${this.sseEvents.length}`);

    // Analyze callId matching
    const matchingEvents = transcriptEvents.filter(e => e.callId === this.callId);
    const mismatchedEvents = transcriptEvents.filter(e => e.callId && e.callId !== this.callId);
    const eventsWithoutCallId = transcriptEvents.filter(e => !e.callId);

    console.log(`\n🔍 CallId Analysis:`);
    console.log(`   ✅ Matching callId: ${matchingEvents.length}`);
    console.log(`   ❌ Mismatched callId: ${mismatchedEvents.length}`);
    console.log(`   ⚠️  No callId: ${eventsWithoutCallId.length}`);

    if (mismatchedEvents.length > 0) {
      console.log(`\n   ⚠️  Mismatched Events:`);
      mismatchedEvents.forEach(e => {
        console.log(`      Event callId: "${e.callId}" (expected: "${this.callId}")`);
      });
    }

    // Analyze text content
    const eventsWithText = transcriptEvents.filter(e => e.text && e.text.trim().length > 0);
    const eventsWithoutText = transcriptEvents.filter(e => !e.text || e.text.trim().length === 0);

    console.log(`\n📝 Text Analysis:`);
    console.log(`   ✅ Events with text: ${eventsWithText.length}`);
    console.log(`   ❌ Events without text: ${eventsWithoutText.length}`);

    // Check for system messages
    const systemMessages = transcriptEvents.filter(e => 
      e.text?.includes('Connected to realtime stream') || 
      e.text?.includes('clientId:') ||
      e.callId === 'system'
    );

    if (systemMessages.length > 0) {
      console.log(`\n   ℹ️  System messages (will be filtered): ${systemMessages.length}`);
    }

    // Final verdict
    console.log(`\n🎯 Verdict:`);
    
    if (matchingEvents.length === this.transcriptsSent && eventsWithText.length === this.transcriptsSent) {
      console.log(`   ✅ SUCCESS: All transcripts should appear in UI!`);
      console.log(`      - All ${this.transcriptsSent} transcripts sent successfully`);
      console.log(`      - All ${matchingEvents.length} events received with matching callId`);
      console.log(`      - All ${eventsWithText.length} events have valid text`);
    } else if (matchingEvents.length === 0 && this.transcriptsSent > 0) {
      console.log(`   ❌ FAILURE: CallId mismatch detected!`);
      console.log(`      - ${this.transcriptsSent} transcripts sent`);
      console.log(`      - 0 events with matching callId`);
      console.log(`      - Frontend is filtering out all events`);
      console.log(`\n   💡 Solution: Ensure UI connects with callId: "${this.callId}"`);
    } else if (matchingEvents.length < this.transcriptsSent) {
      console.log(`   ⚠️  PARTIAL: Some transcripts missing`);
      console.log(`      - ${this.transcriptsSent} transcripts sent`);
      console.log(`      - ${matchingEvents.length} events with matching callId`);
      console.log(`      - ${this.transcriptsSent - matchingEvents.length} transcripts lost`);
    } else if (eventsWithText.length < matchingEvents.length) {
      console.log(`   ⚠️  PARTIAL: Some events have empty text`);
      console.log(`      - ${matchingEvents.length} events with matching callId`);
      console.log(`      - ${eventsWithText.length} events with valid text`);
    }

    // Detailed event log
    if (transcriptEvents.length > 0) {
      console.log(`\n📋 Detailed Event Log:`);
      transcriptEvents.forEach((event, idx) => {
        console.log(`\n   Event ${idx + 1}:`);
        console.log(`      Type: ${event.type}`);
        console.log(`      CallId: ${event.callId || '(missing)'} ${event.callId === this.callId ? '✅' : '❌'}`);
        console.log(`      Seq: ${event.seq || '(missing)'}`);
        console.log(`      Text: ${event.text ? event.text.substring(0, 50) + '...' : '(empty)'} ${event.text && event.text.trim().length > 0 ? '✅' : '❌'}`);
        console.log(`      Speaker: ${event.speaker || '(not provided)'}`);
        console.log(`      Will appear in UI: ${event.callId === this.callId && event.text && event.text.trim().length > 0 ? '✅ YES' : '❌ NO'}`);
      });
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.sseConnection?.reader) {
      try {
        await this.sseConnection.reader.cancel();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Run full test
   */
  async run(): Promise<void> {
    console.log('\n' + '🚀'.repeat(40));
    console.log('PHASE 2: E2E Transcript Pipeline Test');
    console.log('🚀'.repeat(40));
    console.log(`\nCall ID: ${this.callId}`);
    console.log(`Base URL: ${this.baseUrl}`);
    console.log(`\nThis test will:`);
    console.log(`  1. Connect to SSE endpoint (simulating frontend)`);
    console.log(`  2. Send progressive transcripts via ingest API`);
    console.log(`  3. Monitor if events are received`);
    console.log(`  4. Analyze where transcripts are lost\n`);

    try {
      // Step 0: Check server health
      const serverHealthy = await this.checkServerHealth();
      if (!serverHealthy) {
        console.log('\n❌ Cannot proceed - server is not responding');
        console.log('   Please start the Next.js dev server: npm run dev');
        return;
      }

      // Step 1: Connect to SSE (optional - script can continue even if this fails)
      const sseConnected = await this.testSSEConnection();
      if (!sseConnected) {
        console.log('\n⚠️  SSE connection failed, but continuing to test ingest API...');
        console.log('   Events may still be broadcast even if SSE connection failed');
      }

      // Step 2: Send transcripts
      await this.sendProgressiveTranscripts();

      // Step 3: Analyze
      this.analyzeResults();

      // Final summary
      console.log('\n' + '='.repeat(80));
      console.log('TEST COMPLETE');
      console.log('='.repeat(80));
      console.log(`\n📊 Final Statistics:`);
      console.log(`   Total Steps: ${this.results.length}`);
      console.log(`   Successful: ${this.results.filter(r => r.success).length}`);
      console.log(`   Failed: ${this.results.filter(r => !r.success).length}`);
      console.log(`   Transcripts Sent: ${this.transcriptsSent}`);
      console.log(`   Transcript Events Received: ${this.sseEvents.filter(e => e.type === 'transcript_line').length}`);

      console.log(`\n💡 Next Steps:`);
      if (this.transcriptsSent > 0 && this.sseEvents.filter(e => e.type === 'transcript_line' && e.callId === this.callId).length === 0) {
        console.log(`   1. Check if UI is connected with callId: "${this.callId}"`);
        console.log(`   2. Open browser console and check for callId mismatch warnings`);
        console.log(`   3. Verify SSE connection in UI shows "Connected"`);
      } else if (this.transcriptsSent === this.sseEvents.filter(e => e.type === 'transcript_line' && e.callId === this.callId).length) {
        console.log(`   ✅ All transcripts received! If UI still doesn't show them:`);
        console.log(`   1. Check browser console for filtering logic`);
        console.log(`   2. Verify utterances state is being updated`);
        console.log(`   3. Check if component is rendering utterances`);
      }

    } catch (error: any) {
      console.error('\n❌ Fatal error:', error);
    } finally {
      await this.cleanup();
    }
  }
}

// Main
async function main() {
  const callId = process.argv[2] || `test-e2e-${Date.now()}`;
  
  const tester = new TranscriptE2ETester(callId);
  await tester.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


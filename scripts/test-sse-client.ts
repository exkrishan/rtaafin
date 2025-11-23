#!/usr/bin/env tsx
/**
 * SSE Client Test - Tests Server-Sent Events for intent_update
 * 
 * Connects to SSE endpoint and listens for intent_update events
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

async function testSSEConnection(callId: string): Promise<void> {
  const sseUrl = `${baseUrl}/api/events/stream?callId=${callId}`;
  
  console.log('📡 Testing SSE Connection\n');
  console.log('='.repeat(60));
  console.log(`SSE URL: ${sseUrl}`);
  console.log('');

  // Note: Node.js doesn't have native EventSource, so we'll use fetch with stream
  // For a real test, use a browser or a library like eventsource
  
  try {
    const response = await fetch(sseUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      console.log(`❌ SSE endpoint returned ${response.status}`);
      const errorText = await response.text();
      console.log(`   ${errorText}`);
      return;
    }

    console.log('✅ SSE endpoint is accessible');
    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);
    console.log('');
    console.log('ℹ️  Note: Full SSE testing requires EventSource (browser or library)');
    console.log('   To test in browser, open:');
    console.log(`   ${sseUrl}`);
    console.log('');
    console.log('   Then send a transcript via API to trigger intent_update event');
    console.log('');

    // Try to read a few lines from the stream
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let receivedData = false;
      let timeout: NodeJS.Timeout;

      console.log('⏳ Waiting for events (10 second timeout)...');
      console.log('   Send a transcript via API to trigger events');
      console.log('');

      const readPromise = (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                receivedData = true;
                const data = line.substring(6);
                console.log(`📨 Received event: ${data.substring(0, 100)}...`);
                
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'intent_update') {
                    console.log(`   ✅ Intent Update Event:`);
                    console.log(`      Intent: ${parsed.intent}`);
                    console.log(`      Confidence: ${parsed.confidence}`);
                    console.log(`      Articles: ${parsed.articles?.length || 0}`);
                  }
                } catch (e) {
                  // Not JSON, that's ok
                }
              } else if (line.startsWith('event: ')) {
                const eventType = line.substring(7);
                console.log(`   Event Type: ${eventType}`);
              }
            }
          }
        } catch (error: any) {
          if (error.message !== 'AbortError') {
            console.error(`   Error reading stream: ${error.message}`);
          }
        }
      })();

      // Set timeout
      timeout = setTimeout(() => {
        reader.cancel();
        if (!receivedData) {
          console.log('⏱️  Timeout: No events received');
          console.log('   This is normal if no transcripts were sent');
        }
      }, 10000);

      await readPromise;
      clearTimeout(timeout);
    }

  } catch (error: any) {
    console.log(`❌ Error connecting to SSE: ${error.message}`);
    console.log(`   Make sure Next.js is running on ${baseUrl}`);
  }
}

async function main() {
  const callId = process.argv[2] || `test-sse-${Date.now()}`;
  
  console.log('🧪 SSE Client Test\n');
  console.log(`Call ID: ${callId}`);
  console.log('');

  await testSSEConnection(callId);

  console.log('');
  console.log('='.repeat(60));
  console.log('');
  console.log('💡 To test with actual events:');
  console.log(`   1. Keep this script running`);
  console.log(`   2. In another terminal, run:`);
  console.log(`      curl -X POST ${baseUrl}/api/calls/ingest-transcript \\`);
  console.log(`        -H "Content-Type: application/json" \\`);
  console.log(`        -H "x-tenant-id: test" \\`);
  console.log(`        -d '{"callId": "${callId}", "seq": 1, "ts": "${new Date().toISOString()}", "text": "I need to block my credit card"}'`);
  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


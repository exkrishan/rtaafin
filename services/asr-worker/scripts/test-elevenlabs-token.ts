/**
 * Quick test to verify ElevenLabs single-use token creation
 * This tests the fix for using single-use tokens instead of API keys directly
 * 
 * Usage:
 *   ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-token.ts
 */

async function testSingleUseToken() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY is required');
    console.error('   Set ELEVENLABS_API_KEY=your_api_key');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('🔑 Testing ElevenLabs Single-Use Token Creation');
  console.log('='.repeat(80));
  console.log(`API Key prefix: ${apiKey.substring(0, 15)}...\n`);

  try {
    console.log('📡 Calling /v1/single-use-token/realtime_scribe...');
    
    const response = await fetch(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    console.log(`📊 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to create token: ${response.status}`);
      console.error(`Response: ${errorText}`);
      
      if (response.status === 401) {
        console.error('\n💡 This likely means:');
        console.error('   1. API key is invalid or expired');
        console.error('   2. API key lacks Speech-to-Text permissions');
        console.error('   3. Account subscription doesn\'t include STT access');
      }
      
      process.exit(1);
    }

    const data = await response.json() as { token?: string };
    
    if (!data.token) {
      console.error('❌ No token in response');
      console.error('Response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('✅ Single-use token created successfully!');
    console.log(`Token prefix: ${data.token.substring(0, 20)}...`);
    console.log(`Token length: ${data.token.length} characters`);
    console.log('\n💡 Token expires after 15 minutes');
    console.log('💡 This token should be used in Scribe.connect(), not the API key\n');

    // Test if we can use this token to connect (optional - just verify format)
    console.log('='.repeat(80));
    console.log('✅ Test PASSED - Single-use token creation works!');
    console.log('='.repeat(80) + '\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testSingleUseToken().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


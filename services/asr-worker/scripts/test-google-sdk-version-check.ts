/**
 * Check if SDK version has known issues and try workaround
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testSDKWorkaround() {
  console.log('Testing with explicit project ID and minimal config...\n');
  
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json',
    projectId: 'gen-lang-client-0415704882',
  });

  await client.initialize();
  console.log('✅ Client initialized\n');

  const stream = client.streamingRecognize();

  let success = false;

  stream.on('data', (data) => {
    success = true;
    console.log('✅✅✅ SUCCESS! API is working!');
    console.log('Received data:', data.results?.length || 0, 'results');
  });

  stream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
    console.error('   Code:', error.code);
    
    // If it's still the malordered error, it might be an SDK bug
    if (error.code === 3 && error.message.includes('Malordered')) {
      console.error('\n⚠️  This appears to be an SDK or API issue.');
      console.error('   All configuration is correct, but API still rejects the request.');
      console.error('   Possible causes:');
      console.error('   1. SDK version bug (try different version)');
      console.error('   2. API regional issue');
      console.error('   3. Service account needs explicit "Cloud Speech-to-Text API User" role');
      console.error('      (even though Owner should work, try adding it explicitly)');
    }
  });

  // Try absolute minimal config - just encoding and sample rate
  console.log('Sending minimal config...');
  const minimalConfig = {
    streamingConfig: {
      config: {
        encoding: 1, // LINEAR16 enum
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    },
  };

  stream.write(minimalConfig);

  await new Promise(resolve => setTimeout(resolve, 3000));

  if (success) {
    console.log('\n✅ Test passed!');
  } else {
    console.log('\n❌ Test failed - error received');
  }

  stream.end();
}

testSDKWorkaround().catch(console.error);

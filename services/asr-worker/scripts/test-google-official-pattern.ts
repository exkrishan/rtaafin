/**
 * Test using the exact pattern from official Google docs
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testOfficialPattern() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json',
    projectId: 'gen-lang-client-0415704882',
  });

  // Pattern from official docs: pass config when creating stream
  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 8000,
      languageCode: 'en-US',
    },
    interimResults: true,
  };

  console.log('Creating stream with config...');
  const recognizeStream = client.streamingRecognize(request);

  recognizeStream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
    console.error('   Code:', error.code);
  });

  recognizeStream.on('data', (data) => {
    console.log('✅✅✅ SUCCESS! Data received!');
    if (data.results && data.results.length > 0) {
      console.log('Results:', data.results.length);
    }
  });

  // Wait a bit for stream to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  // Now send audio
  console.log('Sending audio...');
  const audio = Buffer.alloc(4000);
  
  // For streaming, we might need to write audioContent directly
  recognizeStream.write({
    audioContent: audio,
  });

  await new Promise(resolve => setTimeout(resolve, 3000));
  recognizeStream.end();
}

testOfficialPattern().catch(console.error);

/**
 * Alternative approach - check if stream needs to be 'ready' first
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testAlternative() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  // Wait for client to be ready
  await new Promise(resolve => setTimeout(resolve, 100));

  const stream = client.streamingRecognize();

  // Wait for stream to be ready
  await new Promise(resolve => setTimeout(resolve, 100));

  let hasError = false;

  stream.on('data', (data) => {
    if (!hasError) {
      console.log('✅ Data received');
    }
  });

  stream.on('error', (error: any) => {
    hasError = true;
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
  });

  // Try sending config after ensuring stream is ready
  console.log('📤 Sending config (after delay)...');
  
  // Use a very simple config
  const success = stream.write({
    streamingConfig: {
      config: {
        encoding: 1, // LINEAR16 enum value
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    },
  });

  console.log('Write success:', success);

  if (!success) {
    stream.once('drain', () => {
      console.log('Stream drained');
    });
  }

  // Wait longer before sending audio
  await new Promise(resolve => setTimeout(resolve, 2000));

  if (!hasError) {
    console.log('📤 Sending audio...');
    stream.write({
      audioContent: Buffer.alloc(4000),
    });
  }

  await new Promise(resolve => setTimeout(resolve, 2000));
  
  if (!hasError) {
    stream.end();
  }
}

testAlternative().catch(console.error);

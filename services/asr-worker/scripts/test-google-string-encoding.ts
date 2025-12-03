/**
 * Test with string encoding instead of enum
 */
import { SpeechClient } from '@google-cloud/speech';

async function testStringEncoding() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  const stream = client.streamingRecognize();

  stream.on('data', (data) => {
    console.log('✅ Data received');
  });

  stream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
  });

  // Try with string encoding
  console.log('📤 Sending config with string encoding...');
  stream.write({
    streamingConfig: {
      config: {
        encoding: 'LINEAR16', // String instead of enum
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    },
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('📤 Sending audio...');
  stream.write({
    audioContent: Buffer.alloc(4000),
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  stream.end();
}

testStringEncoding().catch(console.error);

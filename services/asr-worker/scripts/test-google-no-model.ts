/**
 * Test without model parameter - maybe model is causing issues
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testNoModel() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  const stream = client.streamingRecognize();

  stream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
  });

  stream.on('data', (data) => {
    console.log('✅ SUCCESS! Data received');
  });

  // Try minimal config without model
  console.log('Testing with minimal config (no model)...');
  const request: any = {
    streamingConfig: {
      config: {
        encoding: 'LINEAR16', // String instead of enum
        sampleRateHertz: 8000,
        languageCode: 'en-US',
        // No model specified
      },
      interimResults: true,
    },
  };

  const cleanRequest = Object.create(null);
  cleanRequest.streamingConfig = request.streamingConfig;

  stream.write(cleanRequest);

  await new Promise(resolve => setTimeout(resolve, 2000));

  if (!stream.destroyed) {
    console.log('Sending audio...');
    const audioRequest: any = Object.create(null);
    audioRequest.audioContent = Buffer.alloc(4000);
    stream.write(audioRequest);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  if (!stream.destroyed) {
    stream.end();
  }
}

testNoModel().catch(console.error);

/**
 * Check SDK behavior - try passing config to streamingRecognize()
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testSDK() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  console.log('Testing method 1: streamingRecognize() with no params...');
  try {
    const stream1 = client.streamingRecognize();
    console.log('✅ Method 1 works');
    stream1.end();
  } catch (e: any) {
    console.error('❌ Method 1 failed:', e.message);
  }

  console.log('\nTesting method 2: streamingRecognize(config)...');
  try {
    const stream2 = client.streamingRecognize({
      config: {
        encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    });
    console.log('✅ Method 2 works');
    stream2.end();
  } catch (e: any) {
    console.error('❌ Method 2 failed:', e.message);
  }

  console.log('\nChecking SDK version...');
  const pkg = require('@google-cloud/speech/package.json');
  console.log('SDK version:', pkg.version);
}

testSDK().catch(console.error);

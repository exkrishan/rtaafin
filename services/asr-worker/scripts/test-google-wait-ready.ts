/**
 * Test - wait for stream to be ready/connected before sending config
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testWaitReady() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  const stream = client.streamingRecognize();

  let streamReady = false;

  // Wait for stream to be ready
  stream.on('readable', () => {
    console.log('✅ Stream is readable');
    streamReady = true;
  });

  stream.on('connect', () => {
    console.log('✅ Stream connected');
    streamReady = true;
  });

  // Check stream state
  console.log('Stream readable:', stream.readable);
  console.log('Stream writable:', stream.writable);
  console.log('Stream destroyed:', (stream as any).destroyed);

  // Wait a bit for potential connection
  await new Promise(resolve => setTimeout(resolve, 1000));

  stream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
  });

  stream.on('data', (data) => {
    console.log('✅ Data received');
  });

  console.log('📤 Sending config (after wait)...');
  const configRequest = {
    streamingConfig: {
      config: {
        encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    },
  };

  stream.write(configRequest);

  await new Promise(resolve => setTimeout(resolve, 2000));
  stream.end();
}

testWaitReady().catch(console.error);

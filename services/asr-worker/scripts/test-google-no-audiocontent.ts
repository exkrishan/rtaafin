/**
 * Test - ensure audioContent field is completely absent, not null
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testNoAudioContent() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  const stream = client.streamingRecognize();

  stream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
  });

  stream.on('data', (data) => {
    console.log('✅ Data received!');
    if (data.results && data.results.length > 0) {
      console.log('Results:', data.results.length);
    }
  });

  // Create a plain object (not protobuf message) to avoid default null fields
  const configRequest: any = {
    streamingConfig: {
      config: {
        encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
      singleUtterance: false,
    },
  };

  // Explicitly ensure audioContent is NOT in the object at all
  Object.defineProperty(configRequest, 'audioContent', {
    enumerable: false,
    configurable: true,
    writable: true,
    value: undefined,
  });

  // Double check
  console.log('Config request keys:', Object.keys(configRequest));
  console.log('Has audioContent (in):', 'audioContent' in configRequest);
  console.log('Has audioContent (hasOwnProperty):', configRequest.hasOwnProperty('audioContent'));
  
  // Try to completely remove it
  if ('audioContent' in configRequest) {
    delete configRequest.audioContent;
  }
  
  // Use Object.create to ensure clean object
  const cleanRequest = Object.create(null);
  cleanRequest.streamingConfig = configRequest.streamingConfig;
  
  console.log('\nClean request keys:', Object.keys(cleanRequest));
  console.log('Clean request has audioContent?', 'audioContent' in cleanRequest);
  
  console.log('\n📤 Sending clean request...');
  stream.write(cleanRequest);

  // Wait before sending audio
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('📤 Sending audio...');
  const audioRequest: any = {
    audioContent: Buffer.alloc(4000), // 250ms at 8kHz - actual PCM16 audio
  };
  
  // Ensure streamingConfig is NOT in audio request
  if ('streamingConfig' in audioRequest) {
    delete audioRequest.streamingConfig;
  }
  
  stream.write(audioRequest);

  await new Promise(resolve => setTimeout(resolve, 3000));
  stream.end();
}

testNoAudioContent().catch(console.error);

/**
 * Debug - check what's actually being sent
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testDebug() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  const stream = client.streamingRecognize();

  stream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
    console.error('Error code:', error.code);
    if (error.details) {
      console.error('Error details:', JSON.stringify(error.details, null, 2));
    }
  });

  // Create config request
  const configRequest: any = {
    streamingConfig: {
      config: {
        encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    },
  };

  // Explicitly ensure audioContent is NOT set
  if ('audioContent' in configRequest) {
    delete configRequest.audioContent;
  }

  console.log('Config request keys:', Object.keys(configRequest));
  console.log('Config request:', JSON.stringify(configRequest, null, 2));

  console.log('📤 Sending config...');
  stream.write(configRequest);

  // Wait before sending audio
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('📤 Sending audio...');
  const audioRequest: any = {
    audioContent: Buffer.alloc(4000),
  };
  
  // Explicitly ensure streamingConfig is NOT set
  if ('streamingConfig' in audioRequest) {
    delete audioRequest.streamingConfig;
  }

  console.log('Audio request keys:', Object.keys(audioRequest));
  stream.write(audioRequest);

  await new Promise(resolve => setTimeout(resolve, 2000));
  stream.end();
}

testDebug().catch(console.error);

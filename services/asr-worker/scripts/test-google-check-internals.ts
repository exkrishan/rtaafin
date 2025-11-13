/**
 * Check SDK internals - maybe the issue is in how the SDK processes requests
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function checkInternals() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  // Check if streamingRecognize accepts config parameter
  console.log('Checking streamingRecognize signature...');
  console.log('streamingRecognize type:', typeof client.streamingRecognize);
  
  // Try with config passed to streamingRecognize (not write)
  console.log('\nTrying streamingRecognize with config parameter...');
  try {
    const stream = client.streamingRecognize({
      config: {
        encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    });

    stream.on('error', (error: any) => {
      console.error('Error with config param:', error.message);
    });

    // Now just send audio
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('Sending audio to pre-configured stream...');
    stream.write({
      audioContent: Buffer.alloc(4000),
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    stream.end();
  } catch (e: any) {
    console.error('Failed:', e.message);
  }
}

checkInternals().catch(console.error);

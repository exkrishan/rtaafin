/**
 * Final test - try using end() callback pattern
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testFinal() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  const stream = client.streamingRecognize();

  stream.on('data', (data) => {
    console.log('✅ Data received');
    if (data.results && data.results.length > 0) {
      data.results.forEach((r) => {
        console.log('  Transcript:', r.alternatives?.[0]?.transcript || '(empty)');
      });
    }
  });

  stream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
  });

  // Try using write with callback
  console.log('📤 Sending config with callback...');
  await new Promise<void>((resolve, reject) => {
    const configSent = stream.write({
      streamingConfig: {
        config: {
          encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
          sampleRateHertz: 8000,
          languageCode: 'en-US',
        },
        interimResults: true,
      },
    }, (error?: Error) => {
      if (error) {
        console.error('Config write error:', error);
        reject(error);
      } else {
        console.log('✅ Config write callback fired');
        // Wait a bit more
        setTimeout(resolve, 300);
      }
    });

    if (!configSent) {
      stream.once('drain', () => {
        console.log('✅ Stream drained after config');
        setTimeout(resolve, 300);
      });
    }
  });

  console.log('📤 Sending audio...');
  const audio = Buffer.alloc(4000);
  stream.write({
    audioContent: audio,
  });

  await new Promise(resolve => setTimeout(resolve, 3000));
  stream.end();
}

testFinal().catch(console.error);

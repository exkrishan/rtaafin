/**
 * Minimal test - wait for config acknowledgment
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testMinimal() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  console.log('Creating stream...');
  const stream = client.streamingRecognize();

  let configAcknowledged = false;

  // Set up event handlers
  stream.on('data', (data: protos.google.cloud.speech.v1.StreamingRecognizeResponse) => {
    console.log('✅ Received data:', {
      resultsCount: data.results?.length || 0,
      speechEventType: data.speechEventType,
    });
    
    // First response might be an acknowledgment
    if (!configAcknowledged) {
      configAcknowledged = true;
      console.log('✅ Config acknowledged by server');
    }
    
    if (data.results && data.results.length > 0) {
      data.results.forEach((result, i) => {
        console.log(`  Result ${i}:`, {
          isFinal: result.isFinal,
          transcript: result.alternatives?.[0]?.transcript || '(empty)',
        });
      });
    }
  });

  stream.on('error', (error: any) => {
    console.error('❌ Stream error:', {
      message: error.message,
      code: error.code,
    });
  });

  stream.on('end', () => {
    console.log('📡 Stream ended');
  });

  // Send config
  console.log('📤 Sending config...');
  stream.write({
    streamingConfig: {
      config: {
        encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
      singleUtterance: false,
    },
  });

  // Wait for acknowledgment (first data event or timeout)
  console.log('⏳ Waiting for config acknowledgment...');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.log('⚠️  Timeout waiting for acknowledgment, proceeding anyway...');
      configAcknowledged = true;
      resolve();
    }, 2000);

    if (configAcknowledged) {
      clearTimeout(timeout);
      resolve();
    } else {
      // Wait a bit for potential acknowledgment
      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, 1000);
    }
  });

  // Now send audio
  console.log('📤 Sending audio...');
  const audio = Buffer.alloc(4000); // 250ms at 8kHz
  stream.write({
    audioContent: audio,
  });

  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('Closing stream...');
  stream.end();
}

testMinimal().catch(console.error);

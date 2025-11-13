/**
 * Check if Speech-to-Text API is enabled and accessible
 */
import { SpeechClient } from '@google-cloud/speech';

async function checkAPIEnabled() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json',
    projectId: 'gen-lang-client-0415704882',
  });

  try {
    const projectId = await client.getProjectId();
    console.log('✅ Project ID:', projectId);
    
    // Try to make a simple API call to check if API is enabled
    // If API is not enabled, we'll get a different error
    const stream = client.streamingRecognize();
    
    let errorCode: number | string | undefined;
    let errorMessage = '';
    
    stream.on('error', (error: any) => {
      errorCode = error.code;
      errorMessage = error.message;
      
      console.log('\n📊 Error Analysis:');
      console.log('   Code:', errorCode);
      console.log('   Message:', errorMessage);
      
      if (errorCode === 7) {
        console.log('\n❌ PERMISSION DENIED');
        console.log('   → Service account needs IAM role: "Cloud Speech-to-Text API User"');
        console.log('   → Go to: IAM & Admin > IAM > Find service account > Add role');
      } else if (errorCode === 5) {
        console.log('\n❌ NOT FOUND - API NOT ENABLED');
        console.log('   → Speech-to-Text API is not enabled for this project');
        console.log('   → Go to: APIs & Services > Library > Enable "Cloud Speech-to-Text API"');
      } else if (errorCode === 3 && errorMessage.includes('Malordered')) {
        console.log('\n⚠️  INVALID_ARGUMENT with "Malordered Data"');
        console.log('   This could mean:');
        console.log('   1. API is enabled but there\'s a request format issue');
        console.log('   2. Service account has limited permissions');
        console.log('   3. There\'s a bug in the SDK version');
        console.log('\n   Let\'s check API enablement status...');
        console.log('   → Go to: https://console.cloud.google.com/apis/library/speech.googleapis.com?project=gen-lang-client-0415704882');
        console.log('   → Verify API shows as "Enabled"');
      }
    });
    
    stream.on('data', (data) => {
      console.log('✅ API is enabled and working!');
    });
    
    // Send minimal config
    stream.write({
      streamingConfig: {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 8000,
          languageCode: 'en-US',
        },
      },
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    stream.end();
    
  } catch (error: any) {
    console.error('❌ Failed to check API:', error.message);
  }
}

checkAPIEnabled().catch(console.error);

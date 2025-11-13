/**
 * Check authentication, permissions, and API enablement
 */
import { SpeechClient } from '@google-cloud/speech';

async function checkAuth() {
  console.log('🔍 Checking Google Cloud Speech-to-Text Configuration...\n');

  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  try {
    // Get project ID
    const projectId = await client.getProjectId();
    console.log('✅ Project ID:', projectId);
    console.log('✅ Authentication successful\n');
    
  } catch (error: any) {
    console.error('❌ Authentication error:', error.message);
    return;
  }

  // Test API access with a simple call
  console.log('🧪 Testing API Access...');
  try {
    const stream = client.streamingRecognize();
    
    let errorReceived = false;
    let errorCode: number | string | undefined;
    let errorMessage = '';
    
    stream.on('error', (error: any) => {
      errorReceived = true;
      errorCode = error.code;
      errorMessage = error.message;
      
      console.error('\n❌ API Error:', errorMessage);
      console.error('   Error Code:', errorCode);
      
      if (errorCode === 7) {
        console.error('\n💡 PERMISSION DENIED');
        console.error('   Service account needs IAM role: "Cloud Speech-to-Text API User"');
        console.error('   Go to: IAM & Admin > IAM > Find service account > Add role');
      } else if (errorCode === 5) {
        console.error('\n💡 NOT FOUND - Speech-to-Text API may not be enabled');
        console.error('   Go to: APIs & Services > Library > Enable "Cloud Speech-to-Text API"');
      } else if (errorCode === 3) {
        console.error('\n💡 INVALID_ARGUMENT (Code 3)');
        console.error('   This includes the "Malordered Data" error');
        console.error('   Possible causes:');
        console.error('   1. API not enabled - Enable in APIs & Services > Library');
        console.error('   2. Billing not enabled - Required even for free tier');
        console.error('   3. Service account missing IAM role');
        console.error('   4. Request format issue (less likely)');
      }
    });
    
    stream.on('data', (data) => {
      console.log('✅ SUCCESS! API is accessible and responding');
    });
    
    // Try writing config
    console.log('   Sending test request...');
    stream.write({
      streamingConfig: {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 8000,
          languageCode: 'en-US',
        },
      },
    });
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (!errorReceived) {
      console.log('✅ No errors - API appears accessible');
    }
    
    stream.end();
    
  } catch (error: any) {
    console.error('❌ Failed to test API:', error.message);
  }
  
  console.log('\n📝 Verification Checklist:');
  console.log('   [ ] Speech-to-Text API is enabled');
  console.log('   [ ] Service account has "Cloud Speech-to-Text API User" role');
  console.log('   [ ] Project has billing enabled (required even for free tier)');
  console.log('   [ ] GOOGLE_APPLICATION_CREDENTIALS is set correctly');
}

checkAuth().catch(console.error);

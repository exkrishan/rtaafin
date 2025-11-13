/**
 * Test using REST API directly instead of SDK to bypass potential SDK issues
 */
import * as https from 'https';
import * as fs from 'fs';

async function testRestAPI() {
  // Read service account key
  const keyFile = '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json';
  const keyData = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  
  // Get access token using service account
  const jwt = require('jsonwebtoken');
  const now = Math.floor(Date.now() / 1000);
  
  const token = jwt.sign(
    {
      iss: keyData.client_email,
      sub: keyData.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    },
    keyData.private_key,
    { algorithm: 'RS256' }
  );
  
  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token,
    }),
  });
  
  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  
  console.log('✅ Got access token');
  
  // Try streaming recognize via REST (though REST doesn't support streaming well)
  // Actually, let's stick with SDK but try a different approach
  console.log('REST API approach not ideal for streaming. Trying SDK fix...');
}

testRestAPI().catch(console.error);

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Generate token
const privateKey = fs.readFileSync(path.join(__dirname, '../../scripts/keys/jwt-private-key.pem'), 'utf8');
const token = jwt.sign({
  tenant_id: 'test-tenant',
  interaction_id: 'test-int-' + Date.now(),
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
}, privateKey, { algorithm: 'RS256' });

console.log('Token generated:', token.substring(0, 50) + '...');
console.log('Connecting to ws://localhost:8443/v1/ingest...');

const ws = new WebSocket('ws://localhost:8443/v1/ingest', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});

ws.on('open', () => {
  console.log('✅ Connected successfully!');
  ws.close();
});

ws.on('error', (error) => {
  console.log('❌ Error:', error.message);
  if (error.message.includes('401')) {
    console.log('   This means JWT authentication failed');
  }
});

setTimeout(() => process.exit(0), 3000);

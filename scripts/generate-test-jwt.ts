#!/usr/bin/env ts-node
/**
 * Generate a test JWT token for ingestion service testing
 * 
 * Usage: ts-node scripts/generate-test-jwt.ts
 */

import jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

const PRIVATE_KEY_PATH = path.join(__dirname, '../scripts/keys/jwt-private-key.pem');

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error('❌ Private key not found:', PRIVATE_KEY_PATH);
  console.error('   Run: openssl genrsa -out scripts/keys/jwt-private-key.pem 2048');
  process.exit(1);
}

const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');

// Create a test JWT payload
const payload = {
  tenant_id: 'test-tenant',
  interaction_id: `test-int-${Date.now()}`,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
};

// Sign the token with RS256
const token = jwt.sign(payload, privateKey, {
  algorithm: 'RS256',
});

console.log('✅ Generated JWT Token:');
console.log('');
console.log(token);
console.log('');
console.log('📋 Token Payload:');
console.log(JSON.stringify(payload, null, 2));
console.log('');
console.log('💡 Use this token to test the ingestion service:');
console.log(`   JWT_TOKEN="${token}" ./services/ingest/scripts/simulate_exotel_client.sh`);


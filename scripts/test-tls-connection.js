#!/usr/bin/env node
/**
 * Test TLS connection to Supabase
 * 
 * Usage:
 *   node scripts/test-tls-connection.js
 * 
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase URL to test (default: djuxbmchatnamqbkfjyi.supabase.co)
 */

const https = require('https');

async function testConnection() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://djuxbmchatnamqbkfjyi.supabase.co';
  
  console.log('Testing TLS connection to:', url);
  console.log('');
  
  try {
    // Test with strict validation
    const response = await fetch(url, {
      agent: new https.Agent({ rejectUnauthorized: true })
    });
    
    console.log('✅ PASS: Strict TLS validation succeeded');
    console.log('   Status:', response.status);
    console.log('   Certificate chain validated successfully');
    return true;
  } catch (err) {
    const code = err.cause?.code || err.code;
    const message = err.message || String(err);
    
    if (code === 'SELF_SIGNED_CERT_IN_CHAIN') {
      console.log('❌ FAIL: SELF_SIGNED_CERT_IN_CHAIN');
      console.log('   Error:', message);
      console.log('');
      console.log('🔍 Root Cause: Corporate proxy (Netskope) intercepting connection');
      console.log('   The certificate chain includes a self-signed CA that is not in');
      console.log('   Node.js trust store.');
      console.log('');
      console.log('✅ Quick Fix: Add to .env.local:');
      console.log('   ALLOW_INSECURE_TLS=true');
      console.log('');
      console.log('✅ Proper Fix: Add Netskope CA to Node.js trust store');
      console.log('   See TLS_REMEDIATION_REPORT.md for instructions');
      return false;
    } else {
      console.log('❌ FAIL: Unexpected error');
      console.log('   Code:', code);
      console.log('   Message:', message);
      throw err;
    }
  }
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ Error: fetch is not available');
  console.error('   This script requires Node.js 18+ or node-fetch');
  process.exit(1);
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});


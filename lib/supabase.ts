import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL in environment');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in environment');
}

/**
 * Custom fetch with opt-in insecure TLS support for local development
 *
 * SECURITY WARNING: By default, this function validates TLS certificates.
 * Only use ALLOW_INSECURE_TLS=true for ephemeral local testing with self-signed certificates.
 *
 * To fix TLS errors properly:
 * 1. Run `node scripts/check-certs.js <your-supabase-url>` to diagnose
 * 2. Add your CA certificate to system trust store (recommended)
 * 3. See scripts/USAGE.md for detailed instructions
 *
 * DO NOT use insecure TLS in production or CI environments.
 */
const customFetch: typeof fetch = async (input, init) => {
  try {
    const allowInsecure = process.env.ALLOW_INSECURE_TLS === 'true';

    if (allowInsecure && !globalThis.__INSECURE_TLS_WARNING_SHOWN) {
      console.warn('');
      console.warn('⚠️  WARNING: INSECURE TLS MODE ENABLED ⚠️');
      console.warn('⚠️  ALLOW_INSECURE_TLS=true bypasses certificate validation.');
      console.warn('⚠️  This should ONLY be used for local development with self-signed certs.');
      console.warn('⚠️  Remove ALLOW_INSECURE_TLS from .env.local before sharing code or deploying.');
      console.warn('');
      globalThis.__INSECURE_TLS_WARNING_SHOWN = true;
    }

    if (allowInsecure) {
      const https = await import('https');
      const agent = new https.Agent({ rejectUnauthorized: !allowInsecure });
      const insecureInit = { ...(init ?? {}), agent, keepalive: false } as RequestInit;
      return await fetch(input, insecureInit);
    }

    return await fetch(input, init);
  } catch (err: any) {
    const message = err?.message || '';
    const code = err?.cause?.code;

    if (
      code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
      message.includes('self signed') ||
      message.includes('certificate') ||
      message.includes('SSL') ||
      message.includes('TLS')
    ) {
      console.error('');
      console.error('❌ TLS Certificate Error when connecting to:', input);
      console.error('');
      console.error('🔍 Diagnose with: node scripts/check-certs.js', typeof input === 'string' ? input : SUPABASE_URL);
      console.error('');
      console.error('✅ Recommended fixes:');
      console.error('  1) Add CA cert to system trust store (macOS Keychain, Linux ca-certificates).');
      console.error('  2) Use properly signed certificates for the service.');
      console.error('  3) For local dev only (ephemeral): add ALLOW_INSECURE_TLS=true to .env.local (NOT for CI).');
      console.error('');
    }

    throw err;
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: { 'x-rt-agent-assist': 'rtaa-demo' },
    fetch: customFetch as any,
  },
});

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
 * Custom fetch with TLS certificate validation handling
 * 
 * SECURITY: This function validates TLS certificates by default.
 * Dev-only insecure TLS is gated by NODE_ENV !== 'production' AND explicit opt-in.
 * 
 * Root Cause (2025-11-06): Corporate intercepting proxy (Netskope) MITM's connections
 * to djuxbmchatnamqbkfjyi.supabase.co with self-signed CA chain. Node.js trust store
 * doesn't include the Netskope CA, causing SELF_SIGNED_CERT_IN_CHAIN errors.
 * 
 * Proper Fix: Add Netskope CA to Node.js trust store (see remediation steps below).
 * Temporary Dev Fix: Use ALLOW_INSECURE_TLS=true in .env.local for local dev only.
 */
const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  // Log configuration at startup (once per process)
  if (!globalThis.__SUPABASE_TLS_CONFIG_LOGGED) {
    const allowInsecure = process.env.ALLOW_INSECURE_TLS === 'true';
    const nodeEnv = process.env.NODE_ENV || '(not set)';
    const isProduction = nodeEnv === 'production';
    
    console.log('[supabase] TLS Configuration:');
    console.log('  SUPABASE_URL:', SUPABASE_URL);
    console.log('  ALLOW_INSECURE_TLS:', allowInsecure);
    console.log('  NODE_ENV:', nodeEnv);
    console.log('  useInsecureTLS:', allowInsecure && !isProduction ? 'true (dev fallback)' : 'false');
    
    if (allowInsecure && !isProduction) {
      console.warn('');
      console.warn('⚠️  WARNING: INSECURE TLS MODE ENABLED ⚠️');
      console.warn('⚠️  Certificate validation is DISABLED for Supabase connections.');
      console.warn('⚠️  This is ONLY for local development with corporate proxy/MITM.');
      console.warn('⚠️  NEVER use in production or CI environments.');
      console.warn('');
    }
    
    globalThis.__SUPABASE_TLS_CONFIG_LOGGED = true;
  }

  const allowInsecure = process.env.ALLOW_INSECURE_TLS === 'true';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Get URL string for detection
  const urlString = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
  const isSupabaseUrl = urlString.includes('supabase.co');
  
  // Use insecure TLS ONLY if:
  // 1. Explicitly allowed via ALLOW_INSECURE_TLS=true
  // 2. NOT in production
  // 3. Connecting to Supabase
  const useInsecureTLS = allowInsecure && !isProduction && isSupabaseUrl;
  
  try {
    if (useInsecureTLS) {
      // Node.js built-in fetch (undici-based) requires a custom dispatcher
      // to disable certificate validation per-request.
      // Use undici's Agent with connect.rejectUnauthorized: false
      try {
        // Try to use undici (Node.js 20 has it built-in, but may need explicit import)
        const undici = await import('undici');
        if (undici && undici.Agent) {
          const dispatcher = new undici.Agent({
            connect: {
              rejectUnauthorized: false
            }
          });
          // Use standard fetch with undici dispatcher (ensures Response type compatibility)
          return await fetch(input, {
            ...(init ?? {}),
            dispatcher
          } as any);
        }
      } catch (undiciErr) {
        // If undici import fails, log and continue to fallback
        const errorMessage = undiciErr instanceof Error ? undiciErr.message : String(undiciErr);
        console.warn('[supabase] Could not import undici, trying fallback:', errorMessage);
      }
      
      // Fallback: Try with https.Agent (works if underlying library supports it)
      const https = await import('https');
      const agent = new https.Agent({ 
        rejectUnauthorized: false,
        keepalive: false 
      });
      
      return await fetch(input, {
        ...(init ?? {}),
        agent
      } as any);
    }

    // Default: use standard fetch with certificate validation
    return await fetch(input, init);
  } catch (err: any) {
    const message = String(err?.message || err?.toString() || '');
    const code = err?.cause?.code || err?.code;
    const errString = String(err);

    // Detect TLS/certificate errors
    const isTlsError = 
      code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
      message.includes('self signed') ||
      message.includes('certificate') ||
      message.includes('SSL') ||
      message.includes('TLS') ||
      message.includes('fetch failed') ||
      errString.includes('fetch failed');

    if (isTlsError && !isProduction && isSupabaseUrl) {
      console.error('');
      console.error('❌ TLS Certificate Validation Failed');
      console.error('   URL:', urlString);
      console.error('   Error:', code || message);
      console.error('');
      console.error('🔍 Root Cause: Corporate proxy (Netskope) intercepting connection');
      console.error('   The certificate chain includes a self-signed Netskope CA that');
      console.error('   is not in Node.js trust store.');
      console.error('');
      console.error('✅ Quick Dev Fix: Add to .env.local:');
      console.error('   ALLOW_INSECURE_TLS=true');
      console.error('');
      console.error('✅ Proper Fix: Add Netskope CA to Node.js trust store (see docs)');
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

/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    root: __dirname
  },
  // Note: instrumentationHook is no longer needed in Next.js 16+
  // The instrumentation.ts file is automatically detected
  
  // Note: serverComponentsExternalPackages is not recognized in Next.js 16 with Turbopack
  // Using webpack externals instead for non-Turbopack builds
  
  webpack: (config, { isServer }) => {
    // Exclude optional dependencies from webpack bundling (for non-Turbopack builds)
    // These are loaded dynamically at runtime
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'kafkajs': 'commonjs kafkajs',
        'ioredis': 'commonjs ioredis',
      });
    }
    return config;
  },
}

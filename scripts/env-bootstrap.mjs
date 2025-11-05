#!/usr/bin/env node
/**
 * Environment Bootstrap for Scripts
 * Loads .env.local and runs scripts with environment variables
 *
 * Usage:
 *   node scripts/env-bootstrap.mjs scripts/quick-kb-test.ts --query "password"
 *   node --input-type=module scripts/env-bootstrap.mjs tests/config.test.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project root (parent of scripts directory)
const PROJECT_ROOT = resolve(__dirname, '..');

/**
 * Parse .env.local file into key-value pairs
 */
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, 'utf-8');
  const env = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, equalsIndex).trim();
    let value = trimmed.substring(equalsIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }

    env[key] = value;
  }

  return env;
}

/**
 * Run a script with environment variables from .env.local
 */
function run(scriptPath, scriptArgs = []) {
  const envFilePath = join(PROJECT_ROOT, '.env.local');

  console.log('[env-bootstrap] Loading environment from .env.local...');

  if (!existsSync(envFilePath)) {
    console.error('\n❌ Error: .env.local file not found');
    console.error(`   Expected location: ${envFilePath}`);
    console.error('\n💡 Create .env.local with required variables:');
    console.error('   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJxxx...');
    console.error('   ADMIN_KEY=your-secret-key');
    process.exit(1);
  }

  // Parse environment variables
  const envVars = parseEnvFile(envFilePath);
  const requiredVars = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingVars = requiredVars.filter(key => !envVars[key]);

  if (missingVars.length > 0) {
    console.error('\n❌ Error: Missing required environment variables in .env.local:');
    missingVars.forEach(key => console.error(`   - ${key}`));
    console.error('\n💡 Add these to your .env.local file');
    process.exit(1);
  }

  console.log('[env-bootstrap] Environment loaded successfully');
  console.log(`[env-bootstrap] Running script: ${scriptPath}`);
  if (scriptArgs.length > 0) {
    console.log(`[env-bootstrap] Args: ${scriptArgs.join(' ')}`);
  }
  console.log('');

  // Merge environment variables (existing env + .env.local, with .env.local taking precedence)
  const mergedEnv = {
    ...process.env,
    ...envVars,
  };

  // Resolve script path relative to project root
  const fullScriptPath = resolve(PROJECT_ROOT, scriptPath);

  if (!existsSync(fullScriptPath)) {
    console.error(`\n❌ Error: Script not found: ${fullScriptPath}`);
    process.exit(1);
  }

  // Spawn npx tsx to run the TypeScript script
  const child = spawn('npx', ['tsx', fullScriptPath, ...scriptArgs], {
    stdio: 'inherit',
    env: mergedEnv,
    cwd: PROJECT_ROOT,
  });

  child.on('error', (err) => {
    console.error('\n❌ Error spawning process:', err.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// Main execution
if (process.argv.length < 3) {
  console.error('Usage: node scripts/env-bootstrap.mjs <script-path> [args...]');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/env-bootstrap.mjs scripts/quick-kb-test.ts --query "password"');
  console.error('  node scripts/env-bootstrap.mjs tests/config.test.ts');
  process.exit(1);
}

const scriptPath = process.argv[2];
const scriptArgs = process.argv.slice(3);

run(scriptPath, scriptArgs);

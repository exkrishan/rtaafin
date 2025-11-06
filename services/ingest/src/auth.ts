/**
 * JWT authentication for WebSocket connections
 */

import jwt from 'jsonwebtoken';
import { JWTPayload } from './types';

// Load JWT public key from environment
// Try to load from project root .env.local if not set
let JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || '';

// If not set, try loading from project root .env.local
if (!JWT_PUBLIC_KEY) {
  try {
    const path = require('path');
    const dotenv = require('dotenv');
    const envPath = path.join(__dirname, '../../../.env.local');
    const envConfig = dotenv.config({ path: envPath });
    if (envConfig.parsed) {
      JWT_PUBLIC_KEY = envConfig.parsed.JWT_PUBLIC_KEY || '';
    }
  } catch (err) {
    // Ignore errors, will check below
  }
}

// Remove surrounding quotes if present
if (JWT_PUBLIC_KEY && JWT_PUBLIC_KEY.startsWith('"') && JWT_PUBLIC_KEY.endsWith('"')) {
  JWT_PUBLIC_KEY = JWT_PUBLIC_KEY.slice(1, -1);
}
// Replace \n with actual newlines
if (JWT_PUBLIC_KEY) {
  JWT_PUBLIC_KEY = JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
}

if (!JWT_PUBLIC_KEY) {
  console.warn('[auth] JWT_PUBLIC_KEY not set - authentication will fail');
  console.warn('[auth] Tried loading from: ../../../.env.local');
} else {
  console.info('[auth] JWT_PUBLIC_KEY loaded, length:', JWT_PUBLIC_KEY.length);
}

/**
 * Extract JWT token from Authorization header
 * Format: "Bearer <token>"
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Validate JWT token using RS256 algorithm
 */
export function validateJWT(token: string): JWTPayload | null {
  if (!JWT_PUBLIC_KEY) {
    throw new Error('JWT_PUBLIC_KEY not configured');
  }

  // Verify key format
  if (!JWT_PUBLIC_KEY.includes('BEGIN PUBLIC KEY') || !JWT_PUBLIC_KEY.includes('END PUBLIC KEY')) {
    console.error('[auth] JWT_PUBLIC_KEY format invalid - missing BEGIN/END markers');
    console.error('[auth] Key preview:', JWT_PUBLIC_KEY.substring(0, 50));
    throw new Error('JWT_PUBLIC_KEY format invalid');
  }

  try {
    // RS256 requires public key in PEM format
    const decoded = jwt.verify(token, JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    }) as JWTPayload;

    console.info('[auth] JWT token validated successfully', {
      tenant_id: decoded.tenant_id,
      interaction_id: decoded.interaction_id,
    });

    return decoded;
  } catch (error: any) {
    console.error('[auth] JWT validation failed', {
      errorName: error.name,
      errorMessage: error.message,
      tokenLength: token.length,
      tokenPreview: token.substring(0, 50),
      keyLength: JWT_PUBLIC_KEY.length,
      keyHasBegin: JWT_PUBLIC_KEY.includes('BEGIN'),
      keyHasEnd: JWT_PUBLIC_KEY.includes('END'),
    });
    
    if (error.name === 'TokenExpiredError') {
      throw new Error('JWT token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error(`Invalid JWT token: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Authenticate WebSocket connection from upgrade request headers
 */
export function authenticateConnection(
  headers: { authorization?: string }
): JWTPayload {
  const token = extractToken(headers.authorization);

  if (!token) {
    throw new Error('Missing or invalid Authorization header');
  }

  const payload = validateJWT(token);

  if (!payload) {
    throw new Error('JWT validation failed');
  }

  return payload;
}


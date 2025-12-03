/**
 * Configuration validator for ingestion service
 * Validates environment variables and configuration at startup
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all environment variables and configuration
 */
export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // PORT validation
  const port = process.env.PORT || '5000';
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    errors.push(`Invalid PORT: ${port}. Must be between 1 and 65535.`);
  }

  // BUFFER_DURATION_MS validation
  const bufferDuration = process.env.BUFFER_DURATION_MS || '3000';
  const bufferDurationNum = parseInt(bufferDuration, 10);
  if (isNaN(bufferDurationNum) || bufferDurationNum < 100 || bufferDurationNum > 30000) {
    errors.push(`Invalid BUFFER_DURATION_MS: ${bufferDuration}. Must be between 100 and 30000.`);
  }

  // ACK_INTERVAL validation
  const ackInterval = process.env.ACK_INTERVAL || '10';
  const ackIntervalNum = parseInt(ackInterval, 10);
  if (isNaN(ackIntervalNum) || ackIntervalNum < 1 || ackIntervalNum > 1000) {
    errors.push(`Invalid ACK_INTERVAL: ${ackInterval}. Must be between 1 and 1000.`);
  }

  // PUBSUB_ADAPTER validation
  const pubsubAdapter = process.env.PUBSUB_ADAPTER || 'redis_streams';
  if (!['redis_streams', 'kafka', 'in_memory'].includes(pubsubAdapter)) {
    errors.push(`Invalid PUBSUB_ADAPTER: ${pubsubAdapter}. Must be one of: redis_streams, kafka, in_memory`);
  }

  // REDIS_URL validation (required for redis_streams)
  if (pubsubAdapter === 'redis_streams') {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      errors.push('REDIS_URL is required when PUBSUB_ADAPTER=redis_streams');
    } else if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
      errors.push(`Invalid REDIS_URL format: ${redisUrl}. Must start with redis:// or rediss://`);
    }
  }

  // KAFKA_BROKERS validation (required for kafka)
  if (pubsubAdapter === 'kafka') {
    const kafkaBrokers = process.env.KAFKA_BROKERS;
    if (!kafkaBrokers) {
      errors.push('KAFKA_BROKERS is required when PUBSUB_ADAPTER=kafka');
    } else {
      const brokers = kafkaBrokers.split(',').filter(Boolean);
      if (brokers.length === 0) {
        errors.push('KAFKA_BROKERS must contain at least one broker');
      }
    }
  }

  // JWT_PUBLIC_KEY validation (warn if missing, but don't fail if Exotel is enabled)
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY;
  const supportExotel = process.env.SUPPORT_EXOTEL === 'true';
  
  if (!jwtPublicKey && !supportExotel) {
    warnings.push('JWT_PUBLIC_KEY not set - JWT authentication will fail (unless SUPPORT_EXOTEL=true)');
  } else if (jwtPublicKey) {
    // Validate JWT key format
    if (!jwtPublicKey.includes('BEGIN PUBLIC KEY') || !jwtPublicKey.includes('END PUBLIC KEY')) {
      warnings.push('JWT_PUBLIC_KEY format may be invalid - should contain BEGIN PUBLIC KEY and END PUBLIC KEY markers');
    }
  }

  // SSL configuration validation
  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.SSL_CERT_PATH;
  
  if (sslKeyPath && !sslCertPath) {
    errors.push('SSL_KEY_PATH is set but SSL_CERT_PATH is missing');
  }
  if (sslCertPath && !sslKeyPath) {
    errors.push('SSL_CERT_PATH is set but SSL_KEY_PATH is missing');
  }

  // Exotel Bridge feature flag validation
  const exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
  if (exoBridgeEnabled) {
    const exoMaxBufferMs = process.env.EXO_MAX_BUFFER_MS || '500';
    const exoMaxBufferMsNum = parseInt(exoMaxBufferMs, 10);
    if (isNaN(exoMaxBufferMsNum) || exoMaxBufferMsNum < 100 || exoMaxBufferMsNum > 10000) {
      errors.push(`Invalid EXO_MAX_BUFFER_MS: ${exoMaxBufferMs}. Must be between 100 and 10000.`);
    }

    const exoIdleCloseS = process.env.EXO_IDLE_CLOSE_S || '10';
    const exoIdleCloseSNum = parseInt(exoIdleCloseS, 10);
    if (isNaN(exoIdleCloseSNum) || exoIdleCloseSNum < 1 || exoIdleCloseSNum > 300) {
      errors.push(`Invalid EXO_IDLE_CLOSE_S: ${exoIdleCloseS}. Must be between 1 and 300.`);
    }
  }

  // Production environment warnings
  if (process.env.NODE_ENV === 'production') {
    if (!sslKeyPath && !sslCertPath) {
      warnings.push('No SSL certificates configured - Render handles HTTPS termination, but local SSL is recommended');
    }
    if (pubsubAdapter === 'in_memory') {
      warnings.push('Using in_memory pub/sub adapter in production - messages will not persist across restarts');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Print validation results
 */
export function printValidationResults(result: ValidationResult): void {
  if (result.errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    result.errors.forEach((error) => {
      console.error(`   - ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Configuration warnings:');
    result.warnings.forEach((warning) => {
      console.warn(`   - ${warning}`);
    });
  }

  if (result.valid && result.warnings.length === 0) {
    console.info('✅ Configuration validation passed');
  }
}


/**
 * Logging utility with level control and rate limiting
 * 
 * Usage:
 *   LOG_LEVEL=info (default) - Shows errors, warnings, and actual work
 *   LOG_LEVEL=debug - Shows all logs including diagnostics
 *   LOG_LEVEL=warn - Shows only warnings and errors
 *   LOG_LEVEL=error - Shows only errors
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const LOG_LEVEL_INDEX = LOG_LEVELS.indexOf(LOG_LEVEL);

// Rate limiting for verbose logs
const rateLimiters = new Map<string, { count: number; lastLog: number }>();
const RATE_LIMIT_INTERVAL_MS = 10000; // 10 seconds
const RATE_LIMIT_MAX_LOGS = 1; // Max 1 log per interval for rate-limited logs

function shouldLog(level: LogLevel): boolean {
  if (level === 'error') return true; // Always log errors
  const levelIndex = LOG_LEVELS.indexOf(level);
  return levelIndex >= LOG_LEVEL_INDEX;
}

function shouldRateLimit(key: string, level: LogLevel): boolean {
  // Don't rate limit errors or warnings
  if (level === 'error' || level === 'warn') return false;
  
  // Don't rate limit if debug is enabled (full logging)
  if (LOG_LEVEL === 'debug') return false;
  
  const now = Date.now();
  const limiter = rateLimiters.get(key);
  
  if (!limiter) {
    rateLimiters.set(key, { count: 1, lastLog: now });
    return false; // First log, allow it
  }
  
  // Reset if interval passed
  if (now - limiter.lastLog >= RATE_LIMIT_INTERVAL_MS) {
    limiter.count = 1;
    limiter.lastLog = now;
    return false; // Allow this log
  }
  
  // Increment counter
  limiter.count++;
  
  // Rate limit if exceeded
  if (limiter.count > RATE_LIMIT_MAX_LOGS) {
    return true; // Rate limit this log
  }
  
  return false; // Allow this log
}

export const logger = {
  debug: (message: string, data?: any) => {
    if (shouldLog('debug') && !shouldRateLimit(message, 'debug')) {
      console.debug(message, data || {});
    }
  },
  
  info: (message: string, data?: any) => {
    if (shouldLog('info') && !shouldRateLimit(message, 'info')) {
      console.info(message, data || {});
    }
  },
  
  warn: (message: string, data?: any) => {
    if (shouldLog('warn')) {
      console.warn(message, data || {});
    }
  },
  
  error: (message: string, data?: any) => {
    // Always log errors
    console.error(message, data || {});
  },
  
  // Special method for rate-limited verbose logs (e.g., timer ticks)
  verbose: (key: string, message: string, data?: any, level: LogLevel = 'info') => {
    if (shouldLog(level) && !shouldRateLimit(key, level)) {
      const logFn = level === 'debug' ? console.debug : 
                   level === 'warn' ? console.warn :
                   level === 'error' ? console.error : console.info;
      logFn(message, data || {});
    }
  },
  
  // Get current log level (for debugging)
  getLevel: () => LOG_LEVEL,
};


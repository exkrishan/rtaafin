/**
 * Logging utility with level control and rate limiting
 * Same implementation as ASR Worker
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const LOG_LEVEL_INDEX = LOG_LEVELS.indexOf(LOG_LEVEL);

const rateLimiters = new Map<string, { count: number; lastLog: number }>();
const RATE_LIMIT_INTERVAL_MS = 10000;
const RATE_LIMIT_MAX_LOGS = 1;

function shouldLog(level: LogLevel): boolean {
  if (level === 'error') return true;
  const levelIndex = LOG_LEVELS.indexOf(level);
  return levelIndex >= LOG_LEVEL_INDEX;
}

function shouldRateLimit(key: string, level: LogLevel): boolean {
  if (level === 'error' || level === 'warn') return false;
  if (LOG_LEVEL === 'debug') return false;
  
  const now = Date.now();
  const limiter = rateLimiters.get(key);
  
  if (!limiter) {
    rateLimiters.set(key, { count: 1, lastLog: now });
    return false;
  }
  
  if (now - limiter.lastLog >= RATE_LIMIT_INTERVAL_MS) {
    limiter.count = 1;
    limiter.lastLog = now;
    return false;
  }
  
  limiter.count++;
  return limiter.count > RATE_LIMIT_MAX_LOGS;
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
    console.error(message, data || {});
  },
  
  verbose: (key: string, message: string, data?: any, level: LogLevel = 'info') => {
    if (shouldLog(level) && !shouldRateLimit(key, level)) {
      const logFn = level === 'debug' ? console.debug : 
                   level === 'warn' ? console.warn :
                   level === 'error' ? console.error : console.info;
      logFn(message, data || {});
    }
  },
  
  getLevel: () => LOG_LEVEL,
};


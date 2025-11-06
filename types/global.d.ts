/**
 * Global type declarations
 * Extends globalThis and other global types used across the application
 */

export {};

declare global {
  /**
   * Flag to track if Supabase TLS configuration has been logged
   * Used to prevent duplicate logging on startup
   */
  // eslint-disable-next-line no-var
  var __SUPABASE_TLS_CONFIG_LOGGED: boolean | undefined;
}

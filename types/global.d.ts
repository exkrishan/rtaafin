/**
 * Global type declarations for RTAA
 */

declare global {
  /**
   * Flag to track if insecure TLS warning has been shown
   * Used by lib/supabase.ts to show warning only once
   */
  var __INSECURE_TLS_WARNING_SHOWN: boolean | undefined;
}

export {};

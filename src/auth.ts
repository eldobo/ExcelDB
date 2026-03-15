import type { AuthProvider } from './types.js';

export type { AuthProvider };

export interface CreateAuthOptions {
  clientId: string;
  authority?: string;
  redirectUri?: string;
  scopes?: string[];
}

/**
 * Convenience wrapper that creates an AuthProvider using MSAL.js.
 * Requires @azure/msal-browser as a peer dependency.
 */
export function createAuth(_options: CreateAuthOptions): AuthProvider {
  throw new Error('Not implemented');
}

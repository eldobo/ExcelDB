import type { AuthProvider } from './types.js';

export type { AuthProvider };

export interface CreateAuthOptions {
  clientId: string;
  authority?: string;
  redirectUri?: string;
  scopes?: string[];
}

const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com/consumers';
const DEFAULT_SCOPES = ['Files.ReadWrite', 'User.Read'];

/**
 * Convenience wrapper that creates an AuthProvider using MSAL.js.
 * Requires @azure/msal-browser as a peer dependency.
 *
 * MSAL is initialized lazily on first method call to avoid
 * requiring browser APIs at construction time.
 */
export function createAuth(options: CreateAuthOptions): AuthProvider {
  const authority = options.authority ?? DEFAULT_AUTHORITY;
  const scopes = options.scopes ?? DEFAULT_SCOPES;
  const redirectUri = options.redirectUri ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

  // Lazy-initialized MSAL instance
  let msalInstance: import('@azure/msal-browser').PublicClientApplication | null = null;
  let initPromise: Promise<import('@azure/msal-browser').PublicClientApplication> | null = null;

  async function getMsal(): Promise<import('@azure/msal-browser').PublicClientApplication> {
    if (msalInstance) return msalInstance;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const { PublicClientApplication } = await import('@azure/msal-browser');
      const pca = new PublicClientApplication({
        auth: {
          clientId: options.clientId,
          authority,
          redirectUri,
        },
        cache: {
          cacheLocation: 'localStorage',
        },
      });
      await pca.initialize();
      msalInstance = pca;
      return pca;
    })();

    return initPromise;
  }

  return {
    async getAccessToken(): Promise<string> {
      const pca = await getMsal();
      const accounts = pca.getAllAccounts();
      if (accounts.length === 0) {
        // No account — try popup login
        const result = await pca.loginPopup({ scopes });
        return result.accessToken;
      }

      try {
        const result = await pca.acquireTokenSilent({
          scopes,
          account: accounts[0],
        });
        return result.accessToken;
      } catch {
        // Silent failed — fall back to popup
        const result = await pca.acquireTokenPopup({
          scopes,
          account: accounts[0],
        });
        return result.accessToken;
      }
    },

    async login(): Promise<void> {
      const pca = await getMsal();
      await pca.loginPopup({ scopes });
    },

    async logout(): Promise<void> {
      const pca = await getMsal();
      await pca.logoutPopup();
    },

    isAuthenticated(): boolean {
      // Synchronous check — returns false if MSAL hasn't been initialized yet
      if (!msalInstance) return false;
      return msalInstance.getAllAccounts().length > 0;
    },
  };
}

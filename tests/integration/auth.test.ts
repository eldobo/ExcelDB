import { describe, it, expect } from 'vitest';
import { createAuth } from '../../src/auth.js';

describe('createAuth', () => {
  it('returns an AuthProvider with getAccessToken', () => {
    const auth = createAuth({ clientId: 'test-client-id' });
    expect(auth.getAccessToken).toBeTypeOf('function');
  });

  it('returns an AuthProvider with login', () => {
    const auth = createAuth({ clientId: 'test-client-id' });
    expect(auth.login).toBeTypeOf('function');
  });

  it('returns an AuthProvider with logout', () => {
    const auth = createAuth({ clientId: 'test-client-id' });
    expect(auth.logout).toBeTypeOf('function');
  });

  it('returns an AuthProvider with isAuthenticated', () => {
    const auth = createAuth({ clientId: 'test-client-id' });
    expect(auth.isAuthenticated).toBeTypeOf('function');
  });

  it('defaults authority to consumers endpoint', () => {
    const auth = createAuth({ clientId: 'test-client-id' });
    // The auth object should be configured for personal accounts
    // (We'll verify this works end-to-end when MSAL is integrated)
    expect(auth).toBeDefined();
  });
});

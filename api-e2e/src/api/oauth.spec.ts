import axios from 'axios';

/** Never throw on a status: the point of most of these is the failure shape. */
const http = axios.create({ validateStatus: () => true });

describe('discovery', () => {

  it('serves RFC 8414 metadata outside the global api prefix', async () => {
    const response = await http.get('/.well-known/oauth-authorization-server');

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      response_types_supported: ['code'],
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'client_credentials',
      ],
      code_challenge_methods_supported: ['S256', 'plain'],
    });
    expect(response.data.token_endpoint).toContain('/api/oauth/token');
    expect(response.data.jwks_uri).toContain('/.well-known/jwks.json');
  });

  it('publishes a signing key and nothing private', async () => {
    const response = await http.get('/.well-known/jwks.json');

    expect(response.status).toBe(200);
    expect(response.data.keys).toHaveLength(1);
    expect(response.data.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' });

    for (const secret of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
      expect(response.data.keys[0][secret]).toBeUndefined();
    }
  });
});

describe('the token endpoint', () => {

  it('refuses an unknown client with a bearer challenge', async () => {
    const response = await http.post(
      '/api/oauth/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'no-such-client',
        client_secret: 'nope',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    expect(response.status).toBe(401);
    expect(response.data.error).toBe('invalid_client');
    expect(response.headers['www-authenticate']).toContain('invalid_client');
    // RFC 6749 §5.1: a token response must never be cached.
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('reports a malformed request in the RFC 6749 shape', async () => {
    const response = await http.get('/api/oauth/authorize?response_type=code');

    expect(response.status).toBe(400);
    expect(response.data.error).toBe('invalid_request');
    expect(response.data.error_description).toEqual(expect.any(String));
  });
});

describe('everything that needs an identity', () => {

  it.each([
    ['/api/oauth/userinfo', 'a bearer token'],
    ['/api/admin/clients', 'an admin session'],
    ['/api/admin/users', 'an admin session'],
    ['/api/admin/tokens', 'an admin session'],
    ['/api/organizations', 'a session'],
    ['/api/auth/me', 'a session'],
  ])('refuses %s without %s', async (path) => {
    expect((await http.get(path)).status).toBe(401);
  });

  it('refuses wrong credentials', async () => {
    const response = await http.post('/api/auth', {
      username: 'nobody@example.com',
      password: 'wrong',
    });

    expect(response.status).toBe(401);
  });
});

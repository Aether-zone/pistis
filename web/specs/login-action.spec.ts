import { submitLogin } from '../src/app/login/actions';

const redirect = jest.fn((url: string) => {
  // The real redirect() signals by throwing; mimic that so the action's
  // control flow is exercised the way Next actually drives it.
  throw new Error(`NEXT_REDIRECT:${url}`);
});

jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}));

// The real callApi is exercised here on purpose: the bug this suite exists to
// prevent lived in its response handling, not in the action.
jest.mock('server-only', () => ({}));

jest.mock('@/lib/session', () => ({
  setSessionCookie: jest.fn(),
  clearSessionCookie: jest.fn(),
}));

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

process.env.PISTIS_API_URL = 'http://api.test';

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return form;
}

const AUTHORIZATION = {
  response_type: 'code',
  client_id: 'demo-client',
  redirect_uri: 'https://client.example/callback',
  scope: 'profile',
  state: 'xyz',
};

const CREDENTIALS = { username: 'ada@example.com', password: 'hunter2hunter2' };

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
}

/** What something that is not the api answers with. */
function respondWithText(status: number, body: string) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  redirect.mockClear();
});

describe('submitLogin', () => {
  it('posts the authorization request with the credentials and approval', async () => {
    respond(200, { redirect_uri: 'https://client.example/callback?code=abc' });

    await expect(
      submitLogin({}, formOf({ ...AUTHORIZATION, ...CREDENTIALS, decision: 'allow' })),
    ).rejects.toThrow('NEXT_REDIRECT:https://client.example/callback?code=abc');

    const [url, init] = fetchMock.mock.calls[0];

    expect(url).toBe('http://api.test/api/oauth/authorize');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      ...AUTHORIZATION,
      ...CREDENTIALS,
      approved: true,
    });
  });

  it('sends approved:false when the person cancels', async () => {
    respond(200, {
      redirect_uri: 'https://client.example/callback?error=access_denied',
    });

    await expect(
      submitLogin({}, formOf({ ...AUTHORIZATION, ...CREDENTIALS, decision: 'deny' })),
    ).rejects.toThrow(/error=access_denied/);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).approved).toBe(false);
  });

  it('reports refused credentials in the form rather than redirecting', async () => {
    respond(403, {
      error: 'access_denied',
      error_description: 'Invalid resource owner credentials.',
    });

    const state = await submitLogin(
      {},
      formOf({ ...AUTHORIZATION, ...CREDENTIALS, decision: 'allow' }),
    );

    expect(state.error).toBe('That email address and password did not match.');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('surfaces the server description for other OAuth errors', async () => {
    respond(400, {
      error: 'invalid_request',
      error_description: 'redirect_uri does not match a registered redirect URI.',
    });

    const state = await submitLogin(
      {},
      formOf({ ...AUTHORIZATION, ...CREDENTIALS, decision: 'allow' }),
    );

    expect(state.error).toBe(
      'redirect_uri does not match a registered redirect URI.',
    );
  });

  it('signs in to the dashboard when there is no authorization request', async () => {
    respond(200, { token: 'session-token', expires_in: 3600, user: {} });

    await expect(submitLogin({}, formOf({ ...CREDENTIALS }))).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard',
    );

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/auth');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(CREDENTIALS);
  });

  it('reports a refused password on the plain sign-in path', async () => {
    // Nest answers a bad password with its own 401 envelope rather than an
    // OAuth error, so this must not surface as a configuration problem.
    respondWithText(401, JSON.stringify({ statusCode: 401, message: 'Unauthorized' }));

    const state = await submitLogin({}, formOf({ ...CREDENTIALS }));

    expect(state.error).toBe('That email address and password did not match.');
  });

  it('does not call the API with empty credentials', async () => {
    const state = await submitLogin({}, formOf({ ...AUTHORIZATION }));

    expect(state.error).toBe('Enter your email address and password.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an unreachable API, naming the URL it tried', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const state = await submitLogin(
      {},
      formOf({ ...AUTHORIZATION, ...CREDENTIALS, decision: 'allow' }),
    );

    expect(state.error).toContain('Could not reach the api.');
    expect(state.error).toContain('http://api.test/api/oauth/authorize');
  });

  it('does not disguise a non-JSON reply as an unreachable server', async () => {
    // Pointing PISTIS_API_URL at something that is not the api — the default
    // port 3000 is a common way to end up here — used to surface as "could not
    // reach the authorization server", hiding both the status and the URL.
    respondWithText(401, '<html><body>Unauthorized</body></html>');

    const state = await submitLogin(
      {},
      formOf({ ...AUTHORIZATION, ...CREDENTIALS, decision: 'allow' }),
    );

    expect(state.error).toContain('replied with 401');
    expect(state.error).toContain('not JSON');
    expect(state.error).toContain('PISTIS_API_URL');
  });

  it('prefers the Nest message over its status-name error field', async () => {
    // Nest sends `{ statusCode, message, error: 'Conflict' }`. Reading `error`
    // first surfaced the useless word "Conflict" instead of the reason.
    respondWithText(409, JSON.stringify({
      statusCode: 409,
      message: 'An organization must keep at least one owner.',
      error: 'Conflict',
    }));

    const state = await submitLogin(
      {},
      formOf({ ...AUTHORIZATION, ...CREDENTIALS, decision: 'allow' }),
    );

    expect(state.error).toBe('An organization must keep at least one owner.');
  });

  it('still reads a real OAuth error body', async () => {
    respondWithText(400, JSON.stringify({
      error: 'invalid_grant',
      error_description: 'Authorization code has expired.',
    }));

    const state = await submitLogin(
      {},
      formOf({ ...AUTHORIZATION, ...CREDENTIALS, decision: 'allow' }),
    );

    expect(state.error).toBe('Authorization code has expired.');
  });

  it('reports an HTTP failure that carries no OAuth error', async () => {
    respondWithText(502, '');

    const state = await submitLogin(
      {},
      formOf({ ...AUTHORIZATION, ...CREDENTIALS, decision: 'allow' }),
    );

    expect(state.error).toContain('replied with 502');
  });
});

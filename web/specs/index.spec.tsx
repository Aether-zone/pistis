const redirect = jest.fn((url: string) => {
  // The real redirect() signals by throwing; mimic it so the page's control
  // flow is exercised the way Next drives it.
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const getSessionToken = jest.fn();

jest.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
jest.mock('@/lib/session', () => ({ getSessionToken: () => getSessionToken() }));

import RootPage from '../src/app/page';

beforeEach(() => {
  redirect.mockClear();
  getSessionToken.mockReset();
});

describe('the root page', () => {
  it('sends a signed-in visitor to the dashboard', async () => {
    getSessionToken.mockResolvedValue('a-session-token');

    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard');
  });

  it('sends everyone else to sign in', async () => {
    getSessionToken.mockResolvedValue(undefined);

    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT:/login');
  });
});

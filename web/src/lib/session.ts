import 'server-only';

import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'pistis_session';

/**
 * The session token lives in an httpOnly cookie: client-side JavaScript never
 * sees it, and every call that uses it happens in a server component or server
 * action. `secure` is conditional only so that plain-http local development
 * still works.
 */
export async function setSessionCookie(
  token: string,
  maxAgeSeconds: number,
): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

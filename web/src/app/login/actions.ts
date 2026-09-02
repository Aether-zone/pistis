'use server';

import type { AuthorizationResponseDTO, SessionDTO } from '@pistis/contract';
import { redirect } from 'next/navigation';

import { callApi, type ApiResult } from '@/lib/api';
import { clearSessionCookie, setSessionCookie } from '@/lib/session';
import { readOAuthParams } from './oauth-params';

export interface LoginFormState {
  error?: string;
}

function text(form: FormData, field: string): string {
  const value = form.get(field);

  return typeof value === 'string' ? value : '';
}

/**
 * Submits the resource owner's answer to the authorization endpoint. On success
 * the API returns the URL to send the user agent to — it already carries either
 * `code` or `error=access_denied` — and we follow it.
 */
export async function submitLogin(
  _previous: LoginFormState,
  form: FormData,
): Promise<LoginFormState> {
  const params = readOAuthParams(
    Object.fromEntries(
      Array.from(form.keys()).map((key) => [key, text(form, key)]),
    ),
  );

  const username = text(form, 'username');
  const password = text(form, 'password');

  if (!username || !password) {
    return { error: 'Enter your email address and password.' };
  }

  // No authorization request means this is a plain sign-in to the management
  // app rather than a consent step for a third-party client.
  if (!params) {
    return signInToDashboard(username, password);
  }

  const result: ApiResult<AuthorizationResponseDTO> =
    await callApi<AuthorizationResponseDTO>('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        username,
        password,
        approved: text(form, 'decision') !== 'deny',
      }),
    });

  if (!result.ok) {
    // access_denied here means the credentials were refused, not that the
    // person declined — declining is a successful response with a redirect.
    return {
      error:
        result.error?.error === 'access_denied'
          ? 'That email address and password did not match.'
          : result.message,
    };
  }

  // Outside any try/catch: redirect() signals by throwing, and catching it
  // here would swallow the navigation.
  redirect(result.data.redirect_uri);
}

async function signInToDashboard(
  username: string,
  password: string,
): Promise<LoginFormState> {
  const result: ApiResult<SessionDTO> = await callApi<SessionDTO>('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!result.ok) {
    // 401 is the api saying the credentials are wrong; anything else is a
    // problem with the request or the connection, and its message is the
    // useful one.
    return {
      error:
        result.status === 401
          ? 'That email address and password did not match.'
          : result.message,
    };
  }

  await setSessionCookie(result.data.token, result.data.expires_in);

  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  await clearSessionCookie();

  redirect('/login');
}

import 'server-only';

import { callApi, type ApiResult } from './api';
import { getSessionToken } from './session';

/**
 * Calls the api as the signed-in user.
 *
 * Returns `null` when there is no session at all, which callers turn into a
 * redirect to the sign-in page rather than an error message — an expired
 * cookie is an ordinary thing, not a failure.
 */
export async function callWithSession<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T> | null> {
  const token = await getSessionToken();

  if (!token) {
    return null;
  }

  const result = await callApi<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  // A rejected session is indistinguishable from having none. Keyed on the
  // status rather than an error code, because the management API answers with
  // Nest's ordinary exceptions rather than OAuth errors.
  if (!result.ok && result.status === 401) {
    return null;
  }

  return result;
}

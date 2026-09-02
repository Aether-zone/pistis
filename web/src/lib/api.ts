import 'server-only';

import type { OAuthErrorDTO } from '@pistis/contract';

/**
 * Base URL of the Nest API. Server-side only: every call to it goes through a
 * server component or a server action, so the browser never talks to the API
 * directly and the API needs no CORS configuration.
 *
 * The default is a guess, and frequently the wrong one — the api and the web
 * dev server both default to port 3000, so at least one of them is usually
 * moved. Failures below name the URL they tried for exactly that reason.
 */
export function apiBaseUrl(): string {
  return process.env.PISTIS_API_URL ?? 'http://localhost:3000';
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl().replace(/\/$/, '')}${path}`;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; status?: number; error?: OAuthErrorDTO };

function misdirected(url: string, detail: string): string {
  return (
    `${detail} Is PISTIS_API_URL pointing at the api? ` +
    `It is currently "${apiBaseUrl()}" (tried ${url}).`
  );
}

/**
 * Calls the api and returns either the parsed body or a message worth showing.
 *
 * The important case is a reply that is neither a success nor an OAuth error:
 * pointing this at something that is not the api answers with HTML or a bare
 * status, and parsing that as JSON throws. Treating it as "unreachable" would
 * hide the one fact that identifies the problem, so the URL is always named.
 */
export async function callApi<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const url = apiUrl(path);
  let response: Response;

  try {
    response = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    return { ok: false, message: misdirected(url, 'Could not reach the api.') };
  }


  const raw = await response.text();
  let body: unknown;

  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return {
      ok: false,
      status: response.status,
      message: misdirected(
        url,
        `The api replied with ${response.status} and a body that is not JSON.`,
      ),
    };
  }

  if (response.ok) {
    return { ok: true, data: body as T };
  }

  const oauth = body as OAuthErrorDTO | null;
  const nest = body as { statusCode?: number; message?: string | string[] } | null;
  const nestMessage = Array.isArray(nest?.message)
    ? nest.message.join('; ')
    : nest?.message;

  // Both shapes carry an `error` field — Nest puts the status name there
  // ("Conflict", "Bad Request") — so its presence alone does not identify an
  // OAuth error body. `statusCode` is what only Nest sends, and reading it the
  // other way round discards the message that says what actually went wrong.
  const isOAuthError =
    typeof oauth?.error === 'string' && nest?.statusCode === undefined;

  if (isOAuthError) {
    return {
      ok: false,
      status: response.status,
      error: oauth,
      message: oauth.error_description ?? oauth.error,
    };
  }

  if (nestMessage) {
    return { ok: false, status: response.status, message: nestMessage };
  }

  return {
    ok: false,
    status: response.status,
    message: misdirected(
      url,
      `The api replied with ${response.status} and no error message.`,
    ),
  };
}

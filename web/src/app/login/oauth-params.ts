import type { CodeChallengeMethod } from '@pistis/contract';

/**
 * The subset of an authorization request the consent screen carries through
 * from its query string into the form it submits back.
 */
export interface OAuthRequestParams {
  response_type: string;
  client_id: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: CodeChallengeMethod;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Returns null when the page was opened outside an authorization flow, which
 * is a normal thing for someone to do by typing the URL.
 */
export function readOAuthParams(raw: RawParams): OAuthRequestParams | null {
  const clientId = first(raw.client_id);

  if (!clientId) {
    return null;
  }

  const method = first(raw.code_challenge_method);

  return {
    response_type: first(raw.response_type) ?? 'code',
    client_id: clientId,
    redirect_uri: first(raw.redirect_uri),
    scope: first(raw.scope),
    state: first(raw.state),
    code_challenge: first(raw.code_challenge),
    code_challenge_method:
      method === 'S256' || method === 'plain' ? method : undefined,
  };
}

/** Renders the params as hidden fields so the form round-trips them intact. */
export function toHiddenFields(
  params: OAuthRequestParams,
): Array<[string, string]> {
  return Object.entries(params).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
}

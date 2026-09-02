import type {
  AuthorizationPromptDTO,
  ScopeDescriptorDTO,
} from '@pistis/contract';

import { callApi } from '@/lib/api';
import { LoginForm } from './login-form';
import { readOAuthParams, toHiddenFields } from './oauth-params';

export const metadata = {
  title: 'Sign in',
};

export const dynamic = 'force-dynamic';

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The consent screen for the Nest authorization server. It asks the API to
 * describe the pending authorization request — which also validates the client
 * and redirect URI before anyone types a password — and then renders the form.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = readOAuthParams(await searchParams);

  // Two modes share this page. With no authorization request it is a plain
  // sign-in to the management dashboard; with one it is the consent screen for
  // whichever client sent the person here.
  if (!params) {
    return <LoginForm hiddenFields={[]} />;
  }

  const query = new URLSearchParams(
    toHiddenFields(params).map(([key, value]) => [key, value]),
  );

  const result = await callApi<AuthorizationPromptDTO>(
    `/api/oauth/authorize?${query}`,
  );

  // A rejected request never reaches the password field: the client or the
  // redirect URI is wrong, so submitting credentials could not succeed.
  if (!result.ok) {
    return <LoginForm hiddenFields={[]} blockedReason={result.message} />;
  }

  const prompt: AuthorizationPromptDTO = result.data;
  const scopes: ScopeDescriptorDTO[] = prompt.scopes;

  return (
    <LoginForm
      clientName={prompt.client_name}
      scopes={scopes}
      hiddenFields={toHiddenFields(params)}
    />
  );
}

'use server';

import type { ClientSecretDTO } from '@pistis/contract';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { callWithSession } from '@/lib/session-api';

/**
 * Reports an outcome through the URL rather than through the form's own state.
 *
 * Destructive actions remove the very row their form lives in, so any message
 * held in that form's state is unmounted before it can be read. Never used for
 * a client secret: query strings end up in logs and history.
 */
function withNotice(path: string, message: string): never {
  redirect(`${path}?notice=${encodeURIComponent(message)}`);
}

export interface DashboardState {
  error?: string;
  /** Shown once, because the api will never return this secret again. */
  secret?: ClientSecretDTO;
  message?: string;
}

function text(form: FormData, field: string): string {
  const value = form.get(field);

  return typeof value === 'string' ? value.trim() : '';
}

function list(form: FormData, field: string): string[] {
  return text(form, field)
    .split(/[\s,]+/)
    .filter((value) => value.length > 0);
}

const SESSION_EXPIRED = 'Your session has expired. Sign in again.';

export async function createClient(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const result = await callWithSession<ClientSecretDTO>('/api/admin/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: text(form, 'clientId'),
      name: text(form, 'name'),
      confidential: text(form, 'confidential') === 'on',
      redirectUris: list(form, 'redirectUris'),
      grantTypes: form.getAll('grantTypes').map(String),
      scopes: list(form, 'scopes'),
    }),
  });

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  return result.data.clientSecret
    ? { secret: result.data }
    : { message: `Registered public client "${result.data.clientId}".` };
}

export async function rotateSecret(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const clientId = text(form, 'clientId');
  const result = await callWithSession<ClientSecretDTO>(
    `/api/admin/clients/${encodeURIComponent(clientId)}/secret`,
    { method: 'POST' },
  );

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  return { secret: result.data };
}

export async function deleteClient(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const clientId = text(form, 'clientId');
  const result = await callWithSession<null>(
    `/api/admin/clients/${encodeURIComponent(clientId)}`,
    { method: 'DELETE' },
  );

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  withNotice('/dashboard/clients', `Deleted "${clientId}" and revoked its tokens.`);
}

export async function createUser(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const result = await callWithSession<{ email: string }>('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: text(form, 'name'),
      email: text(form, 'email'),
      password: text(form, 'password'),
      admin: text(form, 'admin') === 'on',
    }),
  });

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  return { message: `Created ${result.data.email}.` };
}

export async function setPassword(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const result = await callWithSession<null>(
    `/api/admin/users/${text(form, 'userId')}/password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: text(form, 'password') }),
    },
  );

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  return { message: 'Password updated.' };
}

export async function createOrganization(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const description = text(form, 'description');

  const result = await callWithSession<{ name: string }>('/api/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: text(form, 'name'),
      slug: text(form, 'slug'),
      description: description || null,
    }),
  });

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  return { message: `Created ${result.data.name}; you are its owner.` };
}

function organizationPath(id: string): string {
  return `/dashboard/organizations/${encodeURIComponent(id)}`;
}

export async function addMember(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const organizationId = text(form, 'organizationId');

  const result = await callWithSession<{ user: { email: string } }>(
    `/api/organizations/${encodeURIComponent(organizationId)}/members`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: text(form, 'userId'),
        role: text(form, 'role') || 'member',
      }),
    },
  );

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  return { message: `Added ${result.data.user.email}.` };
}

export async function updateMemberRole(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const organizationId = text(form, 'organizationId');
  const userId = text(form, 'userId');

  const result = await callWithSession<{ role: string; user: { email: string } }>(
    `/api/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: text(form, 'role') }),
    },
  );

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  // Like removal, this re-renders the table, so the form holding a success
  // message is replaced before it can be read.
  withNotice(
    organizationPath(organizationId),
    `${result.data.user.email} is now ${result.data.role}.`,
  );
}

export async function removeMember(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const organizationId = text(form, 'organizationId');

  const result = await callWithSession<null>(
    `/api/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(text(form, 'userId'))}`,
    { method: 'DELETE' },
  );

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  // The row this form lives in disappears, so the message goes through the URL.
  withNotice(organizationPath(organizationId), 'Member removed.');
}

export async function revokeToken(
  _previous: DashboardState,
  form: FormData,
): Promise<DashboardState> {
  const result = await callWithSession<null>(
    `/api/admin/tokens/${text(form, 'kind')}/${text(form, 'tokenId')}`,
    { method: 'DELETE' },
  );

  if (result === null) {
    return { error: SESSION_EXPIRED };
  }

  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath('/dashboard', 'layout');

  withNotice('/dashboard/tokens', 'Token revoked.');
}

import type { Page } from '@playwright/test';

/** The account `OAUTH_DEV_SEED` creates. */
export const ADMIN = { email: 'demo@example.com', password: 'demo-password' };

export async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard/);
}

/** A slug no other run will collide with; the database outlives a single run. */
export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function sessionToken(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find(
    (candidate) => candidate.name === 'pistis_session',
  );

  if (!cookie) {
    throw new Error('not signed in');
  }

  return cookie.value;
}

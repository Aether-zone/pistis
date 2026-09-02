import { expect, test } from '@playwright/test';

import { ADMIN, signIn } from './support';

test.describe('signing in', () => {

  test('the root sends an anonymous visitor to sign in', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login/);

    await expect(page.getByLabel('Email address')).toBeVisible();
  });

  test('the root sends a signed-in visitor to the dashboard', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await page.waitForURL(/\/dashboard/);

    await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible();
  });

  test('a wrong password is reported, and does not sign anyone in', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(ADMIN.email);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByText('That email address and password did not match.'),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('the dashboard is unreachable without a session', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
  });

  test('signing out ends the session', async ({ page }) => {
    await signIn(page);
    await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login/);

    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
  });
});

test.describe('the consent screen', () => {

  test('describes the client and what it is asking for', async ({ page }) => {
    const authorize =
      '/login?response_type=code&client_id=demo-client' +
      `&redirect_uri=${encodeURIComponent('http://localhost:3100/callback')}` +
      `&scope=${encodeURIComponent('profile email')}&state=xyz`;

    await page.goto(authorize);

    await expect(page.getByText('Demo Client')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Allow' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('refuses an unknown client instead of asking for a password', async ({ page }) => {
    await page.goto('/login?response_type=code&client_id=no-such-client');

    await expect(page.getByLabel('Password')).toHaveCount(0);
    await expect(page.getByText(/Unknown client/)).toBeVisible();
  });
});

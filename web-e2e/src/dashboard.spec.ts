import { expect, test } from '@playwright/test';

import { signIn, uniqueSlug } from './support';

test.describe('the application shell', () => {

  test('lays out toolbar, sidebar and main', async ({ page }) => {
    await signIn(page);

    const toolbar = await page.getByRole('banner').boundingBox();
    const sidebar = await page.getByRole('navigation', { name: 'Sections' }).boundingBox();
    const main = await page.getByRole('main').boundingBox();

    expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(sidebar!.y + 1);
    expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(main!.x + 1);
  });

  test('every sidebar link loads its section', async ({ page }) => {
    await signIn(page);

    for (const [label, heading] of [
      ['Organizations', 'Organizations'],
      ['OAuth clients', 'OAuth clients'],
      ['Users', 'Users'],
      ['Tokens', 'Issued tokens'],
      ['Overview', 'Overview'],
    ] as const) {
      await page
        .getByRole('navigation', { name: 'Sections' })
        .getByRole('link', { name: label })
        .click();

      await expect(
        page.getByRole('main').getByRole('heading', { name: heading }),
      ).toBeVisible();
    }
  });
});

test.describe('organizations', () => {

  test('creating one makes the caller its owner', async ({ page }) => {
    await signIn(page);
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Organizations' })
      .click();

    const slug = uniqueSlug('e2e');
    await page.getByText('Create an organization').click();
    await page.getByLabel('Name').fill('E2E Org');
    await page.getByLabel('Slug (lowercase, hyphen separated)').fill(slug);
    await page.getByRole('button', { name: 'Create organization' }).click();

    await expect(page.getByText(/you are its owner/)).toBeVisible();
    await expect(page.getByText(slug)).toBeVisible();
  });

  test('shows members, and refuses to remove the last owner', async ({ page }) => {
    await signIn(page);
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Organizations' })
      .click();

    const slug = uniqueSlug('members');
    await page.getByText('Create an organization').click();
    await page.getByLabel('Name').fill('Roster Org');
    await page.getByLabel('Slug (lowercase, hyphen separated)').fill(slug);
    await page.getByRole('button', { name: 'Create organization' }).click();
    await page.getByRole('link', { name: 'Roster Org' }).first().click();
    await page.waitForURL(/\/dashboard\/organizations\/[0-9a-f-]{36}/);

    // exact: accessible-name matching is a substring by default, so a loose
    // "Members" also matches the organization's own heading.
    await expect(
      page.getByRole('heading', { name: 'Members', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('demo@example.com')).toBeVisible();

    // An organization nobody owns cannot be administered by anyone.
    await page
      .getByRole('row', { name: /demo@example\.com/ })
      .getByRole('button', { name: 'Remove' })
      .click();

    await expect(page.getByText(/at least one owner/)).toBeVisible();
  });
});

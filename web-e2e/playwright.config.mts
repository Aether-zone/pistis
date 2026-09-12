import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path) and auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */

const here = dirname(fileURLToPath(import.meta.url));
// The servers below run from the workspace root, because the api's bundle and
// the Next build are both addressed relative to it.
const workspaceRoot = join(here, '..');

// Dedicated ports: the defaults are already contested, and these tests must not
// find — or kill — a server someone is using.
const WEB_PORT = process.env['WEB_E2E_WEB_PORT'] ?? '3100';
const API_PORT = process.env['WEB_E2E_API_PORT'] ?? '3101';

const baseURL = process.env['BASE_URL'] || `http://localhost:${WEB_PORT}`;
const apiUrl = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: './src',
  outputDir: 'test-output/playwright/output',
  fullyParallel: true,
  // A stray `test.only` passes locally and silently skips the rest of the
  // suite in CI; refuse it there.
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [
    [
      'html',
      {
        outputFolder: 'test-output/playwright/report',
        open: 'on-failure',
      },
    ],
    ...(process.env['CI']
      ? ([
          ['blob', { outputDir: 'test-output/playwright/blob-report' }],
        ] as const)
      : []),
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  /*
   * Both servers run as already-built artefacts; `pnpm e2e` builds them first.
   * Watch-mode servers are deliberately avoided: they are lock-guarded and
   * would attach to whatever a developer already has running — on the wrong
   * port, against the wrong api.
   */
  webServer: [
    {
      command: 'node api/dist/main.js',
      url: `${apiUrl}/.well-known/jwks.json`,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 240_000,
      stdout: 'pipe',
      env: {
        PORT: API_PORT,
        OAUTH_ISSUER: apiUrl,
        // Gives the suite an admin to sign in as; nothing else can create the
        // first account.
        OAUTH_DEV_SEED: 'true',
        OAUTH_DEV_SEED_REDIRECT_URIS: `${baseURL}/callback`,
        DATABASE_PATH: join(workspaceRoot, 'web-e2e', 'test-output', 'e2e.sqlite'),
      },
    },
    {
      command: `pnpm exec next start web --port ${WEB_PORT}`,
      url: `${baseURL}/login`,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 240_000,
      env: {
        PISTIS_API_URL: apiUrl,
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

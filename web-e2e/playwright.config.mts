import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';
import { join } from 'path';

/**
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */

// Dedicated ports: the defaults are already contested, and these tests must not
// find — or kill — a server someone is using.
const WEB_PORT = process.env['WEB_E2E_WEB_PORT'] ?? '3100';
const API_PORT = process.env['WEB_E2E_API_PORT'] ?? '3101';

const baseURL = process.env['BASE_URL'] || `http://localhost:${WEB_PORT}`;
const apiUrl = `http://localhost:${API_PORT}`;

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  /*
   * Both servers run as already-built artefacts; the `e2e` target's `dependsOn`
   * builds them. Watch-mode servers are deliberately avoided: `nx serve` is
   * deduplicated and `next dev` is lock-guarded, so either would attach to
   * whatever a developer already has running — on the wrong port, against the
   * wrong api. Nested `nx` calls are avoided too, since they race the outer
   * process for the project graph.
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

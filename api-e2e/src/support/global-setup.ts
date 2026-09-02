import { waitForPortOpen } from '@nx/node/utils';
import { spawn } from 'child_process';
import { join } from 'path';

import { API_HOST, API_PORT } from './ports';

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

/**
 * Starts the built api itself rather than depending on `nx serve`.
 *
 * The serve target is continuous, so its lifetime overlaps whatever runs next
 * and its watcher rebuilds `api/dist` underneath other tasks. Owning the
 * process here also means teardown can stop exactly what it started, instead
 * of stopping whatever happens to hold a port.
 */
module.exports = async function () {
  console.log('\nSetting up...\n');

  const server = spawn('node', ['dist/main.js'], {
    cwd: join(__dirname, '..', '..', '..', 'api'),
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: API_PORT,
      OAUTH_ISSUER: `http://${API_HOST}:${API_PORT}`,
      // Its own database file, so a run never reads or writes a real one.
      DATABASE_PATH: join(__dirname, '..', '..', 'test-output', 'api-e2e.sqlite'),
    },
  });

  server.on('error', (error) => {
    console.error('failed to start the api:', error);
  });

  await waitForPortOpen(Number(API_PORT), { host: API_HOST });

  // Hint: Use `globalThis` to pass variables to global teardown.
  globalThis.__API_PID__ = server.pid;
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
};

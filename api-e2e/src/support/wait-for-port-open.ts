import * as net from 'net';

const RETRYABLE = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'];

/**
 * Resolves once something is listening on the port, or rejects once the
 * retries run out.
 *
 * A local replacement for `waitForPortOpen` from `@nx/node/utils`: a plain
 * TCP connect, retried, which is all the original did and all this suite
 * needs to know that the api it spawned has finished booting.
 */
export function waitForPortOpen(
  port: number,
  options: { host?: string; retries?: number; retryDelay?: number } = {},
): Promise<void> {
  const host = options.host ?? 'localhost';
  const retryDelay = options.retryDelay ?? 1000;

  return new Promise((resolve, reject) => {
    const attempt = (retries: number) => {
      const client = new net.Socket();

      const cleanup = () => {
        client.removeAllListeners();
        client.end();
        client.destroy();
        client.unref();
      };

      client.once('connect', () => {
        cleanup();
        resolve();
      });

      client.once('error', (error: NodeJS.ErrnoException) => {
        // Anything outside the retryable set means the port will not open by
        // waiting — a bad host, say — so fail now rather than in two minutes.
        if (retries === 0 || !RETRYABLE.includes(error.code ?? '')) {
          cleanup();
          reject(error);
          return;
        }

        cleanup();
        setTimeout(() => attempt(retries - 1), retryDelay);
      });

      client.connect({ port, host });
    };

    attempt(options.retries ?? 120);
  });
}

/**
 * A dedicated port. The default of 3000 is contested — the api and the web app
 * both want it — and this suite's teardown stops whatever is listening, so
 * sharing it risks killing a server someone else is using.
 */
export const API_PORT = process.env.API_E2E_PORT ?? '3102';
export const API_HOST = process.env.HOST ?? 'localhost';
export const API_URL = `http://${API_HOST}:${API_PORT}`;

import { INestApplication } from "@nestjs/common";

import { OAuthExceptionFilter } from "../oauth/oauth-exception.filter";

export const GLOBAL_PREFIX = 'api';

/**
 * Routing setup shared by `main.ts` and the integration tests, so the tests
 * exercise the same prefix rules the server actually runs with.
 */
export function configureApp(app: INestApplication): INestApplication {
    // Registered globally because it only catches OAuthException. Services in
    // the OAuth module are reused elsewhere — the admin API registers clients
    // through ClientService — so their errors have to render wherever they
    // surface, not only on the OAuth controllers.
    app.useGlobalFilters(new OAuthExceptionFilter());

    // RFC 8414 fixes the discovery document at the root of the issuer origin,
    // so it is the one route that must sit outside the global prefix.
    return app.setGlobalPrefix(GLOBAL_PREFIX, {
        exclude: [
            '.well-known/oauth-authorization-server',
            '.well-known/jwks.json'
        ]
    });
}

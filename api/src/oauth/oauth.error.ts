import { type OAuthErrorCode } from "@pistis/contract";

/**
 * An RFC 6749 §5.2 error response. Carried as an exception so any layer can
 * abort a grant, and rendered by `OAuthExceptionFilter`.
 */
export class OAuthException extends Error {

    constructor(
        readonly error: OAuthErrorCode,
        readonly description?: string,
        readonly status = 400,
        readonly state?: string
    ) {
        super(description ?? error);
        this.name = 'OAuthException';
    }

    static invalidRequest(description: string): OAuthException {
        return new OAuthException('invalid_request', description);
    }

    /**
     * 401, because the client failed to authenticate. The caller adds
     * `WWW-Authenticate` when credentials came in via the Authorization header.
     */
    static invalidClient(description: string): OAuthException {
        return new OAuthException('invalid_client', description, 401);
    }

    static invalidGrant(description: string): OAuthException {
        return new OAuthException('invalid_grant', description);
    }

    static unauthorizedClient(description: string): OAuthException {
        return new OAuthException('unauthorized_client', description);
    }

    static unsupportedGrantType(description: string): OAuthException {
        return new OAuthException('unsupported_grant_type', description);
    }

    static invalidScope(description: string): OAuthException {
        return new OAuthException('invalid_scope', description);
    }

    static accessDenied(description: string, state?: string): OAuthException {
        return new OAuthException('access_denied', description, 403, state);
    }

    static invalidToken(description: string): OAuthException {
        return new OAuthException('invalid_token', description, 401);
    }
}

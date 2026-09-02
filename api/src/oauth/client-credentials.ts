import { OAuthException } from "./oauth.error";

export interface PresentedClientCredentials {
    clientId: string;
    clientSecret?: string;
}

/**
 * RFC 6749 §2.3.1: a client may authenticate with HTTP Basic
 * (`client_secret_basic`) or with body parameters (`client_secret_post`), but
 * never both in one request.
 */
export function resolveClientCredentials(
    authorization: string | undefined,
    body: { client_id?: string; client_secret?: string }
): PresentedClientCredentials {
    const basic: PresentedClientCredentials | null = parseBasic(authorization);

    if (basic && (body.client_id || body.client_secret)) {
        throw OAuthException.invalidRequest(
            'Client credentials were presented both in the Authorization header and the request body.'
        );
    }

    if (basic) {
        return basic;
    }

    if (!body.client_id) {
        throw OAuthException.invalidClient('Client authentication required.');
    }

    return {
        clientId: body.client_id,
        clientSecret: body.client_secret
    };
}

function parseBasic(authorization: string | undefined): PresentedClientCredentials | null {
    if (!authorization) {
        return null;
    }

    const [scheme, value] = authorization.split(' ');

    if (scheme?.toLowerCase() !== 'basic' || !value) {
        return null;
    }

    const decoded: string = Buffer.from(value, 'base64').toString('utf8');
    const separator: number = decoded.indexOf(':');

    if (separator < 0) {
        throw OAuthException.invalidClient('Malformed Basic authorization header.');
    }

    // The spec form-encodes both halves before base64, so they must be decoded.
    return {
        clientId: decodeURIComponent(decoded.slice(0, separator)),
        clientSecret: decodeURIComponent(decoded.slice(separator + 1))
    };
}

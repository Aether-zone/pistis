import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { type OAuthErrorDTO } from "@pistis/contract";
import { type HttpResponse } from "./http";

import { OAuthException } from "./oauth.error";

/**
 * Renders `OAuthException` as the flat JSON body the spec mandates rather than
 * Nest's default `{ statusCode, message, error }` envelope.
 */
@Catch(OAuthException)
export class OAuthExceptionFilter implements ExceptionFilter<OAuthException> {

    catch(exception: OAuthException, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<HttpResponse>();

        const body: OAuthErrorDTO = {
            error: exception.error,
            error_description: exception.description
        };

        if (exception.state) {
            body.state = exception.state;
        }

        // RFC 6749 §5.1: token responses must never be cached.
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Pragma', 'no-cache');

        // RFC 6750 §3 challenges the bearer token; RFC 6749 §5.2 challenges the
        // client's own credentials. Which one failed decides the scheme.
        const bearerError: boolean = exception.error === 'invalid_token'
            || exception.error === 'insufficient_scope';

        if (bearerError) {
            response.setHeader(
                'WWW-Authenticate',
                `Bearer realm="oauth", error="${exception.error}"`
                + (exception.description ? `, error_description="${exception.description}"` : '')
            );
        } else if (exception.status === 401) {
            response.setHeader('WWW-Authenticate', `Basic realm="oauth", error="${exception.error}"`);
        }

        response.status(exception.status).json(body);
    }
}

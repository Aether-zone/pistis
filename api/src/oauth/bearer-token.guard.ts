import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { type HttpRequest } from "./http";

import { OAuthException } from "./oauth.error";
import { AccessToken } from "./token/access-token";
import { TokenService } from "./token/token.service";

/** Request augmented with the access token a `BearerTokenGuard` resolved. */
export interface AuthenticatedRequest extends HttpRequest {
    accessToken?: AccessToken;
}

/** RFC 6750 §2.1 bearer token authentication. */
@Injectable()
export class BearerTokenGuard implements CanActivate {

    constructor(private readonly tokenService: TokenService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const header: string = typeof request.headers.authorization === 'string'
            ? request.headers.authorization
            : '';
        const [scheme, token] = header.split(' ');

        if (scheme?.toLowerCase() !== 'bearer' || !token) {
            throw OAuthException.invalidToken('A bearer token is required.');
        }

        request.accessToken = await this.tokenService.verifyAccessToken(token);

        return true;
    }
}

import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { type JsonWebKeyDTO, type JsonWebKeySetDTO } from "@pistis/contract";
import { createPrivateKey, generateKeyPairSync, KeyObject } from "crypto";

import { OAUTH_OPTIONS, type OAuthOptions } from "../oauth.options";
import { jwkThumbprint, JWT_ALGORITHM, publicKeyOf } from "./jwt";

/**
 * Holds the RSA key pair that signs access tokens.
 *
 * With no key configured a pair is generated at boot so the server still runs,
 * but every token dies with the process and a second instance would reject the
 * first one's tokens — fine for local work, never for a deployment. Set
 * `OAUTH_JWT_PRIVATE_KEY` to a PEM private key to make signing stable.
 */
@Injectable()
export class JwtKeyService implements OnModuleInit {

    private readonly logger = new Logger(JwtKeyService.name);

    private privateKey: KeyObject;
    private publicKey: KeyObject;
    private keyId: string;

    constructor(
        @Inject(OAUTH_OPTIONS) private readonly options: OAuthOptions
    ) {
        this.load();
    }

    onModuleInit(): void {
        if (!this.options.jwtPrivateKey) {
            this.logger.warn(
                'No OAUTH_JWT_PRIVATE_KEY set; signing access tokens with an ephemeral key. '
                + 'Tokens will not survive a restart and will not validate across instances.'
            );
        }
    }

    get kid(): string {
        return this.keyId;
    }

    signingKey(): KeyObject {
        return this.privateKey;
    }

    verificationKey(): KeyObject {
        return this.publicKey;
    }

    /** The public half, in the shape `GET /.well-known/jwks.json` serves. */
    jwks(): JsonWebKeySetDTO {
        const jwk = this.publicKey.export({ format: 'jwk' }) as { n: string; e: string };

        const key: JsonWebKeyDTO = {
            kty: 'RSA',
            use: 'sig',
            alg: JWT_ALGORITHM,
            kid: this.keyId,
            n: jwk.n,
            e: jwk.e
        };

        return { keys: [key] };
    }

    private load(): void {
        this.privateKey = this.options.jwtPrivateKey
            ? createPrivateKey(this.options.jwtPrivateKey)
            : generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;

        this.publicKey = publicKeyOf(this.privateKey);
        this.keyId = jwkThumbprint(this.publicKey);
    }
}

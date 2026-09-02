import { Injectable } from "@nestjs/common";
import { type CodeChallengeMethod } from "@pistis/contract";
import { createHash, timingSafeEqual } from "crypto";

/** RFC 7636 Proof Key for Code Exchange. */
@Injectable()
export class Pkce {

    /**
     * `S256` hashes the verifier; `plain` compares it verbatim and is only
     * permitted because RFC 7636 §4.2 still allows it for clients that cannot
     * compute SHA-256.
     */
    verify(
        verifier: string,
        challenge: string,
        method: CodeChallengeMethod
    ): boolean {
        const computed: string = method === 'S256'
            ? this.challengeOf(verifier)
            : verifier;

        return this.equals(computed, challenge);
    }

    challengeOf(verifier: string): string {
        return createHash('sha256')
            .update(verifier, 'ascii')
            .digest('base64url');
    }

    private equals(left: string, right: string): boolean {
        const a: Uint8Array = new Uint8Array(Buffer.from(left));
        const b: Uint8Array = new Uint8Array(Buffer.from(right));

        if (a.length !== b.length) {
            return false;
        }

        return timingSafeEqual(a, b);
    }
}

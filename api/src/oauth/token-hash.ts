import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";

/**
 * Authorization codes and tokens are bearer secrets, so only their SHA-256
 * digest is persisted — a database leak then yields nothing usable. Lookup
 * stays a plain indexed equality check because the digest is deterministic.
 *
 * bcrypt is deliberately not used here: these values are 256 bits of CSPRNG
 * output, so they need no work factor, and every token check would otherwise
 * pay a full bcrypt round.
 */
@Injectable()
export class TokenHash {

    issue(): string {
        return randomBytes(32).toString('base64url');
    }

    hash(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }
}

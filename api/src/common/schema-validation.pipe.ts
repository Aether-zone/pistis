import { BadRequestException, PipeTransform } from "@nestjs/common";

/**
 * Structural shape of a zod schema's `safeParse`. Declared here rather than
 * imported so the api keeps zod as a transitive dependency of `@pistis/contract`
 * instead of a direct one — the schemas themselves come from the contract.
 */
export interface SafeParser<T> {
    safeParse(value: unknown): { success: true; data: T }
        | { success: false; error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> } };
}

export type InvalidInput = (description: string) => Error;

/**
 * Validates a request against a contract schema.
 *
 * The failure is raised through a caller-supplied factory because not every
 * endpoint reports errors the same way: the OAuth endpoints must answer with
 * RFC 6749's flat `{ error, error_description }` body, while everything else
 * uses Nest's ordinary exceptions.
 */
export class SchemaValidationPipe<T> implements PipeTransform<unknown, T> {

    constructor(
        private readonly schema: SafeParser<T>,
        private readonly onInvalid: InvalidInput = (description) => new BadRequestException(description)
    ) { }

    transform(value: unknown): T {
        const result = this.schema.safeParse(value);

        if (result.success) {
            return result.data;
        }

        const description: string = result.error.issues
            .map((issue) => {
                const path: string = issue.path.map(String).join('.');

                return path ? `${path}: ${issue.message}` : issue.message;
            })
            .join('; ');

        throw this.onInvalid(description);
    }
}

/**
 * Minimal structural stand-ins for the pieces of the Express request and
 * response this module touches. Declared locally so the api does not need
 * `@types/express` just to set a header.
 */

export interface HttpResponse {
    setHeader(name: string, value: string): unknown;
    status(code: number): HttpResponse;
    json(body: unknown): unknown;
}

export interface HttpRequest {
    headers: Record<string, string | string[] | undefined>;
    params: Record<string, string>;
    body?: unknown;
}

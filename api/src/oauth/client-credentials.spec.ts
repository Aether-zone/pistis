import { OAuthException } from "./oauth.error";
import { resolveClientCredentials } from "./client-credentials";

describe('resolveClientCredentials', () => {

    const basic = (value: string): string =>
        `Basic ${Buffer.from(value).toString('base64')}`;

    it('reads client_secret_basic from the Authorization header', () => {
        expect(resolveClientCredentials(basic('my-client:s3cret'), {}))
            .toEqual({ clientId: 'my-client', clientSecret: 's3cret' });
    });

    it('form-decodes both halves, as RFC 6749 §2.3.1 requires', () => {
        expect(resolveClientCredentials(basic('cli%40ent:p%3Ass%3Aword'), {}))
            .toEqual({ clientId: 'cli@ent', clientSecret: 'p:ss:word' });
    });

    it('keeps only the first colon as the separator', () => {
        expect(resolveClientCredentials(basic('client:a:b:c'), {}))
            .toEqual({ clientId: 'client', clientSecret: 'a:b:c' });
    });

    it('reads client_secret_post from the body', () => {
        expect(resolveClientCredentials(undefined, {
            client_id: 'my-client',
            client_secret: 's3cret'
        })).toEqual({ clientId: 'my-client', clientSecret: 's3cret' });
    });

    it('allows a public client to identify itself with no secret', () => {
        expect(resolveClientCredentials(undefined, { client_id: 'public-client' }))
            .toEqual({ clientId: 'public-client', clientSecret: undefined });
    });

    it('refuses credentials presented in both places at once', () => {
        expect(() => resolveClientCredentials(basic('a:b'), { client_id: 'a' }))
            .toThrow(OAuthException);
    });

    it('refuses a request with no client identity at all', () => {
        expect(() => resolveClientCredentials(undefined, {}))
            .toThrow(expect.objectContaining({ error: 'invalid_client' }));
    });

    it('ignores a non-Basic scheme and falls back to the body', () => {
        expect(resolveClientCredentials('Bearer some-token', { client_id: 'my-client' }))
            .toEqual({ clientId: 'my-client', clientSecret: undefined });
    });

    it('refuses a Basic header with no colon', () => {
        expect(() => resolveClientCredentials(basic('no-separator'), {}))
            .toThrow(OAuthException);
    });
});

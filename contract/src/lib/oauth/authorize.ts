import { z } from 'zod';

import { scopeDescriptorSchema } from './scope.js';

export const responseTypeSchema = z.enum(['code']);

export const codeChallengeMethodSchema = z.enum(['S256', 'plain']);

/**
 * Query parameters of `GET /oauth/authorize` (RFC 6749 §4.1.1) plus the PKCE
 * parameters from RFC 7636 §4.3.
 */
export const authorizationRequestSchema = z.object({
    response_type: responseTypeSchema,
    client_id: z.string().min(1),
    redirect_uri: z.url().optional(),
    scope: z.string().optional(),
    state: z.string().optional(),
    code_challenge: z.string().min(43).max(128).optional(),
    code_challenge_method: codeChallengeMethodSchema.optional(),
});

/** What the consent screen needs in order to ask the resource owner. */
export const authorizationPromptSchema = z.object({
    client_id: z.string(),
    client_name: z.string(),
    redirect_uri: z.string(),
    scopes: z.array(scopeDescriptorSchema),
    state: z.string().optional(),
});

/** Body of `POST /oauth/authorize`: the same request, plus who is answering it. */
export const authorizationDecisionSchema = authorizationRequestSchema.extend({
    username: z.string().min(1),
    password: z.string().min(1),
    approved: z.boolean(),
});

/**
 * `redirect_uri` is the fully-built URL the caller should send the user agent
 * to; it already carries either `code`+`state` or `error`+`state`.
 */
export const authorizationResponseSchema = z.object({
    redirect_uri: z.string(),
    code: z.string().optional(),
    state: z.string().optional(),
});

export type ResponseType = z.infer<typeof responseTypeSchema>;
export type CodeChallengeMethod = z.infer<typeof codeChallengeMethodSchema>;
export type AuthorizationRequestDTO = z.infer<typeof authorizationRequestSchema>;
export type AuthorizationPromptDTO = z.infer<typeof authorizationPromptSchema>;
export type AuthorizationDecisionDTO = z.infer<
    typeof authorizationDecisionSchema
>;
export type AuthorizationResponseDTO = z.infer<
    typeof authorizationResponseSchema
>;

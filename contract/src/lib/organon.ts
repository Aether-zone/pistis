/**
 * The parts of this contract that organon owns.
 *
 * `@aether-zone/organon` is the single definition of the token vocabulary, the
 * key format and the page envelope; pistis defined all three once and no
 * longer does. They are re-exported here rather than imported directly by the
 * api and the web app so that `@pistis/contract` stays the one import for
 * everything on the wire — a caller should not have to know which half of the
 * contract came from where.
 *
 * Named explicitly rather than `export *`: organon's root also carries its Nest
 * building blocks — a problem filter, a logger, health endpoints — and none of
 * those belong in a package that describes an HTTP contract.
 */
export {
    // Access token claims and the keys they are signed with.
    ACCESS_TOKEN_TYPE,
    JWT_ALGORITHM,
    SESSION_TOKEN_TYPE,
    accessTokenClaimsSchema,
    jsonWebKeySchema,
    jsonWebKeySetSchema,
    jwksUriFor,
    organizationMembershipClaimSchema,
    type AccessTokenClaimsDTO,
    type JsonWebKeyDTO,
    type JsonWebKeySetDTO,
    type OrganizationMembershipClaim,

    // What `/oauth/userinfo` answers with.
    userInfoSchema,
    type UserInfoDTO,

    // Scope strings on the wire.
    formatScope,
    parseScope,

    // Organization roles, and their ordering by authority.
    ROLE_AUTHORITY,
    membershipRoleSchema,
    roleIsAtLeast,
    type MembershipRole,

    // The page envelope every listing endpoint returns.
    Pageable,
    pageRequestDtoSchema,
    type PageRequestDTO
} from '@aether-zone/organon';

# @pistis/contract

The types and schemas shared by `@pistis/api` and `@pistis/web`. This is the only
code both sides import, and the only place a wire format is defined.

## Two things make it unusual

**It is consumed as TypeScript source, not built output.** `main`, `types` and
`exports` all point at `./src/index.ts`. There is no build step to run before
consumers see a change; edits are picked up directly.

**It is ESM under `nodenext`**, so every relative import inside `src/` must carry
a `.js` extension, naming a file that only TypeScript can see:

```ts
export * from './lib/user.js';   // resolves to lib/user.ts
```

Jest is told about this by a `moduleNameMapper` in `jest.config.cts`. Omitting
the extension breaks the build; adding it in a consumer's own code does not.

## What is in it

| Module | |
| --- | --- |
| `lib/user`, `lib/credentials` | Users and sign-in |
| `lib/organization` | Organizations and membership roles |
| `lib/oauth` | Authorization requests, tokens, introspection, JWKS, RFC 9068 claims |
| `lib/admin` | Sessions and the management API |
| `lib/page` | `Pageable<T>` and page requests |

## Two export conventions, on purpose

Most modules declare a zod schema and export **only the inferred type**. The
schema stays module-private, so nothing validates these at runtime:

```ts
const userSchema = z.object({ /* … */ });
export type UserDTO = z.infer<typeof userSchema>;
```

Because those types are erased at compile time, a NestJS controller must import
them as types — `import { type UserDTO } from '@pistis/contract'` — or
`emitDecoratorMetadata` tries to emit a value reference and the build fails.

The `oauth`, `organization` and `admin` modules export **the schema as well**,
because those endpoints validate untrusted input at runtime through
`SchemaValidationPipe`. Follow that pattern for anything checked at the edge.

## Things to know before editing

**`Pageable<T>` is a real class**, not a type: it has `Pageable.of(...)` and is
imported normally. It defines `toJSON()` because getters are not own enumerable
properties — without it, serialising a page emits the backing fields (`_items`,
`_totalNumberOfElements`) and drops the computed `totalNumberOfPages`.

**zod's `.omit()` takes a mask object, not an array of keys.** The array form
throws `Unrecognized key: "0"` the moment the schema is evaluated, and infers
`never` for every surviving field — which typechecks in a consumer until
something tries to construct one:

```ts
userSchema.omit({ id: true, createdAt: true });   // correct
userSchema.omit(['id', 'createdAt']);             // throws at module load
```

**Query strings are text.** Anything parsed from a query string needs
`z.coerce.number()`; `z.number()` alone rejects every request. See
`lib/page/page-request.ts`.

**OAuth field names stay snake_case** (`access_token`, `client_id`,
`error_description`). They are on the wire exactly as the specifications define
them, and renaming them to match the surrounding style would break
interoperability.

## Testing

```sh
pnpm --filter @pistis/contract test
pnpm --filter @pistis/contract typecheck
```

Only the runtime helpers are worth testing here — scope parsing and formatting,
page shaping. Everything else is types, which `typecheck` covers.

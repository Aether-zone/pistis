# 8. The shared contract is consumed as TypeScript source

- Status: Accepted
- Date: 2026-09-02

## Context

The API and the web app must agree on every wire format. A shared package is
the obvious way to hold that agreement, but a conventional one is compiled:
consumers import build output, so every change needs a build before it is
visible, and a stale build produces confusing failures.

## Decision

`@pistis/contract` is consumed as TypeScript source. Its `main`, `types` and
`exports` all point at `./src/index.ts`; there is no build step between editing
it and consumers seeing the change.

The package is ESM under `nodenext`, so relative imports inside it carry a
`.js` extension naming a file only TypeScript can see.

Two export conventions live side by side, deliberately:

- most modules export only the **inferred type**, keeping the zod schema
  private — nothing validates them at runtime;
- the `oauth`, `organization` and `admin` modules export **the schema as well**,
  because those endpoints validate untrusted input at the edge.

## Consequences

A contract change is immediately visible to both consumers, and the compiler
finds every place that has to change with it. Webpack bundles the source into
the API, so nothing needs publishing.

The costs are real and mostly paid by tooling. Jest needs a `moduleNameMapper`
to resolve the `.js` extensions. Because type-only exports are erased, NestJS
controllers must import DTOs as `import { type X }` or `emitDecoratorMetadata`
tries to emit a value reference and the build fails. `zod` is a transitive
dependency of the API rather than a direct one, so API code uses schemas the
contract exports rather than importing `zod` itself.

The split convention is a judgement call, not an accident: adding runtime
validation everywhere would be safer but would make every DTO carry a schema
into the bundle. The rule is that anything reachable by an untrusted caller
exports its schema.

Publishing this package for external consumers would require reversing the
first half of this decision and shipping build output.

/* eslint-disable @typescript-eslint/no-explicit-any */

/*
 * Ambient declarations for the non-code files this app imports.
 *
 * These used to come from `@nx/next/typings/style.d.ts` via a triple-slash
 * reference. They are declared here now, because with Nx gone nothing else
 * ships them and TypeScript has no built-in knowledge of a CSS import.
 *
 * TS 6.0 enables `noUncheckedSideEffectImports`, which errors on a plain
 * `import './x.css'` unless the module is declared. Equally-specific wildcard
 * patterns resolve by registration order, so this bare '*.css' can shadow
 * next's own typed '*.module.css'; the class-map default export keeps
 * CSS-module property access working even when it shadows.
 */
declare module '*.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.sass' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.less' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.svg' {
  const content: any;
  export const ReactComponent: any;
  export default content;
}

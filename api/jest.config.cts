/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@pistis/api',
  preset: '../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  // Two packages under node_modules have to be transformed rather than skipped.
  //
  // `@nestjs/typeorm` v12 is published as pure ESM ("type": "module", no
  // `require` condition), so CJS Jest cannot load it as-is; SWC downlevels it
  // to CommonJS.
  //
  // `@pistis/contract` is consumed as **TypeScript source** — see ADR 0008 —
  // so it has to be compiled wherever it resolves from. A `workspace:*`
  // specifier resolves to `file:contract` in the lockfile, and a fresh install
  // materialises that inside the virtual store, which means the contract's
  // `src/index.ts` has a real path under node_modules. Locally it is symlinked
  // straight to the workspace directory and so escaped this pattern, which is
  // why it passed here and failed in CI with `Unexpected token 'export'`.
  //
  // The negative lookahead has to tolerate pnpm's doubled path
  // (`.pnpm/@nestjs+typeorm@.../node_modules/@nestjs/typeorm`), hence both the
  // `+` and `/` separators for each.
  transformIgnorePatterns: [
    'node_modules/(?!.*(@nestjs[+/]typeorm|@pistis[+/]contract))',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};

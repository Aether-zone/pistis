const nextJest = require('next/jest.js');

const createJestConfig = nextJest({
  dir: './',
});

const config = {
  displayName: '@pistis/web',
  preset: '../jest.preset.js',
  moduleNameMapper: {
    // tsconfig maps `@/*` to `./src/*`; SWC's own alias resolution is disabled
    // below, so Jest needs to be told about it separately.
    '^@/(.*)$': '<rootDir>/src/$1',
    // `@aether-zone/kosmos` exports only `types` and `import` conditions — no
    // `require` — so Node's CJS resolver cannot load it at all and Jest's
    // falls through to the `types` entry and tries to execute `index.d.mts`
    // as JavaScript. Point the bare specifier at the real ESM build; the
    // anchor keeps subpaths like `/styles.css` on next/jest's CSS handling.
    '^@aether-zone/kosmos$':
      '<rootDir>/node_modules/@aether-zone/kosmos/dist/index.mjs',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
  coverageDirectory: '../coverage/web',
  testEnvironment: 'jsdom',
};

const jestConfig = createJestConfig(config);

module.exports = async () => {
  const resolved = await jestConfig();

  // next/jest points SWC at the tsconfig `baseUrl`, which makes it resolve the
  // `@/*` alias itself and hand Jest an absolute path that bypasses
  // `moduleNameMapper`. The mapper above is the one source of truth for that
  // alias, so SWC is told to leave it alone.
  for (const value of Object.values(resolved.transform)) {
    if (Array.isArray(value) && value[1]?.resolvedBaseUrl) {
      value[1] = { ...value[1], resolvedBaseUrl: undefined };
    }
  }

  // next/jest builds its own transformIgnorePatterns with a fixed allowlist
  // (`geist`) and overwrites anything set in the input config, so kosmos has
  // to be added here, afterwards. It is shipped as ESM only, and Jest is CJS,
  // so it must go through the SWC transform rather than be skipped with the
  // rest of node_modules. pnpm needs both spellings: the store path
  // (`.pnpm/@aether-zone+kosmos@…`) and the link (`@aether-zone/kosmos`).
  resolved.transformIgnorePatterns = resolved.transformIgnorePatterns.map(
    (pattern: string) =>
      pattern
        .replace('(?!.pnpm)(?!(geist)/)', '(?!.pnpm)(?!(geist|@aether-zone)/)')
        .replace('(?!(geist)@)', '(?!(geist|@aether-zone\\+)@?)'),
  );

  return resolved;
};

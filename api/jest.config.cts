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
  // `@nestjs/typeorm` v12 is published as pure ESM ("type": "module", no
  // `require` condition), so CJS Jest cannot load it as-is. Everything under
  // node_modules stays untransformed except that package, which SWC downlevels
  // to CommonJS. The negative lookahead has to tolerate pnpm's doubled path
  // (`.pnpm/@nestjs+typeorm@.../node_modules/@nestjs/typeorm`), hence both the
  // `+` and `/` separators.
  transformIgnorePatterns: ['node_modules/(?!.*@nestjs[+/]typeorm)'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};

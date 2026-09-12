import nextEslintPluginNext from '@next/eslint-plugin-next';
import baseConfig from '../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: { '@next/next': nextEslintPluginNext },
    rules: {
      ...nextEslintPluginNext.configs.recommended.rules,
      ...nextEslintPluginNext.configs['core-web-vitals'].rules,
    },
  },
  {
    ignores: ['.next/**/*', 'out-tsc/**/*', 'next-env.d.ts'],
  },
];

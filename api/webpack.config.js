const { join } = require('path');

/**
 * Plain webpack — the api bundles itself, with no build framework in between.
 *
 * `compiler: tsc` under the previous Nx plugin meant ts-loader transpiling
 * without type checking. That is kept: `pnpm typecheck` is the type gate, and
 * keeping it out of the bundle step is what makes a rebuild fast.
 */
module.exports = (_env, argv) => {
  const production = argv.mode === 'production';

  return {
    target: 'node',
    mode: production ? 'production' : 'development',
    entry: join(__dirname, 'src/main.ts'),
    devtool: 'source-map',

    /*
     * Never minify. NestJS resolves providers by constructor type and TypeORM
     * builds its schema from entity class names, both read at runtime out of
     * decorator metadata — so mangling names does not shrink the bundle, it
     * breaks it.
     */
    optimization: { minimize: false },

    output: {
      path: join(__dirname, 'dist'),
      filename: 'main.js',
      clean: true,
      ...(production
        ? {}
        : { devtoolModuleFilenameTemplate: '[absolute-resource-path]' }),
    },

    resolve: {
      extensions: ['.ts', '.js', '.json'],
      // `@pistis/contract` is ESM under `nodenext`, so its relative imports
      // carry a `.js` extension that only TypeScript can see through. Webpack
      // resolves those to the `.ts` source instead.
      extensionAlias: { '.js': ['.ts', '.js'] },
    },

    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: join(__dirname, 'tsconfig.webpack.json'),
              transpileOnly: true,
            },
          },
        },
      ],
    },

    /*
     * Everything from node_modules stays a real `require` at runtime; only this
     * project's own source is bundled. Deciding by request shape rather than by
     * scanning a node_modules directory matters under pnpm, where the api's
     * dependencies live in api/node_modules and a workspace-root scan misses
     * them entirely — which is how better-sqlite3 and bcrypt used to end up
     * bundled, their prebuilt `.node` binaries looked for under api/dist, and
     * the server dead on boot with "No native build was found". typeorm has the
     * same requirement for a different reason: it loads drivers through
     * `require(driverName)` with a computed name, which webpack cannot resolve.
     *
     * `@pistis/contract` is the exception: it is consumed as TypeScript source,
     * so it has to be compiled in. `@aether-zone/organon/pistis` is *not* an
     * exception, even though `@pistis/contract` re-exports it: it is an
     * installed package that ships built CommonJS, so it stays a real
     * `require` like every other dependency.
     */
    externals: [
      function ({ request }, callback) {
        if (
          !request ||
          /^[./]/.test(request) ||
          request.startsWith('@pistis/')
        ) {
          return callback();
        }

        return callback(null, `commonjs ${request}`);
      },
    ],
  };
};

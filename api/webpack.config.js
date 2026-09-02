const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  // better-sqlite3 and bcrypt ship prebuilt .node binaries that their loaders
  // resolve relative to their own package directory, so bundling them moves the
  // lookup to api/dist — where no binary exists — and the server dies on boot
  // with "No native build was found".
  //
  // Nx's default `externalDependencies: 'all'` would normally leave them alone,
  // but it feeds webpack-node-externals the *workspace root* node_modules, and
  // under pnpm these two live in api/node_modules instead, so they are invisible
  // to it. `mergeExternals` keeps that default behaviour and adds these on top.
  // typeorm is external for a second reason: it loads its drivers through
  // `require(driverName)` with a computed name, which webpack cannot resolve
  // (hence its "request of a dependency is an expression" warnings). Keeping
  // typeorm out of the bundle leaves that a real Node require.
  externals: [
    {
      'better-sqlite3': 'commonjs better-sqlite3',
      bcrypt: 'commonjs bcrypt',
      typeorm: 'commonjs typeorm',
    },
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
      mergeExternals: true,
    }),
  ],
};

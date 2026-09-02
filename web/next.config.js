//@ts-check
const { join } = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits .next/standalone: a self-contained server with only the files this
  // app actually reaches, which is what the Docker image copies. Without the
  // tracing root, Next infers it from this directory and misses the pnpm
  // workspace's hoisted node_modules at the repository root.
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '..'),
};

module.exports = nextConfig;

# syntax=docker/dockerfile:1
#
# aether-zone/pistis-api — the NestJS authorization server.
#
# Build from the repository root, not from api/:
#   docker build -f api/Dockerfile -t aether-zone/pistis-api .
#
# The webpack bundle leaves better-sqlite3, bcrypt and typeorm external, so the
# image needs real installed copies of them. They are installed in the builder,
# which has a toolchain for the native ones, and copied into a runtime image on
# the same base so the compiled bindings match.

FROM node:22-bookworm-slim AS builder

# node-gyp's fallback path, for any native module without a prebuild.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /workspace

# Manifests first: this layer is what pnpm resolves against, so it is only
# invalidated when a dependency changes, not on every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY api/package.json api/
COPY contract/package.json contract/
COPY web/package.json web/
COPY api-e2e/package.json api-e2e/
COPY web-e2e/package.json web-e2e/

RUN pnpm install --frozen-lockfile

COPY . .

# `prune` builds the app, then writes api/dist/package.json and a matching
# lockfile carrying only what the bundle still needs at runtime, with
# @pistis/contract rewritten to a file: reference under workspace_modules.
RUN pnpm exec nx prune @pistis/api

WORKDIR /workspace/api/dist
RUN pnpm install --prod --frozen-lockfile


FROM node:22-bookworm-slim AS runner

# Signals with a default action are ignored by PID 1, so node started directly
# would not stop on the SIGTERM a deployment sends. dumb-init forwards it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/pistis.sqlite

WORKDIR /app

COPY --from=builder --chown=node:node /workspace/api/dist ./

# SQLite lives outside the image; without a volume here the database is lost
# on every restart.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "main.js"]

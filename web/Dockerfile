# syntax=docker/dockerfile:1
#
# aether-zone/pistis-web — the Next.js sign-in, consent screen and dashboard.
#
# Build from the repository root, not from web/:
#   docker build -f web/Dockerfile -t aether-zone/pistis-web .
#
# Next's standalone output is a server plus only the files the app actually
# reaches, so the runtime image carries no pnpm store and no build toolchain.

FROM node:22-bookworm-slim AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /workspace

# No .npmrc: both @aether-zone packages are on npm, which is the default
# registry, so the build needs no scope mapping and no token.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/
COPY contract/package.json contract/
COPY web/package.json web/
COPY api-e2e/package.json api-e2e/
COPY web-e2e/package.json web-e2e/

# --ignore-scripts because a workspace install resolves *every* project's
# dependencies, including the api's better-sqlite3 and bcrypt, which would
# otherwise try to compile and fail for want of a toolchain. This image never
# runs them; adding python3/make/g++ here would build them only to discard the
# stage. It also skips Playwright's browser download.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm --filter @pistis/web build


FROM node:22-bookworm-slim AS runner

RUN apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app

# `outputFileTracingRoot` is the workspace root, so standalone mirrors the
# workspace layout: the server lands at web/server.js with node_modules beside
# it. Static assets and public/ are not traced and must be copied separately.
COPY --from=builder --chown=node:node /workspace/web/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/web/.next/static ./web/.next/static
COPY --from=builder --chown=node:node /workspace/web/public ./web/public

USER node
EXPOSE 3000

# Reaching the api is the whole job, and the default is almost always wrong in
# a container — nothing else is listening on this app's own localhost.
ENV PISTIS_API_URL=http://api:3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "web/server.js"]

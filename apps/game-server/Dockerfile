# syntax=docker/dockerfile:1

FROM node:24.19.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /workspace

RUN corepack enable
RUN corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/game-server/package.json ./apps/game-server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/fairness/package.json ./packages/fairness/package.json
COPY packages/game-core/package.json ./packages/game-core/package.json
COPY packages/system-model/package.json ./packages/system-model/package.json

RUN pnpm install --frozen-lockfile

COPY apps/game-server ./apps/game-server
COPY packages/config ./packages/config
COPY packages/contracts ./packages/contracts
COPY packages/fairness ./packages/fairness
COPY packages/game-core ./packages/game-core

RUN pnpm --filter @spelsajt/game-server build
RUN pnpm --filter @spelsajt/game-server deploy --prod --legacy /prod/game-server

FROM node:24.19.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV GAME_SERVER_HOST=0.0.0.0

WORKDIR /app

COPY --from=build --chown=node:node /prod/game-server/package.json ./package.json
COPY --from=build --chown=node:node /prod/game-server/dist ./dist
COPY --from=build --chown=node:node /prod/game-server/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/game-server/certs ./certs

USER node

EXPOSE 4000

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=5 \
  CMD ["node", "-e", "const port = process.env.GAME_SERVER_PORT || process.env.PORT || '4000'; fetch('http://127.0.0.1:' + port + '/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "dist/start.js"]

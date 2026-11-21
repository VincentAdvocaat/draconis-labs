# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY server/api ./server/api
COPY apps/planner ./apps/planner
RUN corepack pnpm install --frozen-lockfile

FROM build AS api-build
RUN corepack pnpm --filter @draconis/api build

FROM node:22-bookworm-slim AS api-dependencies
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY packages/planner-core ./packages/planner-core
COPY packages/planner-sqlite ./packages/planner-sqlite
COPY server/api/package.json ./server/api/package.json
RUN corepack pnpm install --prod --frozen-lockfile

FROM node:22-bookworm-slim AS api
WORKDIR /repo/server/api
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=/data/draconis.sqlite
RUN install -d -o node -g node /data
COPY --from=api-dependencies /repo /repo
COPY --from=api-build /repo/server/api/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "dist/index.js"]

FROM build AS planner-build
ENV VITE_API_URL=
RUN corepack pnpm --filter @draconis/planner build

FROM nginxinc/nginx-unprivileged:stable-alpine AS planner
COPY infra/containers/planner.conf.template /etc/nginx/templates/default.conf.template
COPY --from=planner-build /repo/apps/planner/dist/ /usr/share/nginx/html/
EXPOSE 8080

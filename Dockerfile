FROM node:24-alpine AS base

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
WORKDIR /app

FROM base AS build

ARG VITE_AUTH_GATEWAY_URL=https://auth.m16khb.xyz
ENV VITE_AUTH_GATEWAY_URL=$VITE_AUTH_GATEWAY_URL
ENV CI=true

COPY . .
RUN pnpm install --frozen-lockfile
RUN ./node_modules/.bin/tsc -p packages/contracts/tsconfig.build.json
RUN ./node_modules/.bin/tsc -p packages/db/tsconfig.build.json
RUN cd apps/web && ../../node_modules/.bin/vite build
RUN cd apps/api && ../../node_modules/.bin/nest build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV WEB_DIST_PATH=/app/web
ENV MIGRATIONS_PATH=/app/drizzle

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/apps/web/dist ./web
COPY --from=build /app/packages/db/drizzle ./drizzle
RUN mkdir -p node_modules/@mota \
  && ln -s ../../packages/contracts node_modules/@mota/contracts \
  && ln -s ../../packages/db node_modules/@mota/db

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

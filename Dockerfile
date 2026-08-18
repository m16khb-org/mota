FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && pnpm prune --prod

FROM oven/bun:1.3.14-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json ./
COPY server ./server
COPY src/domain ./src/domain
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER bun

EXPOSE 3000

CMD ["bun", "server/index.ts"]

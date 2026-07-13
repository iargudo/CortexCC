# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY scripts ./scripts
COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate && npx prisma generate --schema=prisma/master.schema.prisma
RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ARG APP_PORT=3037
ENV NODE_ENV=production
ENV PORT=${APP_PORT}

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY scripts ./scripts
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/@prisma/client-master ./node_modules/@prisma/client-master
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

EXPOSE ${APP_PORT}

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]

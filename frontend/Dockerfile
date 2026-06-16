# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS builder

WORKDIR /app

ARG VITE_API_URL=http://localhost:3030/api
ARG VITE_WS_URL=http://localhost:3030
ARG VITE_SOCKET_PATH=/socket.io

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_SOCKET_PATH=${VITE_SOCKET_PATH}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ARG APP_PORT=8080
ENV NODE_ENV=production
ENV APP_PORT=${APP_PORT}

RUN npm install -g serve@14.2.4

COPY --from=builder /app/dist ./dist

EXPOSE ${APP_PORT}

CMD ["sh", "-c", "exec serve -s dist -l \"$APP_PORT\""]

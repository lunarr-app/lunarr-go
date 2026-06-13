# syntax=docker/dockerfile:1

ARG BUN_VERSION=1
ARG NODE_VERSION=24-trixie-slim

FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
ARG LUNARR_APP_VERSION
ENV LUNARR_APP_VERSION=${LUNARR_APP_VERSION}
RUN test -n "$LUNARR_APP_VERSION" || (echo "LUNARR_APP_VERSION build arg is required" >&2; exit 1)
RUN bun run build

FROM node:${NODE_VERSION} AS runtime
ARG LUNARR_APP_VERSION
RUN test -n "$LUNARR_APP_VERSION" || (echo "LUNARR_APP_VERSION build arg is required" >&2; exit 1)
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    LUNARR_DATA_DIR=/data \
    LUNARR_APP_VERSION=${LUNARR_APP_VERSION}

WORKDIR /app

COPY --chown=node:node scripts/verify-ffmpeg.mjs scripts/smoke-ffmpeg-transcode.mjs scripts/smoke-ffmpeg-hardware.mjs scripts/verify-nodeav-probe.mjs scripts/verify-runtime.mjs ./scripts/

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && node scripts/verify-ffmpeg.mjs

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
RUN node scripts/verify-nodeav-probe.mjs

COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node package.json ./
COPY --chown=node:node scripts/start.mjs scripts/env.mjs ./scripts/

RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "scripts/start.mjs"]

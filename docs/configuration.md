# Configuration

Lunarr reads `.env` from the project directory and also accepts normal process environment variables.

## Core Settings

`AUTH_SECRET`

A stable secret used by authentication and server-side encryption helpers. It must be at least 32 characters and must stay the same between restarts.

`ORIGIN`

The public URL where users access Lunarr. Examples:

```text
http://127.0.0.1:5173
https://lunarr.example.com
```

`LUNARR_DATA_DIR`

Persistent app data directory. Lunarr stores the SQLite database at `LUNARR_DATA_DIR/lunarr.db` and temporary playback artifacts under `LUNARR_DATA_DIR/playback-sessions`.

## Local Development

```sh
bun install
cp .env.example .env
bun run dev
```

Default local values are suitable for development, but setting a stable `AUTH_SECRET` in `.env` is still recommended.

## Production Start

Build the server:

```sh
bun run build
```

Start the Node server:

```sh
export AUTH_SECRET=replace-with-a-random-secret-at-least-32-chars
export ORIGIN=http://127.0.0.1:3000
export HOST=127.0.0.1
export PORT=3000
export LUNARR_DATA_DIR=/var/lib/lunarr
bun run start
```

Database migrations run automatically on startup.

## Docker

Use the published image with persistent app data:

```sh
docker run -d \
  --name lunarr \
  --restart unless-stopped \
  -p 3000:3000 \
  -e AUTH_SECRET=replace-with-a-random-secret-at-least-32-chars \
  -e ORIGIN=http://127.0.0.1:3000 \
  -v lunarr-data:/data \
  sayem314/lunarr:latest
```

For local filesystem libraries, mount media into the container:

```sh
docker run -d \
  --name lunarr \
  --restart unless-stopped \
  -p 3000:3000 \
  -e AUTH_SECRET=replace-with-a-random-secret-at-least-32-chars \
  -e ORIGIN=http://127.0.0.1:3000 \
  -v lunarr-data:/data \
  -v /mnt/media:/media:ro \
  sayem314/lunarr:latest
```

Or use the compose example:

```sh
docker compose up -d
```

Before starting, replace `AUTH_SECRET`, set `ORIGIN` to the URL users will open, and change `/mnt/media:/media:ro` to your host media path.

Build and run a local image:

```sh
docker build --build-arg LUNARR_APP_VERSION=local -t lunarr:local .
docker run --rm \
  --name lunarr \
  -p 3000:3000 \
  -e AUTH_SECRET=replace-with-a-random-secret-at-least-32-chars \
  -e ORIGIN=http://127.0.0.1:3000 \
  -v lunarr-data:/data \
  lunarr:local
```

## Watcher Environment

Local libraries use native file events by default. For remote or mounted local libraries where native file events are unreliable, enable conservative watcher polling:

```sh
LUNARR_WATCH_USE_POLLING=true
LUNARR_WATCH_INTERVAL_MS=5000
LUNARR_WATCH_BINARY_INTERVAL_MS=10000
LUNARR_WATCH_DEBOUNCE_MS=10000
LUNARR_WATCH_WRITE_STABILITY_MS=15000
```

Limits:

```text
LUNARR_WATCH_INTERVAL_MS: 1000-60000
LUNARR_WATCH_BINARY_INTERVAL_MS: 1000-120000
LUNARR_WATCH_DEBOUNCE_MS: 1000-300000
LUNARR_WATCH_WRITE_STABILITY_MS: 1000-300000
```

Polling is best-effort and can still miss remote-side cache changes. Manual scans or scheduled rescans remain the source of truth.

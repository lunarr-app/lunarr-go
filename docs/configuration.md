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

Persistent app data directory. Lunarr stores the SQLite database at `LUNARR_DATA_DIR/lunarr.db`, per-session HLS playlists under `LUNARR_DATA_DIR/playback-sessions`, and shared encoded HLS segments under `LUNARR_DATA_DIR/playback-cache`.

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

## Playback Runtime

`FFMPEG_PATH`

Optional path to the FFmpeg executable used for HLS playback, runtime verification, and smoke tests. Lunarr resolves FFmpeg in this order:

1. `FFMPEG_PATH`
2. `ffmpeg` on `PATH`
3. the bundled NodeAV FFmpeg path as a fallback

Set this when the FFmpeg binary you want Lunarr to use is not the first `ffmpeg` on `PATH`:

```sh
export FFMPEG_PATH=/usr/local/bin/ffmpeg
```

`FFMPEG_VAAPI_DEVICE`

Optional VAAPI render device path for Linux hardware acceleration checks and VAAPI playback arguments. Defaults to `/dev/dri/renderD128`.

```sh
export FFMPEG_VAAPI_DEVICE=/dev/dri/renderD128
```

For runtime verification, hardware smoke modes can be selected with `LUNARR_VERIFY_HARDWARE` or `FFMPEG_SMOKE_HARDWARE`. See [Transcoding Runtime](transcoding-runtime.md) for the full playback runtime notes.

## Docker

Use the published image with persistent app data:

The published Docker image includes system FFmpeg from the runtime distribution package repositories. The image build verifies baseline FFmpeg playback requirements before publishing, so normal Docker users do not need to install FFmpeg separately inside the container.

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

Local Docker builds also install and verify FFmpeg in the runtime stage.

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

Local libraries use native file events by default. For remote or mounted local libraries where native file events are unreliable, enable conservative watcher polling. The values below are example tuning for a slow network mount (defaults are lower when omitted):

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

## Advanced Playback

Signed `remoteToken` URLs for Cast, AirPlay, and native clients expire after a configurable TTL. The default is 8 hours.

```sh
LUNARR_SIGNED_PLAYBACK_TOKEN_TTL_SECONDS=28800
```

Limits:

```text
LUNARR_SIGNED_PLAYBACK_TOKEN_TTL_SECONDS: 300-604800
```

Re-request playback before the token expires on sessions longer than the configured TTL.

## Advanced Device Pairing

API keys created when a user approves TV or mobile pairing expire after a configurable number of days. The default is 730 days (2 years). Use `0` for keys that do not expire until revoked.

```sh
LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS=730
```

Limits:

```text
LUNARR_DEVICE_PAIRING_API_KEY_EXPIRES_IN_DAYS: 0-3650
```

`0` omits an expiration on paired keys. Users can revoke paired keys earlier from Profile.

## Continue Watching

In-progress movies and episodes can be hidden from Continue rails when their watch progress has not been updated recently. Progress is kept in the database and resume still works on movie and episode detail pages, browse lists, and season views.

Continue rails also ignore very short accidental starts: items need at least 60 seconds of watch progress before they appear in `continueWatching`. For `nextUp`, only progress at or above 60 seconds counts as "in progress" (so a 5-second accidental open does not skip the episode from next up).

Each signed-in user can set a staleness window on **Profile** (0–3650 days). `0` disables staleness filtering. When set, staleness is based on each row's `watch_progress.updated_at` timestamp (last playback save or watched-state change).

| Rail                                     | Staleness rule                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `continueWatching` (movies and episodes) | Hide the title when its own in-progress row is older than the window (and below 60 seconds is already ignored). |
| `nextUp`                                 | Hide the whole show when **no** episode on that show has progress updated within the window.                    |

Affected surfaces: the Continue page, home-screen `continueWatching` / `nextUp` rails, and `GET /api/continue`. Browse `all` rails and detail pages are not filtered.

API: `GET /api/me` returns `continueMaxAgeDays`. Update preferences with `PUT /api/profile` and a partial body such as `{ "continueMaxAgeDays": 90 }`.

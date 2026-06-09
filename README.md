# Lunarr

Lunarr is a self-hosted web media server for local and SFTP movie and TV libraries. It scans folders, matches media with TMDb metadata when credentials are configured, and plays files in the browser with direct streaming, remuxed HLS, or request-driven HLS transcoding depending on the file and user playback preference.

![Draft Screenshot](https://github.com/lunarr-app/lunarr-go/assets/14138401/15339179-2388-40ee-8270-61c085faa134)

## Local Development

Install dependencies:

```sh
bun install
```

Create an environment file:

```sh
cp .env.example .env
```

Set `AUTH_SECRET` to a long random value. Lunarr includes a bundled public TMDb fallback token; save your own TMDb access token or API key from the Settings page if you want to use your own credentials:

```sh
AUTH_SECRET=replace-with-a-random-secret-at-least-32-chars
ORIGIN=http://127.0.0.1:5173
LUNARR_DATA_DIR=.lunarr
```

Run the app:

```sh
bun run dev
```

Open `http://127.0.0.1:5173/`, create the first admin account, add a movie or TV library folder, then run a scan from Libraries. Use **Test TMDb** in Settings before scanning to confirm the active credential can return metadata and poster paths.

Common TV layouts supported by the scanner:

```text
Show Name/Season 01/Show Name - S01E02 - Episode Title.mkv
Show.Name.S01E02.mkv
Show Name/Show Name 1x02.mkv
Show Name/Season 1/02 - Episode Title.mkv
Show Name/Specials/S00E01.mkv
```

TV support stores shows, seasons, and episodes separately. TMDb matching is show/season based, and episodes fall back to filename metadata when TMDb is unavailable or a specific episode is missing from the season response. Anime absolute numbering, alternate episode orders, automatic renaming, and subtitle download are not implemented.

## Playback

Lunarr prefers direct browser playback when the media file is already browser-compatible, such as MP4 with H.264 video and AAC audio. Direct playback is served through authenticated, range-capable media routes so browser seeking works without exposing raw filesystem paths.

When direct playback is not suitable, Lunarr can serve request-driven HLS. Compatible codecs in an incompatible container can be remuxed into HLS segments without re-encoding. Unsupported codecs use NodeAV-backed HLS transcoding. HLS segments are generated around the segment requested by the browser, and far seeks cancel stale segment work before generating near the new target.

For SFTP libraries, direct playback and HLS generation both read from the remote server through the app. SFTP playback quality depends on server/network range-read performance, known file sizes, and stable remote connectivity.

## API And Mobile Clients

Lunarr exposes authenticated JSON APIs for catalog browsing, playback data, progress, library administration, jobs, settings, and API-key management. Browser sessions use Better Auth cookies, and personal API keys are backed by the Better Auth API Key plugin. Mobile or custom clients can create keys and send them with the plugin's default header:

```http
X-API-Key: lunarr_...
```

API keys are scoped to the owning user, so normal users only see libraries shared with them while admins retain full access. Raw API keys are shown once at creation, then only a hash and display prefix are stored. See [docs/api.md](docs/api.md) for endpoint groups and request examples.

Seed a local Radarr-shaped movie fixture without copying real media bytes:

```sh
bun run seed:radarr
```

By default this creates small mock files in `.lunarr/fixtures/radarr/movies`. Add `-- --sparse` if you need files that report the original remote sizes, or `-- --target /path/to/movies` to write somewhere else.

For browser playback testing, seed the same folders with public MP4 sample videos:

```sh
bun run seed:radarr -- --clean --playback
```

The downloaded Big Buck Bunny H.264 samples are cached next to the fixture at `.lunarr/fixtures/radarr/.sample-video-cache`, then hardlinked or copied into the Radarr filenames.

## Self-Hosted Production

Build the server:

```sh
bun run build
```

Set the production environment and start the Node server:

```sh
AUTH_SECRET=replace-with-a-random-secret-at-least-32-chars
ORIGIN=http://127.0.0.1:3000
HOST=127.0.0.1
PORT=3000
LUNARR_DATA_DIR=/var/lib/lunarr
bun run start
```

`AUTH_SECRET` must stay stable between restarts. `LUNARR_DATA_DIR` stores the SQLite database and should point at persistent storage with read/write access for the server process. Database migrations run automatically on startup. Open the configured `ORIGIN`, create the first admin account, then use **Test TMDb** before scanning if you want to confirm posters and metadata.

Admins can share each library with all users or only selected regular users from the Libraries page. Admins always retain access to every library and additionally manage libraries, scans, users, jobs, and settings.

### Docker

Build a local image:

```sh
docker build -t lunarr:local .
```

Run with persistent app data:

```sh
docker run --rm \
  --name lunarr \
  -p 3000:3000 \
  -e AUTH_SECRET=replace-with-a-random-secret-at-least-32-chars \
  -e ORIGIN=http://127.0.0.1:3000 \
  -v lunarr-data:/data \
  lunarr:local
```

When using a published image, replace `lunarr:local` with the published tag. For local filesystem libraries, mount media into the container and add the container path in Libraries:

```sh
docker run --rm \
  --name lunarr \
  -p 3000:3000 \
  -e AUTH_SECRET=replace-with-a-random-secret-at-least-32-chars \
  -e ORIGIN=http://127.0.0.1:3000 \
  -v lunarr-data:/data \
  -v /mnt/media:/media:ro \
  lunarr:local
```

For remote or mounted libraries where native file events are unreliable, enable conservative watcher polling:

```sh
LUNARR_WATCH_USE_POLLING=true
LUNARR_WATCH_INTERVAL_MS=5000
LUNARR_WATCH_BINARY_INTERVAL_MS=10000
LUNARR_WATCH_DEBOUNCE_MS=10000
LUNARR_WATCH_WRITE_STABILITY_MS=15000
```

Polling is best-effort and can still miss remote-side cache changes, so manual scans remain the source of truth.

For SFTP libraries, scans list remote directories concurrently while still processing media files one at a time. Each remote stat/list/read operation also has a timeout so an unresponsive server does not stall work forever. Configure SFTP walk concurrency and operation timeout per library from the Libraries page. Increase concurrency only if the server and network handle extra concurrent directory listings well.

## Verification

```sh
bun run check
bun run build
bun test
bun run smoke:transcode
```

To prove live TMDb connectivity and poster metadata once credentials are configured:

```sh
bun run verify:tmdb
```

## Notes

- The first registered user becomes admin.
- Later signup is disabled by default unless an admin enables it in Settings.
- Personal API keys can be used by mobile and custom clients; they follow the same user role and library-sharing rules as browser sessions.
- Library access can be shared with all users or selected regular users; per-title permissions are not implemented.
- Library paths and scan errors are admin-only.
- Configured local movie and TV library folders are watched for media/subtitle changes and trigger debounced background scans; manual scans remain available and are authoritative for network mounts.
- Media files are streamed through authenticated range-capable routes; raw filesystem paths are resolved only on the server.
- Hardware acceleration for NodeAV HLS transcoding is best-effort unless the admin marks hardware as required; required hardware fails playback when NodeAV cannot create the selected device or H.264 encoder.

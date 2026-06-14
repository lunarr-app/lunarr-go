# Lunarr

Lunarr is a self-hosted web media server for local and SFTP movie and TV libraries. It scans folders, matches media with TMDb metadata, and plays files in the browser with direct streaming or temporary HLS transcoding.

![Lunarr preview](static/images/lunarr-preview.gif)

## Quick Start With Docker

Run Lunarr with persistent app data. The `/mnt/media:/media:ro` mount is optional for local media libraries; replace `/mnt/media` with your host media path or remove that line if you only use SFTP.
The published Docker image includes system FFmpeg for HLS playback and verifies the baseline FFmpeg requirements during image build.

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

Open `http://127.0.0.1:3000`, create the first admin account, add a movie or TV library, then run a scan from Libraries. For mounted local media, add the container path, such as `/media`.

Docker Compose users can start from [docker-compose.yml](docker-compose.yml).

## Local Development

Install dependencies and create a local environment file:

```sh
bun install
cp .env.example .env
```

Set `AUTH_SECRET` in `.env` to a stable random value with at least 32 characters, then start the dev server:

```sh
bun run dev
```

Open `http://127.0.0.1:5173`, create the first admin account, add a library, and scan it.

## First Scan

Lunarr supports local and SFTP libraries. Local libraries can watch file changes, and both local and SFTP libraries can use scheduled rescans. Manual scans are always available from Libraries.

Common TV layouts:

```text
Show Name/Season 01/Show Name - S01E02 - Episode Title.mkv
Show.Name.S01E02.mkv
Show Name/Show Name 1x02.mkv
Show Name/Season 1/02 - Episode Title.mkv
Show Name/Specials/S00E01.mkv
```

Supported video extensions are `.mp4`, `.mkv`, `.mov`, `.avi`, and `.webm`. Sidecar `.vtt` subtitles are detected during scans.

## Documentation

- [Getting Started](docs/getting-started.md): first-run setup, TMDb, adding libraries, and scanning.
- [Configuration](docs/configuration.md): environment variables, Docker, data storage, and production start.
- [Libraries](docs/libraries.md): local and SFTP behavior, watchers, scheduled rescans, and remote tuning.
- [Playback And Maintenance](docs/playback.md): direct play, HLS, transcode cache, cleanup, and job history retention.
- [API](docs/api.md): authenticated JSON APIs and API-key usage.
- [Transcoding Runtime](docs/transcoding-runtime.md): FFmpeg playback and NodeAV probing implementation notes.
- [Contributing](CONTRIBUTING.md): local setup, checks, coding guidelines, and PR expectations.

## Verification

```sh
bun run check
bun run build
bun run test
bun run verify:ffmpeg
bun run verify:nodeav
bun run smoke:transcode
```

To verify live TMDb connectivity and poster metadata once credentials are configured:

```sh
bun run verify:tmdb
```

## Notes

- The first registered user becomes admin.
- Later signup is disabled by default unless an admin enables it in Settings.
- `AUTH_SECRET` must stay stable between restarts.
- `LUNARR_DATA_DIR` stores the SQLite database and temporary playback artifacts; keep it on persistent storage.
- Admins can share each library with all users or only selected regular users.
- Raw library paths, scan errors, jobs, users, and settings are admin-only.

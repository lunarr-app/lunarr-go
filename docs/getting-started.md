# Getting Started

This guide covers the first run after Lunarr starts.

## Create The First Admin

Open the configured `ORIGIN` in a browser. On a new install, Lunarr redirects to setup. The first registered user becomes the admin.

Later signup is disabled by default. An admin can enable it from Settings.

## Configure TMDb

Lunarr includes a bundled public TMDb fallback token so metadata can work without immediate setup. To use your own credentials, open Settings and save either a TMDb access token or API key.

Use **Test TMDb** in Settings before a large scan if you want to confirm the active credential can return metadata and poster paths.

## Add A Library

Open Libraries and add a local, SFTP, or WebDAV source.

For local libraries, enter the server-visible path. In Docker, this must be the mounted container path, such as `/media/movies`, not the host-only path.

For SFTP libraries, enter host, port, username, password, and remote root. Lunarr tests the remote root before saving.

For WebDAV libraries, enter host, port, username, password, remote root, and whether to use HTTPS. Lunarr tests the remote root before saving. For Nextcloud and similar servers, you can include the WebDAV path prefix in the host field, such as `cloud.example.com/remote.php/dav/files/username`.

Supported library kinds:

```text
movie
tv
```

Supported video extensions:

```text
.mp4 .mkv .mov .avi .webm
```

Supported sidecar subtitle extension:

```text
.vtt
```

## Run The First Scan

After adding a library, click **Scan** from Libraries. Scans read/probe existing files and create or update media records. Removed files are detected during scans and cleaned from the library view when no remaining file points at the media item.

Local file watching is enabled per local library by default. It watches future media and subtitle changes and triggers debounced background scans. SFTP and WebDAV libraries cannot be watched live, so use manual scans or scheduled rescans for remote changes.

Scheduled rescans are optional per library. Supported intervals are 5 minutes through 30 days.

## TV Layouts

Common TV layouts supported by the scanner:

```text
Show Name/Season 01/Show Name - S01E02 - Episode Title.mkv
Show.Name.S01E02.mkv
Show Name/Show Name 1x02.mkv
Show Name/Season 1/02 - Episode Title.mkv
Show Name/Specials/S00E01.mkv
```

TV support stores shows, seasons, and episodes separately. TMDb matching is show/season based, and episodes fall back to filename metadata when TMDb is unavailable or a specific episode is missing from the season response.

Not implemented yet:

```text
anime absolute numbering
alternate episode orders
automatic renaming
subtitle download
```

## Test Fixtures

Seed a local Radarr-shaped movie fixture without copying real media bytes:

```sh
bun run seed:radarr
```

By default this creates small mock files in `.lunarr/fixtures/radarr/movies`. Add `-- --sparse` if you need files that report the original remote sizes, or `-- --target /path/to/movies` to write somewhere else.

For playback testing, seed the same folders with public MP4 sample videos:

```sh
bun run seed:radarr -- --clean --playback
```

The downloaded Big Buck Bunny H.264 samples are cached next to the fixture at `.lunarr/fixtures/radarr/.sample-video-cache`, then hardlinked or copied into the Radarr filenames.

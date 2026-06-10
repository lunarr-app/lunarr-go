# Libraries

Lunarr supports local and SFTP movie and TV libraries.

## Local Libraries

Local libraries point at a path visible to the server process. In Docker, use the mounted container path, such as `/media/movies`.

Local library watching is enabled per library by default. Watch events trigger debounced background scans for media and sidecar subtitle changes.

Scheduled rescans are disabled by default. Enable them per library when you want periodic full rescans in addition to live watching.

## SFTP Libraries

SFTP libraries point at a remote root. Lunarr stores the connection details and uses them for scans and playback.

SFTP libraries are not watched live. Use manual scans or scheduled rescans to discover remote file changes.

SFTP scans list remote directories concurrently while processing media files one at a time. Each remote stat/list/read operation has a timeout so an unresponsive server does not stall work forever.

Default SFTP tuning:

```text
walk concurrency: 4
operation timeout: 30000 ms
```

Allowed SFTP tuning:

```text
walk concurrency: 1-32
operation timeout: 5000-300000 ms
```

Increase concurrency only if the server and network handle extra concurrent directory listings well.

## Scans

Scans read/probe existing files and compare them with the current database records. They add new files, update changed files, discover sidecar subtitles, and remove missing files from the library's active media view.

If a scan is already queued or running for a library, another scan for that same library is not queued as a duplicate.

The latest library scan row is preserved during job-history cleanup so the Libraries page can continue showing scan status for old libraries.

## Scheduled Rescans

Scheduled rescans are configured per library. Supported intervals are 5 minutes through 30 days.

When a library is added or changed, the server syncs watchers and scheduled scan timers immediately; a restart is not required for the new settings to take effect.

Long intervals such as 30 days are handled by chaining safe timer windows and rechecking whether the library is due before starting a scan.

## Watchers

Watchers only apply to local libraries with watching enabled. SFTP libraries show watching as unavailable because remote file events are not available through the current SFTP adapter.

Watcher changes are debounced and use write-stability checks before scanning. This avoids scanning while a large file is still being copied.

If native file events are unreliable on a mounted path, enable polling with the `LUNARR_WATCH_*` settings described in [Configuration](configuration.md).

## Library Access

Admins can share a library with all users or only selected regular users. Admins always retain access to every library and additionally manage libraries, scans, users, jobs, and settings.

Library paths and scan errors are admin-only.

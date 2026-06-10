# Playback And Maintenance

Lunarr plays media through authenticated routes. Raw filesystem paths and SFTP locations are resolved only on the server.

## Playback Modes

Lunarr prefers direct browser playback when the media file is already browser-compatible, such as MP4 with H.264 video and AAC audio. Direct playback is served through authenticated, range-capable media routes so browser seeking works without exposing raw paths.

When direct playback is not suitable, Lunarr can serve request-driven HLS. Compatible codecs in an incompatible container can be remuxed into HLS segments without re-encoding. Unsupported codecs use NodeAV-backed HLS transcoding.

For SFTP libraries, direct playback and HLS generation both read from the remote server through Lunarr. SFTP playback quality depends on server/network range-read performance, known file sizes, and stable remote connectivity.

## Transcode Cache

Temporary HLS playback artifacts are stored under:

```text
LUNARR_DATA_DIR/playback-sessions
```

The default temporary playback artifact storage limit is 20 GiB. Admins can choose one of these limits in Settings:

```text
5 GiB
10 GiB
20 GiB
50 GiB
100 GiB
```

Completed playback artifacts are temporary and are not treated as durable optimized media. Active playback keeps needed artifacts alive while the player is consuming them.

## Playback Cleanup

The maintenance loop runs every 15 seconds for active playback/session cleanup. Heavier artifact cleanup runs every 20 ticks, which is every 5 minutes.

On startup, Lunarr also recovers interrupted transcode sessions and cleans configured playback artifacts before resuming interrupted scan jobs.

Playback artifact cleanup removes expired completed/failed/cancelled session artifacts, orphaned artifact directories, and the oldest inactive artifacts when temporary storage exceeds the configured limit.

## Job History Cleanup

Job history cleanup runs:

```text
on server startup
every 5 minutes while the server is running
```

Cleanup applies to:

```text
scan_job
playback_session
```

Related rows are removed by database cascades:

```text
scan_job_error
playback_hls_artifact
```

Retention rules:

```text
queued and running jobs are always kept
the latest library_scan row for each library is always kept
inactive rows newer than 30 days are kept
the newest 500 inactive rows are kept
older inactive rows outside those protected groups are deleted
```

This means the history is not a strict maximum of 500 rows. If more than 500 inactive rows are newer than 30 days, they are kept until they age out.

## API Keys And Clients

Browser sessions use Better Auth cookies. Mobile and custom clients can use personal API keys:

```http
X-API-Key: lunarr_...
```

API keys follow the same role and library-sharing rules as browser sessions. See [API](api.md) for endpoint details.

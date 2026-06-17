# Lunarr API

Lunarr uses the same authorization model for the web app and JSON API. A request is authenticated by either a Better Auth browser session cookie or a personal API key backed by the Better Auth API Key plugin.

Machine-readable API docs are available from a running Lunarr server:

```http
GET /api/openapi.json
GET /api/openapi.yaml
```

Use `openapi.json` as the source for generated API clients instead of hand-maintaining request and response types.

Clients using API keys should send them with Better Auth's default API-key header:

```http
X-API-Key: lunarr_...
```

API keys are scoped to the user that created them. Admin keys can manage the server. Regular-user keys can browse and play only libraries shared with that user.

## API Keys

Create and manage keys for the signed-in user:

```http
GET /api/api-keys
POST /api/api-keys
DELETE /api/api-keys/:id
```

Create body:

```json
{
  "name": "iPhone",
  "expiresIn": 2592000
}
```

`expiresIn` is optional and is measured in seconds. The raw `token` is returned only once from `POST /api/api-keys`.

## User

```http
GET /api/me
PUT /api/profile/playback-preference
```

Playback preference body:

```json
{
  "playbackPreference": "auto",
  "preferredAudioLanguage": "eng",
  "preferredSubtitleLanguage": "eng"
}
```

Supported preferences and language values are normalized by the server.

Transcoding settings accept the combined temporary playback storage limit, encode-ahead window, and shared cache TTL:

```json
{
  "transcodingEnabled": true,
  "hardwareAcceleration": "off",
  "hardwareAccelerationRequired": false,
  "transcodeQualityPreset": "auto",
  "playbackSessionArtifactMaxBytes": 21474836480,
  "encodeAheadSegmentCount": 4,
  "playbackCacheTtlHours": 24
}
```

`playbackSessionArtifactMaxBytes` applies to both per-session virtual playlists under `playback-sessions/` and shared encoded segments under `playback-cache/`. Allowed limits are returned by `GET /api/settings` as `playbackSessionArtifactMaxBytesOptions`.

`encodeAheadSegmentCount` bounds how many HLS segments FFmpeg encodes beyond the requested segment during request-driven playback. `playbackCacheTtlHours` controls how long idle, unreferenced shared cache entries remain before TTL eviction.

`GET /api/settings` also returns `status.playbackCacheEntries`, `status.playbackCacheBytes`, `status.playbackCacheActiveRefs`, and `status.playbackCacheIdleEntries` for the shared HLS segment cache.

## Catalog

```http
GET /api/continue
GET /api/movies
GET /api/movies/:id
GET /api/shows
GET /api/shows/:id
GET /api/episodes/:id
GET /api/people/:provider/:id
```

Movie query parameters:

```text
search
status=all|watched|unwatched
sort=title|recent|year_desc|rating|release_date
page
```

Show query parameters:

```text
search
sort=title|recent|latest|popular
page
```

## Playback

```http
GET /api/playback/:mediaItemId
POST /api/playback/:mediaItemId
POST /api/playback-sessions/:sessionId/heartbeat
POST /api/playback-sessions/:sessionId/cancel
GET /media/files/:mediaFileId/stream
HEAD /media/files/:mediaFileId/stream
GET /media/subtitles/:subtitleId
HEAD /media/subtitles/:subtitleId
GET /media/playback-sessions/:sessionId/master.m3u8
HEAD /media/playback-sessions/:sessionId/master.m3u8
GET /media/playback-sessions/:sessionId/segments/:segment
HEAD /media/playback-sessions/:sessionId/segments/:segment
```

`GET /api/playback/:mediaItemId` prepares playback for a movie or episode. The response includes item metadata, the selected file, subtitle tracks, the resolved playback mode (`direct`, `remux`, `transcode`, or `unavailable`), and a ready `streamUrl` when playback can start.

Progress body for `POST /api/playback/:mediaItemId`:

```json
{
  "mediaFileId": "file-id",
  "positionSeconds": 45,
  "durationSeconds": 100,
  "completed": false
}
```

Authenticate playback API calls with a browser session cookie or `X-API-Key`. Stream, subtitle, and HLS media routes also accept API keys directly, or a signed `remoteToken` query parameter for cookieless receivers and native players.

### Playback targets

The `target` query parameter selects the client capability profile. See [Playback Targets](playback.md#playback-targets) for behavior details and troubleshooting.

| Target  | Query value          | Typical client                         |
| ------- | -------------------- | -------------------------------------- |
| Web     | omit or `target=web` | Lunarr web player                      |
| Cast    | `target=cast`        | Chromecast receiver                    |
| AirPlay | `target=airplay`     | AirPlay receiver                       |
| Native  | `target=native`      | VLC, mobile apps, other native players |

- **Web** — uses browser codec hints and user playback preferences.
- **Cast / AirPlay** — tuned for remote receivers; returns signed `streamUrl` and subtitle URLs with an 8-hour `remoteToken`.
- **Native** — always returns a signed direct file stream unless `transcode=1` is set. Ignores `prefer_transcode`.

### Query parameters

```text
file=<mediaFileId>
start=<seconds>
transcode=1
target=web|cast|airplay|native
hevc=1
av1=1
webm=1
vp9=1
vp8=1
opus=1
vorbis=1
hlsFmp4=1
hlsNative=1
```

- `file` — choose a specific media file when an item has more than one.
- `start` — resume from an explicit position in seconds.
- `transcode=1` — force temporary HLS even when direct play is available.
- `target` — select the playback target profile (see table above).
- `hevc`, `av1`, `webm`, `vp9`, `vp8`, `opus`, `vorbis`, `hlsFmp4`, `hlsNative` — optional client capability hints for `web`, `cast`, and `airplay`. The Lunarr web player sets these automatically from `video.canPlayType()`. Omit them for `target=native`.

Signed responses include absolute URLs. Re-request playback before `remoteToken` expires after eight hours on long sessions.

## Watched State

```http
POST /api/movies/:id/watched
POST /api/episodes/:id/watched
POST /api/shows/:id/seasons/:seasonId/watched
```

Body:

```json
{
  "mediaFileId": "file-id",
  "completed": true
}
```

Season watched requests only need `completed`, the server marks the accessible playable episodes in that season.

## Admin

Admin endpoints require an admin user or an API key created by an admin.

```http
GET /api/jobs
GET /api/jobs/:id/errors
POST /api/jobs/:id/cancel
POST /api/playback-sessions/:sessionId/admin-cancel
GET /api/libraries
POST /api/libraries
GET /api/libraries/:id
PATCH /api/libraries/:id
DELETE /api/libraries/:id
POST /api/libraries/:id/scan
PUT /api/libraries/:id/access
GET /api/settings
PUT /api/settings/registration
PUT /api/settings/metadata
PUT /api/settings/transcoding
POST /api/settings/actions
GET /api/users
POST /api/users
PATCH /api/users/:userId
DELETE /api/users/:userId
POST /api/movies/:id/metadata/refresh
POST /api/shows/:id/metadata/refresh
```

`GET /api/users` returns registered accounts with roles and timestamps. Admins can create accounts with `POST /api/users`, promote or demote users with `PATCH /api/users/:userId`, and remove accounts with `DELETE /api/users/:userId`. Lunarr keeps at least one admin and blocks self-deletion.

Create user body:

```json
{
  "name": "Viewer",
  "email": "viewer@example.com",
  "password": "secure-password",
  "role": "user"
}
```

Update role body:

```json
{
  "role": "admin"
}
```

`GET /api/jobs` returns recent scan jobs, playback sessions, and summary counts. Each scan job row includes `errors_count`, but error rows are not embedded in that response.

Load scan error details on demand:

```http
GET /api/jobs/:id/errors
```

Response:

```json
{
  "errors": [
    {
      "id": 1,
      "scan_job_id": "job-id",
      "path": "/media/movies/Broken.Movie.2024.mkv",
      "message": "Could not read file.",
      "created_at": "2026-01-05T00:00:00.000Z",
      "job_status": "completed",
      "job_kind": "library_scan",
      "library_id": "library-id",
      "library_name": "Movies"
    }
  ],
  "limit": 100
}
```

The server returns at most the newest 100 errors for that job. Use `errors_count` on the job row when you need the full total from the scan run.

Library create/update bodies use the same shape as the web form. Local libraries use `path`, SFTP and WebDAV libraries use remote connection fields:

```json
{
  "source": "local",
  "kind": "movie",
  "name": "Movies",
  "path": "/media/movies",
  "watchEnabled": true,
  "scanIntervalMinutes": null
}
```

```json
{
  "source": "sftp",
  "kind": "movie",
  "name": "Remote Movies",
  "host": "sftp.example.com",
  "port": 22,
  "username": "mediauser",
  "password": "secret",
  "root": "/media/movies",
  "walkConcurrency": 4,
  "operationTimeoutMs": 30000,
  "scanIntervalMinutes": 360
}
```

```json
{
  "source": "webdav",
  "kind": "movie",
  "name": "Remote Movies",
  "host": "nas.example.com",
  "port": 443,
  "secure": true,
  "username": "mediauser",
  "password": "secret",
  "root": "/media/movies",
  "walkConcurrency": 4,
  "operationTimeoutMs": 30000,
  "scanIntervalMinutes": 360
}
```

`watchEnabled` only applies to local libraries and defaults to `true`. `scanIntervalMinutes` is optional for local and remote libraries, use `null` or `0` to disable scheduled rescans. Allowed intervals are 5 minutes through 30 days.

Settings action body:

```json
{
  "action": "scanAll"
}
```

Supported actions:

```text
scanAll
refreshMovieMetadata
refreshTvMetadata
repairMediaProbes
testTmdb
cleanupPlaybackArtifacts
```

`cleanupPlaybackArtifacts` force-clears all idle HLS cache entries immediately, ignoring TTL and storage limits, and runs the routine session-artifact cleanup path. It returns **200** with counts and a human-readable `message`. Active playback refs are preserved.

Example response:

```json
{
  "cacheRemoved": 2,
  "sessionsRemoved": 1,
  "sessionArtifactsRemoved": 3,
  "message": "Removed 2 idle HLS cache entries and 3 session artifact directories."
}
```

Job-starting actions (`scanAll`, metadata refresh, probe repair) return **202**.

## Responses

Most API errors return a JSON body:

```json
{
  "error": "Message"
}
```

Common status codes:

```text
401 unauthenticated
403 authenticated but not allowed
404 accessible resource not found
400 validation or action failure
```

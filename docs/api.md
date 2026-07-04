# Lunarr API

Lunarr uses the same authorization model for the web app and JSON API. A request is authenticated by either a Better Auth browser session cookie or a personal API key backed by the Better Auth API Key plugin.

The machine-readable contract lives at `GET /api/openapi.json` and `GET /api/openapi.yaml`. TypeScript response shapes for the public API are centralized in `src/lib/server/api/types.ts`; route handlers use `apiJson()` from `src/lib/server/api/json.ts` so JSON responses stay aligned with that contract. A test in `src/lib/server/api/contract.test.ts` verifies that every strongly typed schema name in that module is declared in OpenAPI.

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

## Health

Public readiness probe for load balancers, Docker health checks, and monitoring:

```http
GET /api/health
```

Response:

```json
{
  "ok": true,
  "setupComplete": true,
  "version": "<app version>"
}
```

`version` comes from `LUNARR_APP_VERSION` at runtime, or `package.json` when that env var is unset. `setupComplete` is `false` until the first admin account is created at `/setup`.

Returns HTTP `200` when the database is reachable and HTTP `503` when it is not. No authentication is required. The endpoint is available before first-run setup completes.

## Device pairing

TV and mobile apps can sign in without copying a long API key.

1. The device calls `POST /api/device-pairing` and shows the returned `userCode` (or encodes the returned `pairingUrl` in a QR code).
2. A signed-in user approves that code on **Link a device** (`/link-device`) or `GET /link-device?code=<userCode>&name=<deviceName>` (`name` is optional).
3. The device polls `GET /api/device-pairing/poll?deviceCode=<deviceCode>` until it receives an API key.

```http
POST /api/device-pairing
GET /api/device-pairing/poll?deviceCode=...
POST /api/device-pairing/approve
```

Start body (optional):

```json
{
  "deviceName": "Living room TV"
}
```

Approve body:

```json
{
  "userCode": "ABCD-1234",
  "deviceName": "Living room TV"
}
```

Poll returns `status: "pending"` until approval, then `status: "approved"` with a one-time `apiKey` string. `POST /api/device-pairing` also returns `pairingUrl`, a ready-made `/link-device?code=...&name=...` URL for QR codes (`name` is omitted when the device did not provide one). Pairing codes expire after 10 minutes. API keys created through pairing expire after 2 years (users can revoke them earlier from Profile). Finished or expired pairing rows are deleted after 30 days.

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
GET /api/movies/discover
GET /api/movies/:id
GET /api/movies/:id/overview
GET /api/movies/:id/credits
GET /api/movies/:id/similar
GET /api/shows
GET /api/shows/discover
GET /api/shows/:id
GET /api/shows/:id/overview
GET /api/shows/:id/credits
GET /api/shows/:id/seasons/:seasonId
GET /api/shows/:id/similar
GET /api/episodes/:id
GET /api/people/:provider/:id
```

Person query parameters:

```text
moviesPage
showsPage
```

`GET /api/people/:provider/:id` returns person metadata, aggregate filmography `stats`, paginated `movies` and `shows` credit lists, and separate `moviePage` / `showPage` metadata. Hero counts and year span use `stats` so clients do not need to load every credit up front.

### Browse rails

`GET /api/movies` and `GET /api/shows` return multiple home-screen rails in one response by default (`continueWatching`, `nextUp` on shows, `all` / `allPage`, `recent`, `latest`, `popular`). That matches the Lunarr web browse pages and keeps home screens to one round trip.

To fetch a single rail without downloading every other section, pass `rail`:

```text
GET /api/movies?rail=continueWatching
GET /api/movies?rail=all&page=2&sort=title&status=all
GET /api/movies?rail=continueWatching,recent
GET /api/shows?rail=nextUp
GET /api/shows?rail=popular
GET /api/shows?rail=continueWatching,nextUp
```

Valid movie rails: `continueWatching`, `all`, `recent`, `latest`, `popular`.

Valid show rails: `continueWatching`, `nextUp`, `all`, `recent`, `latest`, `popular`.

When `rail` is set, the response includes only the requested keys (for example `{ "recent": [...] }`, `{ "all": [...], "allPage": {...} }`, or `{ "continueWatching": [...], "recent": [...] }` when multiple rails are comma-separated). Omit `rail` for the full bundled payload. Invalid `rail` values return `400`.

### Continue watching

`GET /api/continue` returns in-progress movies (`movies`), in-progress TV episodes (`episodes`), and per-show next unwatched episodes (`nextUp`). The web Continue page surfaces all three sections.

### TV show detail tiers

Lunarr exposes three show-detail levels. Mobile and third-party clients should prefer the smaller endpoints and load episodes lazily per season.

| Endpoint                               | Returns                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /api/shows/:id/overview`          | Show metadata and season stubs with counts (`episodeCount`, `playableCount`, `watchedCount`). No episode arrays. |
| `GET /api/shows/:id/credits`           | Cast rail and show creators (`cast`, `creators`). Load separately when the UI needs people credits.              |
| `GET /api/shows/:id/seasons/:seasonId` | Compact show header, one season with episodes and watch progress, plus a lightweight season tab list.            |
| `GET /api/shows/:id`                   | Full tree with every season and episode. Use for bulk export or legacy clients.                                  |

Recommended mobile flow:

1. Browse with `GET /api/shows` (`continueWatching` and `nextUp` are episode summaries).
2. Open a show with `GET /api/shows/:id/overview`.
3. Optionally load `GET /api/shows/:id/credits` when rendering the cast section.
4. Open a season with `GET /api/shows/:id/seasons/:seasonId`.
5. Prepare playback with `GET /api/playback/:episodeId` (optionally prefetch files via `GET /api/episodes/:id`).
6. Mark watched with `POST /api/episodes/:id/watched` or `POST /api/shows/:id/seasons/:seasonId/watched`.

`seasonId` accepts the season UUID or the season number (for example `1`), matching the web app season URLs.

### Movie detail tiers

Lunarr exposes three movie-detail levels. Mobile and third-party clients should prefer the smaller endpoints and lazy-load cast when needed.

| Endpoint                       | Returns                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/movies/:id/overview` | Movie metadata, genres, keywords, production companies, directors, writers, `files`, and `progress`. **No `cast`.**      |
| `GET /api/movies/:id/credits`  | Cast rail plus directors and writers (`cast`, `directors`, `writers`). Load separately when the UI needs people credits. |
| `GET /api/movies/:id`          | Full detail including `cast`. Use for bulk export or legacy clients.                                                     |

Unlike TV overview, movie overview **includes `files` and `progress`** so clients can render Play/Resume and file selection without a second call.

Recommended mobile flow:

1. Browse with `GET /api/movies` (`continueWatching` is a movie summary list).
2. Open a movie with `GET /api/movies/:id/overview`.
3. Optionally load `GET /api/movies/:id/credits` when rendering the cast section.
4. Prepare playback with `GET /api/playback/:movieId` (optionally choose a file via the `file` query parameter).
5. Mark watched with `POST /api/movies/:id/watched`.

Movie query parameters:

```text
search
status=all|watched|unwatched
sort=title|recent|year_desc|rating|release_date
page
```

Similar movie and show endpoints accept `page` and return accessible titles ranked by shared genres, keywords, cast, and directors or creators. Responses include the source title plus paginated `movies` or `shows` and a `page` object with `total`, `totalPages`, `hasPrevious`, and `hasNext`.

```http
GET /api/movies/discover?page=
GET /api/shows/discover?page=
```

These endpoints return personalized recommendations ranked by shared metadata overlap (genres +3, keywords +2, cast and directors or creators +1 per seed; seeds weighted by recency). Completed movies and shows with a completed episode are excluded.

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

## Guest shares

Admins can create time-limited guest links for a movie or TV show. Guests open `/share/:token` without signing in. Guest playback does not write watch progress.

Admin management (admin session or admin-created API key):

```http
POST /api/shares
GET /api/shares?mediaItemId=
DELETE /api/shares/:id
```

Create share body:

```json
{
  "kind": "movie",
  "mediaItemId": "movie-id",
  "expiresInSeconds": 604800
}
```

`expiresInSeconds` and `expiresAt` accept durations up to about 10 years.

For shows, omit `seasonIds` to share all seasons or pass selected season ids:

```json
{
  "kind": "show",
  "mediaItemId": "show-id",
  "seasonIds": ["season-id-1", "season-id-2"],
  "expiresInSeconds": 604800
}
```

Public guest endpoints (no authentication):

```http
GET /api/share/:token
GET /api/share/:token/seasons/:seasonId
GET /api/share/:token/playback/:mediaItemId
```

### Guest share detail tiers

Show shares use a two-step load so multi-season links stay small.

| Endpoint                                  | Returns                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /api/share/:token`                   | Movie play metadata, or show metadata plus season stubs (`episodeCount`, `playableCount`). **No episode arrays.** |
| `GET /api/share/:token/seasons/:seasonId` | Playable episodes for one allowed season. `seasonId` accepts the season UUID or season number.                    |

Recommended guest flow for TV shares:

1. Open the link with `GET /api/share/:token`.
2. Load each season tab with `GET /api/share/:token/seasons/:seasonId`.
3. Prepare playback with `GET /api/share/:token/playback/:mediaItemId`.

Movie shares still include the playable file on the initial response.

Guest share endpoints are rate limited per client IP (60 resolve requests/minute, 30 playback prep requests/minute). Excess requests return `429` with `{ "error": "Too many requests. Try again later." }`.

Signed stream, HLS, and subtitle URLs include both `remoteToken` and `shareToken` for scoped guest access.

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
POST /api/shares
GET /api/shares?mediaItemId=
DELETE /api/shares/:id
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

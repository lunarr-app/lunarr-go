# Lunarr API

Lunarr uses the same authorization model for the web app and JSON API. A request is authenticated by either a Better Auth browser session cookie or a personal API key backed by the Better Auth API Key plugin.

Mobile and custom clients should send API keys with Better Auth's default API-key header:

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
  "playbackPreference": "auto"
}
```

Supported preferences are normalized by the server.

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

Progress body:

```json
{
  "mediaFileId": "file-id",
  "positionSeconds": 45,
  "durationSeconds": 100,
  "completed": false
}
```

Playback stream, subtitle, and HLS routes also accept API-key authentication.

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

Season watched requests only need `completed`; the server marks the accessible playable episodes in that season.

## Admin

Admin endpoints require an admin user or an API key created by an admin.

```http
GET /api/jobs
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
POST /api/movies/:id/metadata/refresh
```

Library create/update bodies use the same shape as the web form. Local libraries use `path`; SFTP libraries use SFTP connection fields:

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

`watchEnabled` only applies to local libraries and defaults to `true`. `scanIntervalMinutes` is optional for local and SFTP libraries; use `null` or `0` to disable scheduled rescans. Allowed intervals are 5 minutes through 30 days.

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
```

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

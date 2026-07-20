# Playback And Maintenance

Lunarr plays media through authenticated routes. Raw filesystem paths and remote library locations are resolved only on the server.

## Playback Modes

Lunarr prefers direct browser playback when the media file is already browser-compatible, such as MP4 with H.264 video and AAC audio. Direct playback is served through authenticated, range-capable media routes so browser seeking works without exposing raw paths.

The web player sends conservative client capability hints when starting playback. For example, MP4 HEVC or AV1 files and WebM VP8/VP9/AV1 files can direct play only when the browser reports support for the matching container and codecs, otherwise they fall back to temporary HLS. Capability checks understand common FFmpeg and browser codec-string aliases such as `avc1.*`, `mp4a.*`, `hvc1.*`, `av01.*`, and `vp09.*`.

When direct playback is not suitable, Lunarr serves request-driven HLS through direct FFmpeg CLI process management. HLS-compatible files can use copied remux so FFmpeg repackages the source streams without re-encoding. Lunarr waits for FFmpeg's authored event playlist before treating a requested segment as ready, so segment availability follows FFmpeg's real timing instead of only the virtual playlist grid. Unknown video codecs and unknown audio codecs are not copied through HLS remux. Unsupported codecs use FFmpeg-generated HLS transcoding. NodeAV remains useful for probe-oriented work such as metadata and stream inspection, but it is not the user-facing HLS segment generator.

Request-driven HLS defaults to MPEG-TS segments for broad compatibility. `LUNARR_HLS_SEGMENT_FORMAT=fmp4` forces the experimental fMP4/CMAF segment path for host/browser testing. `LUNARR_HLS_SEGMENT_FORMAT=auto` keeps MPEG-TS for clients that do not prove support, and selects fMP4 only when the web player reports compatible native HLS or MediaSource support. In fMP4 mode, virtual playlists include an `init.mp4` map and request `.m4s` segments while FFmpeg writes matching fMP4 HLS artifacts.

HEVC HLS remux compatibility is deliberately narrower than HEVC direct play. The compatibility checks require HEVC, native HLS, fMP4 HLS support, and an fMP4 server segment format before a copied HEVC/AAC HLS stream is considered safe. Other HEVC HLS requests fall back to transcode.

For SFTP and WebDAV libraries, browser-compatible files direct-play through authenticated range reads when automatic mode selects direct playback. HLS is used only when remux or transcode is required. Remote HLS and direct playback both read from the remote server through Lunarr. Remote playback quality depends on server/network range-read performance, known file sizes, and stable remote connectivity.

Request-driven HLS encodes only a bounded window ahead of the current playhead. FFmpeg is limited to a configurable number of segments beyond the requested segment (default 4, about 64 seconds at 16-second segments) instead of running to end-of-file. The same encode-ahead value controls both the FFmpeg window and post-segment prefetch depth.

### Encode coordinator mental model

Segment generation follows a small state machine per shared cache entry:

1. **Disk hit** — If the requested segment already exists in the shared encode directory, serve it immediately and kick off background prefetch for the next missing segments in the ahead range.
2. **Active job covers the segment** — If another FFmpeg job is already encoding a window that includes the requested segment index, wait for the file to appear (with timeout) instead of starting duplicate work.
3. **Seek outside the window** — When a session requests a segment outside its own active encode window, cancel that session's stale job and start a new FFmpeg window at the requested index.
4. **Coalesced waiters** — Concurrent requests for the same segment on the same cache share one ensure operation.
5. **Parallel windows** — Different sessions on the same shared cache may encode non-overlapping segment ranges in parallel (for example one viewer at segment 10 and another at segment 50). Within a single session, a seek outside the active encode window cancels that session's stale job before starting a new window. Distant parallel encodes for the same session are not kept alive.
6. **Idle cleanup** — When playback cache `ref_count` reaches zero or a session ends, active encode jobs for that cache are aborted.

When the viewer stops or seeks ahead, remote reads stop once the encode-ahead buffer is satisfied.

Encoded HLS segments are stored in a server-wide cache keyed by media file identity, encode mode, and transcode policy. Multiple playback sessions and users can reuse the same cached segments. Per-session virtual playlists remain under `playback-sessions/`, and shared segment payloads live under `playback-cache/`.

Admins can choose an HLS quality preset in Settings. `Auto` preserves the default output behavior. `720p` and `1080p` cap transcode height without upscaling and adjust FFmpeg bitrate/CRF targets. `Original resolution` keeps source height and uses a higher transcode target.

Users can set a preferred audio language in Profile. Temporary HLS transcoding prefers a matching audio stream when probe metadata includes language tags. Copied remux generation prefers AAC-family audio compatibility first, then applies the user's language preference when multiple compatible streams are available. If copied remux generation fails while the session is still playable, Lunarr falls back to full transcode.

Users can also set a preferred subtitle language in Profile. Lunarr still returns applicable external subtitle tracks for the selected file, but marks the matching language as the default track when available. Sidecar `.srt` subtitle files are converted to WebVTT on the fly for browser playback (`GET /media/subtitles/:subtitleId` and the HLS subtitle URLs).

## Intro and credits skip (TheIntroDB)

When playback starts, Lunarr can look up community-verified intro, recap, and credits timestamps from [TheIntroDB](https://theintrodb.org) and return them in `GET /api/playback/:mediaItemId` as a `segments` array. Playback responses also include `segmentSkip` with the signed-in user's skip preferences (`enabled`, `automatic`).

- Lookup uses the show or movie **TMDb ID** from metadata (`provider=tmdb`). TV episodes also require season and episode numbers. Titles without TMDb metadata return `segments: []`.
- IntroDB is queried during playback prepare using the **selected file duration** (`duration_ms`) so timestamps can match submissions for similar runtimes. Titles without a known file duration omit that hint. Successful responses are cached in memory for 24 hours (up to 500 entries, LRU-evicted). Failures or missing data return `segments: []` and playback continues normally.
- Segment markers are per metadata identity, not per file, so different releases may be slightly off.
- When `segmentSkip.enabled` is `false`, Lunarr skips the IntroDB lookup and returns `segments: []`.
- When enabled and `segmentSkip.automatic` is `false`, the web player shows a manual **Skip intro**, **Skip recap**, or **Skip credits** button while the playhead is inside the matching window.
- When enabled and `segmentSkip.automatic` is `true`, the web player seeks past each segment once per title and shows a brief **Skipped intro/recap/credits** notice for 3.5 seconds. Seeking back into a segment does not auto-skip again during the same playback session.

Users configure segment skip on **Profile → Skip intro & credits** or through `PUT /api/profile` with `segmentSkipEnabled` and `segmentSkipAutomatic`. Defaults are enabled with manual skip. See [API](api.md#user).

## Playback Targets

`GET /api/playback/:mediaItemId` accepts a `target` query parameter. Lunarr uses the target to choose a client capability profile before it decides between direct play and temporary HLS. The web player omits `target` (equivalent to `web`). Cast, AirPlay, and API clients set `target` explicitly when preparing playback.

| Target  | Query value          | Used by                                | Server assumes                                      | Typical outcome                                                  |
| ------- | -------------------- | -------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Web     | omit or `target=web` | Lunarr web player                      | Browser codec hints (`hevc=1`, `webm=1`, and so on) | Direct when browser-compatible, otherwise HLS remux or transcode |
| Cast    | `target=cast`        | Chromecast receiver                    | HLS-capable receiver, no WebM direct                | Direct MP4/H.264 when possible, otherwise signed HLS             |
| AirPlay | `target=airplay`     | AirPlay receiver                       | Safari/client hints, no WebM direct                 | Direct when receiver-compatible, otherwise signed HLS            |
| Native  | `target=native`      | VLC, mobile apps, other native players | Client decodes locally                              | Signed direct file stream, HLS only when `transcode=1`           |

Capability hints matter for `web`, `cast`, and `airplay`. They are optional for `target=native`. See [API](api.md#playback) for the full query contract.

### Web (`target=web`)

The Lunarr web player detects support with `video.canPlayType()` and sends positive hints on the playback API request. Without hints, Lunarr assumes a conservative browser profile: MP4 with H.264/AAC direct plays. HEVC, AV1, WebM, and non-MP4 containers fall back to temporary HLS when transcoding is enabled.

User playback preferences (`auto`, `prefer_direct`, `prefer_transcode`) apply to web playback. `?transcode=1` forces temporary HLS even when direct play is available.

### Cast (`target=cast`)

The web player switches to `target=cast` before loading media on a Chromecast receiver. Lunarr treats the receiver as HLS-capable, does not direct-play WebM, and prefers direct MP4/H.264 when that is safe for the receiver.

Non-direct Cast playback uses the same temporary HLS sessions as the browser player. Lunarr waits until the playlist is ready, then returns signed receiver URLs for the playlist, segments, and external subtitles.

Chromecast sessions are Cast-owned after media loads. Closing or navigating away from the browser page does not immediately cancel the Cast playback session. Stopping Cast from the player ends the Cast session and cancels the owned HLS session.

### AirPlay (`target=airplay`)

The web player switches to `target=airplay` before handing off to an AirPlay receiver. Lunarr keeps Safari-reported codec hints, forces HLS support flags, and disables WebM direct play.

AirPlay is closer to native Safari video playback than Cast. Progress and lifecycle depend on Safari continuing to update the video element. Closing or navigating away from the page can stop playback and cancel temporary HLS.

### Native (`target=native`)

API clients such as a Lunarr mobile app or VLC integration use `target=native` when the player decodes media locally. Native playback always returns a signed direct file stream URL and does not start temporary HLS remux or transcode, even when the file would require HLS in the web player.

User playback preferences such as `prefer_transcode` do not override `target=native`. Use `?transcode=1` when the client explicitly wants Lunarr to prepare temporary HLS instead.

### Signed stream URLs

When playback leaves the browser cookie session, `GET /api/playback/:mediaItemId` returns absolute `streamUrl` and subtitle `src` values with a `remoteToken` query parameter. Cast, AirPlay, VLC, and other receivers or native players load media with that token. They do not need Lunarr session cookies for stream, subtitle, or HLS segment requests.

Tokens default to 8 hours. Override with `LUNARR_SIGNED_PLAYBACK_TOKEN_TTL_SECONDS` (see [Configuration](configuration.md)).

Authenticate the playback API call with a session cookie or `X-API-Key`. Re-request playback before the token expires on long sessions.

Remote receivers must reach Lunarr by its configured public origin, not only from the browser that opened the player. Use HTTPS in production. Chrome and Edge rely on Google's Cast Web Sender SDK, and secure origins are required for reliable Cast discovery.

If Cast or AirPlay controls are missing, check browser support, HTTPS/origin configuration, receiver network access to Lunarr, and whether the current playback decision has a ready direct stream or HLS playlist. If a receiver opens but does not play, verify it can reach the generated Lunarr URL and that the stream container, codecs, and HLS segment format are supported by that receiver.

## Web Player Controls

The Lunarr web player uses a custom control bar over the video. Controls can be hidden during ordinary local playback so the video stays unobstructed, while still allowing quick surface and keyboard actions.

### When the control bar is visible

The bar is shown when any of these is true:

- Playback has not settled into ordinary local **playing** yet (for example starting, buffering, seeking, paused, autoplay blocked, or error).
- The viewer is **casting** to Chromecast.
- The **subtitle menu** is open.
- A control has **keyboard focus** (tabbing through buttons, slider, or subtitle options).
- The pointer is **hovering** the control bar.
- The bar was explicitly revealed and not yet auto-hidden (see below).

During normal **playing** with none of the conditions above, the bar auto-hides after **3.5 seconds** without control activity.

Activity that resets the 3.5 second timer includes:

- Moving the pointer over the player by at least **12 px** from the last reveal position (refreshed at most every **250 ms** while visible so tiny jitters do not keep resetting the timer).
- Clicking the video surface or any control.
- Using player keyboard shortcuts while focus is on the player shell.
- Focusing a control.

While hidden during playback, deliberate pointer movement over the player reveals the bar. Sub-pixel jitter and very small movements are ignored.

### Video surface clicks

Clicks on the video (not on the control bar) behave differently depending on whether the bar is currently shown and the pointer type.

| Bar state | Desktop single click               | Touch single tap     | Double click / double tap          |
| --------- | ---------------------------------- | -------------------- | ---------------------------------- |
| Hidden    | Show the control bar               | Show the control bar | **Seek / play** by horizontal zone |
| Visible   | **Seek / play** by horizontal zone | Hide the control bar | No extra action                    |

On desktop, deliberate pointer movement (at least **12 px**) over the video also reveals the bar while it is hidden.

Horizontal zones are measured across the full video width:

- **Left third** — seek back **10 seconds**
- **Center third** — toggle play / pause
- **Right third** — seek forward **30 seconds**

A brief on-screen icon confirms seek and play/pause feedback.

On desktop, hovering the seek bar shows a timestamp preview for the position under the pointer. Dragging the seek bar still updates the time readout.

If the subtitle menu is open, a single click on the video closes the menu instead of seeking or toggling playback. Double-clicks are ignored while the menu is open.

### Keyboard shortcuts

Focus the player (click the video surface or tab to the player region) to use:

| Key            | Action                                              |
| -------------- | --------------------------------------------------- |
| `Space` or `K` | Play / pause                                        |
| `←`            | Seek back 10 seconds                                |
| `→`            | Seek forward 30 seconds                             |
| `F`            | Toggle fullscreen                                   |
| `M`            | Toggle mute                                         |
| `C`            | Open or close subtitles (when tracks are available) |
| `Escape`       | Close the subtitle menu when it is open             |

Shortcuts are ignored while typing in buttons or other interactive controls outside the player shell.

## FFmpeg Verification

The Docker runtime image includes system FFmpeg and verifies the baseline FFmpeg playback requirements and NodeAV probing during image build. Operators can also run:

```sh
bun run verify:ffmpeg
bun run verify:nodeav
bun run verify:runtime
bun run smoke:transcode
bun run smoke:browser:seek
```

Inside the production Docker runtime image, Bun is not required. Run the same server-side checks with Node:

```sh
docker exec lunarr node scripts/verify-runtime.mjs
docker exec lunarr node scripts/verify-ffmpeg.mjs
docker exec lunarr node scripts/verify-nodeav-probe.mjs
docker exec lunarr node scripts/smoke-ffmpeg-transcode.mjs
```

`verify:runtime` runs the server-side FFmpeg verifier, FFmpeg software HLS smoke, and NodeAV probe verifier in one command. `verify:ffmpeg` checks that the configured FFmpeg binary exposes the HLS muxer, `libx264`, and AAC encoder. `verify:nodeav` generates a short fixture and verifies NodeAV can still load and probe video metadata. `smoke:transcode` generates a short local fixture and verifies FFmpeg can produce a non-empty HLS segment.

Playback resolves FFmpeg from `FFMPEG_PATH` first, then the system `ffmpeg` on `PATH`, then the bundled NodeAV FFmpeg path only as a fallback. This keeps Docker image verification aligned with the binary used for playback while still allowing a local fallback when system FFmpeg is not installed.

`smoke:browser:seek` launches a Chromium-compatible browser through Playwright Core and drives real `timeupdate`, `seeking`, and `seeked` DOM events against the HLS seek controller. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when Chrome, Chromium, Brave, or Edge is not installed in a standard path.

Hardware acceleration must be verified on the host where the hardware device is actually exposed to the runtime. To check configured hardware encoders and run a short hardware HLS smoke:

```sh
FFMPEG_VERIFY_HARDWARE=auto bun run verify:ffmpeg
FFMPEG_SMOKE_HARDWARE=auto bun run smoke:transcode
LUNARR_VERIFY_HARDWARE=auto bun run verify:runtime
bun run smoke:hardware
```

In the production Docker runtime image:

```sh
docker exec -e LUNARR_VERIFY_HARDWARE=auto lunarr node scripts/verify-runtime.mjs
docker exec -e FFMPEG_VERIFY_HARDWARE=auto lunarr node scripts/verify-ffmpeg.mjs
docker exec -e FFMPEG_SMOKE_HARDWARE=auto lunarr node scripts/smoke-ffmpeg-transcode.mjs
docker exec lunarr node scripts/smoke-ffmpeg-hardware.mjs
```

`LUNARR_VERIFY_HARDWARE=auto` makes `verify:runtime` run both hardware encoder verification and a real hardware HLS smoke. `smoke:hardware` defaults to `auto` and runs the same real HLS hardware smoke as `FFMPEG_SMOKE_HARDWARE=auto bun run smoke:transcode`. Use a specific mode instead of `auto` when needed: `videotoolbox`, `vaapi`, `qsv`, `nvenc`, or `amf`. For VAAPI, set `FFMPEG_VAAPI_DEVICE` when the render device is not `/dev/dri/renderD128`.
The hardware smoke checks the VAAPI device path before invoking FFmpeg, so a missing Docker device mount fails with a direct device-path error instead of only FFmpeg stderr.

## Transcode Cache

Temporary HLS playback uses two storage areas under `LUNARR_DATA_DIR`:

```text
playback-sessions/   # per-session virtual playlists and session metadata
playback-cache/      # shared encoded HLS segments (content-keyed, LRU-evicted)
```

The default combined temporary playback storage limit is 20 GiB. Admins can choose one of these limits in Settings:

```text
5 GiB
10 GiB
20 GiB
50 GiB
100 GiB
```

Admins can also configure encode-ahead segment count (default 4) and shared cache TTL (default 24 hours). Cache entries invalidate when the source file size or modification time changes.

Active playback keeps needed cache entries alive through reference counting (`ref_count` on each cache entry) while sessions are running. Each FFmpeg encode job writes segment files and its own per-job event playlist under the shared cache directory. Non-overlapping windows from different sessions can run in parallel without clobbering each other's playlist state. Completed or cancelled sessions decrement cache references, and unreferenced cache entries become eligible for TTL eviction (idle longer than the configured TTL) and LRU eviction (oldest idle entries removed first when combined playback storage exceeds the configured limit).

Admins can inspect shared cache size, entry counts, idle entries, and configured limits in **Settings → Server status**, and force-clear idle cache entries from **Settings → Transcoding → Force cleanup**. Force cleanup removes all unreferenced cache entries immediately, ignoring TTL and storage limits, and also runs the routine session-artifact cleanup path. Active playback references are preserved.

## Playback Cleanup

The maintenance loop runs every 15 seconds for active playback/session cleanup. Heavier artifact cleanup runs every 20 ticks, which is every 5 minutes.

On startup, Lunarr also recovers interrupted transcode sessions and cleans configured playback artifacts before resuming interrupted scan jobs.

Playback artifact cleanup removes expired completed/failed/cancelled session playlists, orphaned session directories, stale shared cache entries, and the oldest inactive artifacts when combined temporary storage exceeds the configured limit.

When a playback session is cancelled or replaced by a seek, Lunarr stops FFmpeg for that session and releases cache references. Session playlist directories are removed by the cleanup job rather than synchronously on cancel.

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

Browser sessions use Better Auth cookies. API clients can use personal API keys:

```http
X-API-Key: lunarr_...
```

API keys follow the same role and library-sharing rules as browser sessions. See [API](api.md) for endpoint details.

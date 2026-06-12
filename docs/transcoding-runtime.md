# Lunarr Transcoding Runtime

Lunarr uses a split media runtime:

- NodeAV handles probe-oriented work: metadata extraction, stream inspection, duration and codec discovery, and other library-analysis tasks.
- FFmpeg CLI handles user-facing non-direct playback: HLS remux, HLS transcode, segment generation, seek restarts, process lifecycle, and stderr/error reporting.

Direct play stays the preferred path when the selected file is already compatible with the browser. Files that cannot direct play use temporary FFmpeg-generated HLS.

## Runtime Requirements

- Install dependencies with Bun so the pinned `node-av` package is present for probing.
- Provide an executable FFmpeg binary. Lunarr resolves it from `FFMPEG_PATH`, system `ffmpeg` on `PATH`, or the bundled `node-av` FFmpeg path as a fallback.
- Keep temporary playback-session artifact storage on fast local disk. Generated HLS artifacts live under `playback-sessions/<sessionId>/` in the configured Lunarr data directory.
- Keep SFTP libraries seekable by preserving remote file size and duration metadata. Non-direct SFTP playback streams through Lunarr's private localhost range proxy into FFmpeg, not by exposing remote credentials to FFmpeg.

The Docker runtime image installs system FFmpeg and runs the baseline FFmpeg playback verifier plus the NodeAV probe verifier during image build.

## Playback Behavior

Direct play remains the default. Lunarr starts HLS only when the file is not browser-compatible, when the user forces transcoding, or when the user's playback preference asks for transcoding and global transcoding is enabled.

The web player sends conservative client capability hints when opening playback. MP4 HEVC/AV1 and WebM VP8/VP9/AV1 files direct play only when the browser reports support for the matching container and codec combination. Capability checks normalize common codec-string aliases such as `avc1.*`, `mp4a.*`, `hvc1.*`, `av01.*`, and `vp09.*`. Direct-play support does not automatically make those codecs safe for HLS remux.

When only the container is unsuitable for the browser, Lunarr can identify compatible HLS remux candidates such as H.264/AAC in a non-browser container. Request-driven playback can start copied remux for those candidates, waits for FFmpeg's authored event playlist before declaring a requested segment ready, and falls back to full transcode if remux generation fails while the session is still playable. Unknown video or audio codecs are treated as unsafe for copied HLS remux and use transcode instead.

Unsupported codecs use FFmpeg-generated HLS transcode. The default software target is H.264 video with AAC audio. Admin quality presets can cap transcode height and adjust software CRF or hardware bitrate targets.

Request-driven HLS defaults to MPEG-TS segments for broad compatibility. `LUNARR_HLS_SEGMENT_FORMAT=fmp4` forces experimental fMP4/CMAF output. `LUNARR_HLS_SEGMENT_FORMAT=auto` selects fMP4 only when the client proves native HLS or MediaSource fMP4 support; other clients keep MPEG-TS.

## Request-Driven HLS

Lunarr publishes a virtual VOD playlist for duration-known HLS playback and generates requested segments on demand. FFmpeg starts at the requested segment timestamp and writes directly into the session artifact directory. The FFmpeg HLS `start_number` matches Lunarr's virtual segment names so large seeks request and receive the expected segment number.

Active FFmpeg streams are reused for adjacent same-session segment requests when the source, mode, output directory, segment size, hardware settings, quality settings, and segment format still match. Large seeks cancel stale request-driven work and replace it with a new FFmpeg stream at the target timestamp.

Segment requests are serialized per playback session. Duplicate in-flight requests coalesce, and queued generation rechecks whether the requested segment appeared before starting more backend work. This keeps normal forward playback from spawning duplicate encoders for the same session.

Cancelled or replaced FFmpeg processes are asked to exit with `SIGTERM`. If a process does not close within the grace window, Lunarr escalates to `SIGKILL` so abandoned seek/replacement work cannot linger indefinitely.

When Lunarr serves an FFmpeg-authored playlist, it rewrites media segment URIs and fMP4 `EXT-X-MAP` init URIs through the authenticated segment route. This keeps future FFmpeg-authored remux playlists compatible with the same authorization and route-state checks as virtual playlists.

## SFTP Input

SFTP HLS generation uses a private localhost input proxy. Lunarr creates a short-lived token URL bound to the playback session, then FFmpeg reads that URL with `HEAD`, ranged `GET`, or full `GET`.

The proxy translates FFmpeg range requests into the existing seekable storage abstraction. Setup, range stream creation, and range body reads are timeout-bounded. Late or cancelled SFTP handles are closed, truncated reads fail clearly, and replacement input sources are closed when an existing FFmpeg stream is reused.

## Session And Route Safety

HLS playlist and segment routes serve only authorized sessions owned by the signed-in user. They recheck session state and transcoding policy before and after filesystem reads or segment generation. If a session is cancelled, failed, disabled by policy, or has changed artifacts while a request is in progress, the route rejects the stale response instead of refreshing heartbeat or serving old bytes.

Playlist and segment `HEAD` routes return metadata without refreshing playback heartbeat, reading bodies, or triggering segment generation. Segment `GET` records the consumed segment only after the final state check succeeds.

Temporary artifacts are cleaned up for failed, cancelled, completed, orphaned, abandoned, and over-limit playback sessions. Active HLS sessions keep recently consumed artifacts alive while the player is still using them.

## Audio And Subtitles

Stored probe metadata drives audio stream selection. Transcode generation prefers the user's audio language when available, then the richest stream by channels and bitrate. Copied remux generation prefers AAC-family audio compatibility first, then applies the user's language preference when multiple compatible streams are available.

External subtitle tracks remain separate from generated HLS. The user's preferred subtitle language chooses the default external track when a matching track is available.

## Verification

Run the local software playback checks with:

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

`verify:runtime` runs the server-side FFmpeg verifier, FFmpeg software HLS smoke, and NodeAV probe verifier in one command. `verify:ffmpeg` checks that the configured FFmpeg binary exposes the HLS muxer, `libx264`, and AAC encoder. `verify:nodeav` generates a short fixture and verifies NodeAV can still load and probe video metadata. `smoke:transcode` generates a short local fixture and verifies real FFmpeg HLS output. `smoke:browser:seek` drives browser-style seek churn against the HLS seek controller in Chrome or Chromium.

Hardware acceleration must be verified on the host where the actual device is mounted into the runtime:

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

`LUNARR_VERIFY_HARDWARE=auto` makes `verify:runtime` run both hardware encoder verification and a real hardware HLS smoke. `smoke:hardware` defaults to `auto` and runs the same real HLS hardware smoke as `FFMPEG_SMOKE_HARDWARE=auto bun run smoke:transcode`. Use a specific hardware mode when needed: `videotoolbox`, `vaapi`, `qsv`, `nvenc`, or `amf`. For VAAPI, set `FFMPEG_VAAPI_DEVICE` when the render device is not `/dev/dri/renderD128`.
The hardware smoke validates the VAAPI device path before running FFmpeg. In Docker, mount the host render device into the container and point `FFMPEG_VAAPI_DEVICE` at the in-container path.

## Troubleshooting

If playback fails before a playlist is ready, check the playback-session error message first. FFmpeg backend errors include the relevant stderr tail so missing encoders, unreadable inputs, invalid hardware devices, and HLS muxer failures are visible.

If SFTP playback fails, confirm that the file has known duration, positive size, and a known input format from probe metadata. Also check remote range-read stability and whether the server closes idle sessions under seek load.

If hardware acceleration is enabled but playback fails, run the hardware verifier and smoke command inside the same Docker/container environment. Encoder presence in `ffmpeg -encoders` is not enough; the smoke command must actually produce HLS segments.

NodeAV should remain installed and healthy for probing, but normal non-direct playback should not depend on NodeAV HLS segment generation.

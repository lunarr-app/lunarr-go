# Playback And Maintenance

Lunarr plays media through authenticated routes. Raw filesystem paths and remote library locations are resolved only on the server.

## Playback Modes

Lunarr prefers direct browser playback when the media file is already browser-compatible, such as MP4 with H.264 video and AAC audio. Direct playback is served through authenticated, range-capable media routes so browser seeking works without exposing raw paths.

The web player sends conservative client capability hints when starting playback. For example, MP4 HEVC or AV1 files and WebM VP8/VP9/AV1 files can direct play only when the browser reports support for the matching container and codecs, otherwise they fall back to temporary HLS. Capability checks understand common FFmpeg and browser codec-string aliases such as `avc1.*`, `mp4a.*`, `hvc1.*`, `av01.*`, and `vp09.*`.

When direct playback is not suitable, Lunarr serves request-driven HLS through direct FFmpeg CLI process management. HLS-compatible files can use copied remux so FFmpeg repackages the source streams without re-encoding. Lunarr waits for FFmpeg's authored event playlist before treating a requested segment as ready, so segment availability follows FFmpeg's real timing instead of only the virtual playlist grid. Unknown video codecs and unknown audio codecs are not copied through HLS remux. Unsupported codecs use FFmpeg-generated HLS transcoding. NodeAV remains useful for probe-oriented work such as metadata and stream inspection, but it is not the user-facing HLS segment generator.

Request-driven HLS defaults to MPEG-TS segments for broad compatibility. `LUNARR_HLS_SEGMENT_FORMAT=fmp4` forces the experimental fMP4/CMAF segment path for host/browser testing. `LUNARR_HLS_SEGMENT_FORMAT=auto` keeps MPEG-TS for clients that do not prove support, and selects fMP4 only when the web player reports compatible native HLS or MediaSource support. In fMP4 mode, virtual playlists include an `init.mp4` map and request `.m4s` segments while FFmpeg writes matching fMP4 HLS artifacts.

HEVC HLS remux compatibility is deliberately narrower than HEVC direct play. The compatibility checks require HEVC, native HLS, fMP4 HLS support, and an fMP4 server segment format before a copied HEVC/AAC HLS stream is considered safe. Other HEVC HLS requests fall back to transcode.

For SFTP and WebDAV libraries, direct playback and HLS generation both read from the remote server through Lunarr. Remote playback quality depends on server/network range-read performance, known file sizes, and stable remote connectivity.

Admins can choose an HLS quality preset in Settings. `Auto` preserves the default output behavior. `720p` and `1080p` cap transcode height without upscaling and adjust FFmpeg bitrate/CRF targets. `Original resolution` keeps source height and uses a higher transcode target.

Users can set a preferred audio language in Profile. Temporary HLS transcoding prefers a matching audio stream when probe metadata includes language tags. Copied remux generation prefers AAC-family audio compatibility first, then applies the user's language preference when multiple compatible streams are available. If copied remux generation fails while the session is still playable, Lunarr falls back to full transcode.

Users can also set a preferred subtitle language in Profile. Lunarr still returns applicable external subtitle tracks for the selected file, but marks the matching language as the default track when available.

## Chromecast And AirPlay

Chromecast and AirPlay receivers load media from Lunarr directly. The app must be reachable from the receiver device by its configured public origin, not only from the browser that opened the player. Use HTTPS for production deployments, Chrome and Edge rely on Google's Cast Web Sender SDK, and secure origins are required for reliable Cast discovery and launch behavior.

Direct playback can be sent to a receiver when the receiver supports the served container and codecs. Non-direct playback uses the same temporary HLS sessions as the browser player. Before sending HLS to a receiver, Lunarr waits until the playlist is available, then returns signed receiver URLs for the playlist, segments, and external subtitle tracks. Remote playback tokens are scoped to the media route and expire after 8 hours.

HLS receiver playback stays alive through normal playback-session heartbeats and through playlist or segment requests from the receiver. Chromecast sessions are treated as Cast-owned after media is loaded, so closing or navigating away from the browser page does not immediately cancel the Cast playback session. Stopping Cast from the player ends the Cast session and cancels the owned HLS session. AirPlay is closer to native Safari video playback: progress and lifecycle depend on Safari continuing to update the video element, and closing or navigating away from the page can stop playback and cancel temporary HLS.

If Cast or AirPlay controls are missing, first check browser support, HTTPS/origin configuration, receiver network access to Lunarr, and whether the current playback decision has a ready direct stream or HLS playlist. If a receiver opens but does not play, verify the receiver can reach the generated Lunarr URL and that the stream container, codecs, and HLS segment format are supported by that receiver.

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

When a playback session is cancelled or replaced by a seek, Lunarr asks the FFmpeg process to exit with `SIGTERM` and escalates to `SIGKILL` if it does not close within the grace window.

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

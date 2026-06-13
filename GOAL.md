# Goal: Chromecast Support

Add Chromecast playback support to Lunarr without replacing the current browser
player UI.

## Why

Chromecast is a common expectation for media-server users. Lunarr already has
browser playback, direct streaming, and temporary HLS playback; Chromecast would
let users start playback on a TV while using Lunarr as the controller.

## First Version

Implement basic Google Cast sender support.

Required:

- Add a Cast button to the existing media player controls.
- Use the Google Cast sender SDK in the browser.
- Start playback on Chromecast using the default media receiver.
- Send title, poster, duration, media type, and stream URL metadata.
- Support direct-play URLs when the media is browser/cast compatible.
- Support HLS playback URLs for remux/transcode sessions when needed.
- Keep local browser playback working unchanged when the user is not casting.

Not required in the first version:

- Custom Chromecast receiver app.
- Branded TV playback UI.
- Full remote-control UI beyond basic cast session control.
- Multi-user cast queue.
- Adaptive bitrate.

## Main Challenge

The hard part is not the player UI. The hard part is making playback URLs safe
and reachable by the Chromecast device.

Chromecast cannot rely on the browser tab's in-memory state or normal local
video element playback. The device must be able to fetch the stream itself.

Required playback URL work:

- Generate cast-safe absolute playback URLs.
- Ensure the Chromecast can reach the Lunarr server on LAN or public origin.
- Add short-lived playback tokens for cast playlist, segment, subtitle, and
  direct media URLs.
- Avoid relying only on browser session cookies.
- Keep cast playback sessions alive while the Chromecast is playing.
- Do not cancel the HLS session just because local browser playback stops after
  cast handoff.
- Clean up cast playback sessions after receiver stop, sender disconnect, or
  idle timeout.

## Current Playback Behavior To Preserve/Change

Current browser HLS playback keeps sessions alive in two ways:

- The browser posts a playback-session heartbeat immediately, then every 10
  seconds.
- HLS `GET` playlist and segment requests refresh session activity.
- Successful HLS segment responses also record the consumed segment name and
  index.
- HLS `HEAD` requests do not refresh playback heartbeat.

Current browser HLS playback cancels sessions on `pagehide` with
`sendBeacon`/keepalive fetch.

Chromecast handoff must change this behavior for cast-owned sessions:

- Do not cancel the playback session on local pagehide after a successful cast
  handoff.
- Treat the Chromecast receiver as the active player once casting starts.
- Keep the session alive from Chromecast segment requests and/or sender status
  heartbeat.
- Cancel only when the cast session stops, the user explicitly stops playback,
  or the session goes idle.
- Local browser playback must keep the existing pagehide cancellation behavior
  when no cast session owns the playback.

## HLS Notes

For HLS cast playback:

- Prefer the existing request-driven HLS session model.
- Return cast-safe playlist URLs and segment URLs.
- Keep heartbeat/session activity tied to Chromecast segment requests or sender
  status.
- Implement CORS for cast playlist, segment, subtitle, and direct media routes
  used by the receiver.
- Verify both MPEG-TS and fMP4 behavior with Chromecast.
- Treat HEVC in MPEG-TS as unsafe for Cast; prefer fMP4 when verified or fall
  back to H.264/AAC transcode.
- Preserve seek behavior across cast playback.
- Ensure playlist and segment routes accept the cast token.

## Subtitle Notes

First version should attempt sidecar subtitle support when practical:

- Send available WebVTT tracks as Cast media tracks.
- Use cast-safe subtitle URLs with short-lived tokens.
- Respect preferred subtitle language when available.

If subtitle handoff is unreliable, ship the first version without subtitle cast
support and track it as a follow-up.

## Frontend Notes

The current player UI can remain mostly unchanged.

Add:

- Cast availability detection.
- Cast button state: unavailable, available, connecting, connected.
- Basic sender controls for play, pause, seek, and stop cast session.
- Clear error state when the current media cannot be cast.

Avoid building a custom receiver until the default receiver proves insufficient.

## Testing

Tests should cover:

- Cast URL token creation and expiry.
- Token authorization for direct files, HLS playlists, HLS segments, and
  subtitles.
- HLS session retention after cast handoff.
- HLS session cleanup after cast stop/disconnect.
- Local playback still cancels sessions normally when not casting.
- Frontend cast-state helpers.

Current implementation status:

- Added default Google Cast sender support in the browser player.
- Added a server Cast preparation endpoint that returns absolute stream URLs.
- Added signed cast playback tokens for direct streams, HLS playlists/segments,
  and subtitle routes.
- Added CORS headers for cast-token media requests.
- Added cast-owned HLS session handling so browser `pagehide` does not cancel a
  session after handoff.
- Added token unit tests and kept the existing playback route suite passing.

Manual/device testing should cover:

- Direct MP4 playback.
- HLS remux playback.
- HLS transcode playback.
- Seek forward/backward during cast.
- Stop cast and resume local playback behavior.
- Chromecast device on the same LAN as Lunarr.

## Follow-Ups

Possible later improvements:

- Custom Cast receiver app.
- Better TV-side loading/error UI.
- Audio/subtitle track switching from the sender.
- Queue support.
- Public-origin validation in settings.
- Cast compatibility diagnostics.

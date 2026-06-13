# Goal: Custom Video Player UI

Replace the browser's native visible video controls with a custom Lunarr player
interface while keeping the existing `<video>` element, HLS.js integration, and
server playback pipeline.

## Why

Native browser controls are inconsistent across desktop, mobile, and browsers.
Lunarr also has playback behavior that native controls cannot explain well:

- full-runtime HLS seek handling
- remux/transcode session state
- Cast handoff state
- custom subtitles
- progress save and resume state
- future quality/audio/subtitle selection

A custom player UI lets Lunarr present one consistent media-server experience.

## Inspiration

Use the Loader player as broad inspiration:

- top gradient/header overlay
- title and back/close action
- Cast action near the title
- center play/pause and skip controls
- bottom gradient with timeline and duration
- auto-hide controls while playing
- visible loading, error, and casting states

Do not copy the mobile implementation directly. Lunarr is web-first and must
work well on desktop, mobile browser, TV browser, keyboard, mouse, and touch.

## Non-Negotiables

Keep the current playback engine and session behavior:

- Keep the existing `<video>` element as the media element.
- Keep HLS.js setup and native HLS fallback behavior.
- Keep HLS seek/reposition behavior correct.
- Keep heartbeat, progress save, pagehide cleanup, and Cast-owned session logic.
- Keep direct, remux, and transcode playback working.
- Keep captions/subtitle tracks working.
- Keep browser fullscreen support.
- Keep mobile/touch behavior usable.

## First Version Scope

Hide native controls and ship a complete custom overlay.

Required controls:

- play/pause
- seek bar
- current time and total duration
- skip backward 10 seconds
- skip forward 30 seconds
- fullscreen toggle
- volume/mute on desktop
- captions/subtitles menu when tracks exist
- Cast button and Cast connected state
- loading, buffering, seeking, autoplay-blocked, and error states

Required interactions:

- click/tap video toggles controls
- controls auto-hide while playing
- controls stay visible while paused, seeking, buffering, casting, or errored
- seek drag previews and commits cleanly
- keyboard shortcuts on focused player:
  - space or `k`: play/pause
  - left/right: seek backward/forward
  - `f`: fullscreen
  - `m`: mute
  - `c`: captions
- pointer and touch interactions must not fight native video behavior

## Layout

Desktop:

- video remains the main surface
- controls overlay the video
- top bar: close/back, title, Cast
- center: large play/pause with skip buttons
- bottom bar: timeline, time, volume, captions, fullscreen

Mobile:

- larger hit targets
- fewer always-visible buttons
- center play/pause and skip controls are primary
- volume can be omitted if the platform handles hardware volume
- timeline must remain easy to drag

## Accessibility

The custom UI must be keyboard and screen-reader usable:

- every button has an accessible label
- slider exposes current time and duration meaningfully
- focus states are visible
- keyboard shortcuts do not trigger while typing in another input
- overlay text does not trap focus
- controls meet reasonable contrast on video backgrounds

## HLS Seek Requirements

This is the highest-risk area.

The custom seek bar must use full media time, not stream-relative time, so:

- direct playback: seek target equals video current time
- HLS remux/transcode: seek target is absolute media time
- stream-relative video time is converted using `streamStartSeconds`
- seeking backward or far forward must preserve the current fixed seek behavior
- no timeline reset after HLS reposition

## Cast Requirements

When casting:

- show a connected/casting state on the player
- pause local playback after successful handoff
- do not cancel cast-owned HLS sessions on browser pagehide
- play/pause/seek controls should control Cast when a Cast session is active
- stop/disconnect should release Cast ownership and cancel the HLS session when
  appropriate

## Subtitle Requirements

First version:

- expose a subtitle menu for existing external tracks
- allow off/on track selection locally
- keep default/preferred subtitle behavior

Follow-up:

- Cast subtitle switching from sender UI
- audio track selection if/when server supports it

## Testing

Automated tests should cover:

- time formatting
- timeline value conversion for direct and HLS playback
- seek commit behavior
- auto-hide state rules
- keyboard shortcut behavior
- Cast-owned controls route actions to Cast instead of local video
- local HLS cleanup still behaves correctly when not casting

Manual/browser testing should cover:

- Chrome desktop
- Safari desktop if available
- mobile Safari
- mobile Chrome/Android
- direct MP4
- HLS remux
- HLS transcode
- seek backward and forward
- fullscreen enter/exit
- subtitles on/off
- Cast handoff and Cast stop

## Phased Plan

Phase 1:

- Extract player state/control helpers into testable modules.
- Add custom overlay UI while keeping native controls behind a fallback flag.
- Implement play/pause, timeline, skip, fullscreen, Cast button, and state
  overlays.

Phase 2:

- Add captions menu, volume/mute, keyboard shortcuts, and improved mobile
  controls.
- Add focused unit tests for timeline and control state.

Phase 3:

- Disable native controls by default.
- Add browser/device regression testing.
- Remove fallback only after real playback testing is stable.

## Risks

- Mobile Safari can behave differently with fullscreen, subtitles, and autoplay.
- Custom controls can regress accessibility if not built deliberately.
- HLS seek UI must not reintroduce the previous timeline reset behavior.
- Cast control state can drift from receiver state if sender events are not
  handled carefully.

## Definition Of Done

- Native controls are no longer visible by default.
- Custom controls cover all common playback actions.
- Direct, remux, transcode, subtitle, fullscreen, and Cast flows still work.
- Test suite and type check pass.
- Manual playback checks are completed on at least one desktop browser and one
  mobile browser.

## Current Verification Status

Verified locally:

- Native controls are disabled in the custom player path.
- Custom overlay covers play/pause, seek, time, skip, fullscreen, desktop
  volume/mute, subtitles, Cast state, loading, buffering, seeking,
  autoplay-blocked, and error states.
- Full-timeline direct and HLS seek calculations are covered by unit tests.
- Keyboard shortcut exposure is covered by unit tests for subtitle and
  no-subtitle player states.
- Subtitle menu keyboard navigation wraparound and jump behavior is covered by
  unit tests.
- Cast-owned play/pause/seek routing is covered by unit and browser smoke tests.
  Cast-owned HLS session bookkeeping is now shared between the component and
  unit tests, covering the sender-side rule that pagehide cleanup skips
  Cast-owned sessions while explicit Cast stop releases ownership and cancels
  the active Cast-owned session. The cleanup decision that distinguishes normal
  pagehide/destroy cleanup from explicit Cast-stop cleanup is unit-tested
  directly.
- The authenticated Cast preparation API is covered for direct playback, HLS
  playback sessions, subtitle tracks, scoped receiver URLs, Cast tokens, content
  types, and the missing-HLS-session error path. This proves the sender can
  prepare a receiver payload, but not that a physical receiver accepts and plays
  it.
- Keyboard shortcut suppression, subtitle menu semantics, desktop layout, mobile
  layout, player-shell region semantics, player-surface focus, ARIA shortcut
  exposure, pointer affordance, hover color treatment, and reduced-motion
  loading spinner behavior are covered by browser smoke tests.
- The browser HLS seek smoke now matches the current custom seek model: browser
  seek events update UI state and absolute timeline, while custom seek commits
  make explicit local, reposition, or Cast decisions.
- The custom player browser smoke also inspects the actual `MediaPlayer.svelte`
  source so the ready `<video>` tag cannot regain native controls without
  failing the smoke.
- Desktop Chrome was checked against the running app with the local fixture DB:
  an MP4 movie direct-played with the custom player, native controls stayed
  disabled, controls auto-hid, a normal video-surface click restored the custom
  controls, and the custom seek slider moved playback to 0:05 of a 0:10 file.
- Desktop Chrome was checked against the running app for HLS transcode using
  the `A Goofy Movie` MP4 fixture with `transcode=1`: the API returned
  `mode: "transcode"`, the player used a playback-session `.m3u8` URL, native
  controls stayed disabled, the custom controls rendered, and the custom seek
  slider kept the full 0:10 timeline.
- Desktop Chrome was checked against the running app for HLS remux by
  temporarily overriding one fixture row's probed metadata to
  `matroska,webm` + `h264/aac` and restoring it afterward. The API returned
  `mode: "remux"` with reason `container_unsupported`, the player used a
  playback-session `.m3u8` URL, native controls stayed disabled, the custom
  controls rendered, and the custom seek slider kept the full 0:10 timeline.
  The current fixture DB has no natural remux candidate because all indexed
  files are probed as `mp4/h264`.
- Desktop Chrome was checked against the running app for real external
  subtitles by temporarily adding a VTT sidecar and subtitle DB row, then
  restoring both afterward. The playback API exposed the track, the
  `/media/subtitles/:id` route served the VTT body, the default track loaded as
  `showing`, and the custom subtitle menu toggled the track off and back on.
- Desktop Chrome was checked against the running app for document fullscreen:
  the custom fullscreen button entered fullscreen on the player shell, changed
  to the exit state, and exited fullscreen cleanly. This also fixed a discovered
  UI state lag by setting `isFullscreen` immediately after fullscreen promises
  resolve.
- Mobile/touch-emulated Chrome was checked against the running app with the
  local direct-play fixture: native controls stayed disabled, the mobile layout
  hid the volume slider and title, all visible buttons were at least 44px
  except the larger primary play target, the timeline fit the player width,
  tap-to-hide/show controls worked, the custom seek slider moved playback to
  around 0:05 of a 0:10 file, and document fullscreen entered with the exit
  state. This is useful regression coverage, but it is not a real mobile-device
  browser check.
- `bun run build`, `bun run check`, `bun test` with 519 passing tests,
  `bun run smoke:browser:player`, `bun run smoke:browser:seek`, focused
  playback tests, and `git diff --check` pass locally. The dedicated custom
  player and HLS seek browser smokes were re-run successfully on the current
  worktree.

Still requires real playback/device verification before this goal is done:

- Mobile browser playback on a real device.
- Fullscreen enter/exit on a mobile browser.
- Chromecast handoff, receiver control, seek, stop, and cleanup with a real
  receiver.

## Real Device Verification Checklist

Use this checklist before marking the custom player replacement complete.

Mobile browser:

- Open Lunarr on a real phone or tablet, not Chrome device emulation.
- Start direct playback and confirm native controls are not visible.
- Tap the video surface to hide and show the custom controls.
- Drag the timeline forward and backward; confirm the displayed position and
  played media position match.
- Confirm play/pause, skip backward, skip forward, subtitles, and fullscreen
  behave correctly.
- Repeat the seek check on HLS remux or transcode playback so full-runtime HLS
  time is verified on a real mobile browser.

Chromecast:

- Start playback from the sender and use the Cast button to hand off to a real
  receiver.
- Confirm local playback pauses after handoff and the sender shows connected
  Cast state.
- Use sender play/pause and seek controls while casting; confirm the receiver
  follows those commands.
- Seek backward and forward in a Cast-owned HLS session; confirm the timeline
  does not reset and playback starts near the requested media time.
- Close or reload the sender tab while casting; confirm the Cast-owned HLS
  session is not cancelled just because the page unloaded.
- Stop/disconnect Cast from the sender; confirm ownership is released and the
  active Cast-owned HLS session is cancelled when appropriate.

# Changelog

## 0.3.0 - 2026-06-14

### Added

- Added a custom media player UI with bottom-bar controls, pointer-aware control visibility, buffering/loading states, screen wake lock support, and browser smoke coverage.
- Added Chromecast playback support, including Cast RemotePlayerController integration and Cast session loading/state handling.
- Added AirPlay playback support with remote playback URLs and player controls.
- Added signed playback source URLs for remote playback and HLS routes.
- Added Docker release, Docker edge, and Docker test workflow coverage.
- Added project credits.
- Added local light and dark theme support, including profile theme selection and light-theme logo handling.
- Added OpenAPI 3.1 documentation endpoints at `/api/openapi.json` and `/api/openapi.yaml`.
- Expanded OpenAPI coverage across API, admin, playback, and media routes, with drift tests for route/method coverage, local `$ref` validity, and no-body responses.
- Added contributing guidance for scoped commits, minimal changes, and reviewed AI-assisted code.
- Documented runtime configuration, FFmpeg path support, hardware verification flags, Docker FFmpeg behavior, API-key usage, and Cast/AirPlay playback behavior.

### Changed

- Replaced native video controls with the custom player shell and refined player styling, sizing, startup feedback, and surface click feedback.
- Improved playback handoff behavior between web, Cast, and AirPlay by preserving playback sessions across remote transitions, routing remote launches by target, and retargeting local resume back to web playback.
- Added target-specific playback capability profiles for web, Cast, and AirPlay so source selection can account for remote-device support.
- Tuned playback session heartbeat behavior for smoother idle, resume, and seek flows.
- Unified signed playback source handling and cleaned up signed playback helpers.
- Refined media detail pages for movies, shows, seasons, episodes, cast/person pages, and continue watching with denser layouts and cleaner metadata presentation.
- Refined admin operations and library UI styling for a more compact, consistent app experience.
- Improved media rails so short rows stay on one line and two-row rails preserve visual reading order.
- Updated video filename parsing.
- Stamped Docker builds with an explicit `LUNARR_APP_VERSION` build argument and exposed it at runtime.
- Enabled FFmpeg integration coverage in CI when FFmpeg is available.
- Updated SvelteKit from `2.65.0` to `2.65.1`.

### Fixed

- Fixed remote playback auth, Cast startup timing, readiness error handling, Cast playback state ownership, and Cast session loading edge cases.
- Fixed AirPlay remote playback URL handling.
- Fixed stale seek preview cleanup while Cast is connecting.
- Kept browser smoke compatibility for custom control pointer refresh behavior.
- Stabilized player layout and playback button state during load and buffering.
- Retried local playback when media becomes ready.
- Fixed a request-driven HLS lookahead test race by waiting for generated segment output.
- Skipped stale Docker workflow runs and gated Docker edge publishing behind CI smoke coverage.

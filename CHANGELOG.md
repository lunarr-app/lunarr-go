# Changelog

## 0.4.0 - 2026-06-16

### Added

- Added a shared HLS playback cache with content-keyed segment reuse, reference counting, LRU/TTL eviction, and bounded encode-ahead generation across sessions.
- Added an HLS encode coordinator that coalesces segment waiters, reuses in-window FFmpeg jobs, cancels stale work on far seeks, and supports parallel non-overlapping windows on the same cache.
- Added HLS cache status in Settings, idle cache force cleanup from Transcoding settings, and API documentation for playback artifact storage.
- Added WebDAV remote library support for scanning, probing, and seekable playback through the existing range proxy.
- Added movie and show library search with focus-safe keyboard navigation and expanded server-side matching (title, original title, sort title, keywords, genres, and file basename).
- Added TMDb alternate release title matching, ±1-year release matching, adult-catalog search inclusion, and filename-title preference for Radarr-style folder layouts.
- Added a TV show metadata panel with per-show TMDb refresh and `created_by` import.
- Added profile API key management, profile account editing, and Better Auth–backed API key lifecycle handling.
- Added custom app and fallback error pages with shared copy helpers and tests.
- Added remote container format sniffing from file headers to improve probe and playback decisions on SFTP/WebDAV sources.
- Added a README preview GIF and expanded docs for WebDAV, playback artifacts, runtime verification, and web player controls.
- Added Cursor rules for svelte-check, tests, and extended verification; adopted Prettier with a 120-column width across the repo.

### Changed

- Opened playback in a full-viewport player shell and refined web player surface clicks: show controls when hidden, zone seek/play on single click when visible, double-click for zone actions when hidden, and 3.5s auto-hide during ordinary playback.
- Split large scanner, storage, transcoding, and MediaPlayer modules into focused files without changing user-facing behavior.
- Refined library management with modal-based edit/sharing flows, deduplicated modal shell code, and cleaner library row actions.
- Aligned TV browse with movie rails, list pages, and paginated API responses.
- Polished movie detail metadata controls, multi-file labeling, Jobs admin layout, and on-demand scan error loading for visible rows only.
- Improved playback startup by warming the initial request-driven HLS segment, waiting on FFmpeg event-playlist readiness, and deferring cancellation of superseded sessions until replacement playback is ready.
- Hardened auth with Better Auth core rate limiting, API key verification rate limits, POST-only logout (CSRF-safe), and consolidated auth test setup.
- Derived OpenAPI `info.version` from `APP_VERSION`.
- Updated README and playback/transcoding documentation for the current product scope.

### Fixed

- Fixed shared-cache HLS encoding so remux fallback releases locks before transcode, near-seek cache blocking no longer stalls playback, and superseded sessions cancel only after the replacement stream is ready.
- Fixed encode coordinator stale-job retries, per-job fMP4 init file naming, and remux fallback TypeScript narrowing in the transcode runner.
- Fixed HLS player initialization races, rewatch progress handling, flaky seekable input-proxy and encode-coordinator CI tests, and parallel remote storage teardown flakes.
- Fixed TV show metadata refresh after provider merge, metadata candidate merge, deleted-library labels on orphaned scan jobs, and strict movie metadata lookup edge cases.
- Fixed API key expiry validation, auth error status mapping, and expiring API keys being deleted on first use.
- Fixed WebDAV stat typing and direct media stream abort behavior on client disconnect.
- Removed dead `playerSurfaceClickState` and an unused test variable that failed strict unused-local TypeScript checks.

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

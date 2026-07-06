# Changelog

## Unreleased

### Added

- Added per-user Continue staleness filtering on Profile (`continueMaxAgeDays`, 0–3650 days), hiding idle in-progress items from Continue rails while keeping resume on detail pages.
- Continue rails now ignore accidental starts shorter than 60 seconds.
- Added optional `page` and `limit` query params (default limit 24) to browse, continue, discover, and similar APIs, with companion `*Page` metadata for every rail and continue section.
- Added paginated Continue section pages at `/continue/movies`, `/continue/episodes`, and `/continue/next-up`.

### Changed

- Documented Continue filtering for browse rails, transcoding admin settings, and `playback-cache` storage layout.
- Unified default catalog page size to 24 items. Web full-library pages still request 36 items per page.
- Continue hub and home rails now link to dedicated section list pages instead of relying on a single unpaginated `/continue` view.

## 0.6.0 - 2026-07-04

### Added

- Added tiered TV show API endpoints for mobile and third-party clients: `GET /api/shows/:id/overview`, `GET /api/shows/:id/credits`, `GET /api/shows/:id/seasons/:seasonId`, with `GET /api/shows/:id` retained for full season/episode trees.
- Added tiered movie API endpoints: `GET /api/movies/:id/overview`, `GET /api/movies/:id/credits`, and a composed `GET /api/movies/:id` full-detail response built from overview plus cast.
- Added lazy-loaded guest show share seasons via `GET /api/share/:token/seasons/:seasonId`, with overview-tier share pages that load episode lists per season on demand.
- Added optional `rail` query support on `GET /api/movies` and `GET /api/shows`, including comma-separated multi-rail requests for lighter home-screen fetches.
- Added a typed API contract layer with centralized response types in `src/lib/server/api/types.ts`, `apiJson()` response helpers, an OpenAPI schema manifest, and contract tests that keep handlers aligned with the published spec.
- Added paginated person filmography on the person page and matching API responses.
- Added `GET /api/health` for public readiness probes, including before first-run setup completes.
- Added TV and mobile device pairing with `POST /api/device-pairing`, `GET /api/device-pairing/poll`, and `POST /api/device-pairing/approve`, including two-year paired API keys and a ready-made `pairingUrl` for QR codes.
- Added a **Link a device** page at `/link-device` with optional `?code=` and `?name=` prefill for approving pairing codes outside Profile.

### Changed

- Loaded show browse and detail landing pages from overview tiers instead of full show trees with every episode.
- Reworked season pages and guest share UIs to use tiered media helpers and lazy season loading.
- Added skeleton loading placeholders for guest share episode lists and the share link modal while client data loads.
- Showed next-up episodes on the Continue page for in-progress shows.
- Unified JSON API error responses behind `apiError` and `apiErrorFrom` across `/api` handlers.
- Migrated browse, catalog detail, continue, discover, settings, users, shares, playback, jobs, and guest-share routes to typed `apiJson` responses.
- Split admin and media share list response types and tightened settings action OpenAPI schemas.
- Typed library detail API responses separately from library create payloads.
- Updated API documentation for detail tiers, browse rails, the shared contract layer, and guest share season loading.
- Updated dependencies, including SvelteKit 2.67.0, Better Auth 1.6.23, `@lucide/svelte` 1.23.0, Playwright 1.61.1, and Prettier 3.9.4.
- Bumped GitHub Actions `actions/checkout` from v6 to v7.
- Moved device linking out of Profile into `/link-device`, with a profile teaser grouped alongside API keys.
- Refined the Profile layout into access panels (account, device linking, API keys) and preference panels (appearance, playback), with Appearance second on mobile.
- Reworked the Profile account panel into view and edit modes with a collapsible password section.
- Preserved post-login `redirectTo` through sign-in so scanned pairing links work when users are logged out.
- Updated Docker smoke tests and API documentation for `GET /api/health` and device pairing.

### Fixed

- Fixed a guest share season lazy-load race where switching tabs could show the wrong season's episodes or errors.
- Fixed OpenAPI browse `rail` query documentation to allow comma-separated multi-rail values.
- Fixed cast rail typing for nullable provider IDs.
- Pruned idle guest share rate-limit keys after their window expires so long-running processes do not accumulate stale `bucket:ip` entries.
- Removed unused imports caught by strict TypeScript checks.
- Fixed device pairing races where concurrent approvals could create duplicate API keys.
- Fixed approved pairings expiring before devices could poll their one-time API key.
- Hardened device-pairing rate limits, pairing-code uniqueness, and cleanup of finished pairing rows after 30 days.
- Fixed post-login open redirect via backslash-normalized `redirectTo` paths.

## 0.5.0 - 2026-06-20

### Added

- Added guest share links for movies and TV shows, including scoped public share pages, season-limited show shares, guest playback endpoints, signed media URLs with share tokens, per-IP share rate limits, and admin share management.
- Added an admin Shares page with status filtering, pagination, full revoked-share history, stale-link cleanup on startup, and share creation from media detail pages.
- Added admin user management in the app and API, backed by Better Auth user creation, role updates, deletion, last-admin safeguards, and self-deletion protection.
- Added similar movies and shows, paginated similar browse pages, and matching API endpoints ranked by shared genres, keywords, cast, directors, and show creators.
- Added personalized movie and show discover pages and API endpoints using weighted because-you-watched recommendations from recent completed media.
- Added a native playback target for VLC, mobile apps, and other API clients so they can request signed direct streams without web-player transcode preferences forcing HLS.
- Added shared media UI building blocks for detail layouts, metadata panels, season tabs, cast rails, share modals, brand display, and watch summaries.
- Added an Apache-2.0 license and package metadata for open-source distribution.

### Changed

- Split the large server media module into focused movie, show, file, progress, catalog, similarity, people, and shared type modules.
- Split movie, show, season, profile, and settings pages into route-local components and moved player components under `src/lib/player`.
- Moved feature-specific styling out of global CSS so `app.css` mostly holds tokens and shared primitives.
- Refined movie, show, and episode rail layouts with reusable rail components that fill a bounded two-row grid instead of overflowing long two-row sections.
- Redesigned season pages and guest share pages with season tabs, denser episode lists, and cleaner playback presentation.
- Improved playback error recovery and runtime failure messaging with more actionable player overlays.
- Reduced web player timeline reactivity to better match mobile playback pacing.
- Updated API and playback documentation for discover/similar endpoints, guest shares, admin users, and playback targets.
- Updated dependencies, including Better Auth 1.6.19, SvelteKit 2.65.2, `@lucide/svelte` 1.20.0, Playwright 1.61.0, and `prettier-plugin-svelte` 4.1.1.

### Fixed

- Fixed shared external subtitle tracks with no `media_file_id` so subtitles advertised by playback can be authorized and served.
- Fixed guest share playback heartbeats and hardened share listing behavior.
- Fixed episode metadata merging after TV refreshes.
- Fixed HLS playback error recovery and busy-overlay detail during runtime failures.
- Fixed the FFmpeg contract allowlist after splitting the transcoding settings panel.
- Fixed a SvelteKit/adapter-node startup deadlock by pinning compatible package versions.
- Removed an unused signed-token import from the HLS segment route.

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
- Added Cursor rules for svelte-check, tests, and extended verification, and adopted Prettier with a 120-column width across the repo.

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

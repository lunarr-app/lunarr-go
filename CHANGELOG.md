# Changelog

## 0.9.4 - 2026-08-16

### Added

- Added audio track metadata to playback decisions: responses now include an `audioTracks` array (id, label, language, codec, channels, default) built from the probed audio streams, so clients can surface and select audio without re-probing. The default track follows the preferred audio language when set, otherwise the first stream. Audio-track-aware codec selection now reads directly from the probed streams instead of the file's primary track.

### Changed

- Updated `@better-auth/api-key`, `better-auth`, `@lucide/svelte`, `hls.js`, `kysely`, `svelte`, and `svelte-check` dependencies.

### Fixed

- Fixed web playback stalling at the first HLS encode-window boundary ([#175](https://github.com/lunarr-app/lunarr-go/issues/175)). Each encode window (4 × 16s segments) is a fresh FFmpeg process that input-seeks, which restarted media timestamps near zero for every window while the served VOD playlist declared a continuous timeline. HLS.js discarded the out-of-range segments and playback froze at ~1:04. Windows now apply `-output_ts_offset` matching their start time (and use `-avoid_negative_ts make_non_negative`, which preserves it) so segment timestamps stay continuous across windows, fixing playback from the start, after mid-playback seeks, and after resuming past the first window.

## 0.9.3 - 2026-08-09

### Fixed

- Fixed HLS audio/video drift on remuxed playback: `auto` and `prefer_direct` playback preferences now resolve to direct or full transcode instead of remux. FFmpeg can only split copied streams at existing source keyframes, so the virtual VOD playlist's fixed `EXTINF` durations drift from the actual remux segment boundaries. Full transcode forces keyframes at each boundary and eliminates the drift. Remux capabilities and generation code paths remain for forced/fallback use but are no longer chosen automatically.
- Fixed TV season matching to verify candidates against translated/alternative titles and prefer the candidate whose year matches the folder year, so German-titled shows and ambiguous same-name shows resolve correctly.
- Fixed year-like show directory names (e.g. `1883`) being misread as release years unless they appear as a parenthesized or trailing year preceded by other title content, and bounded TV detail fetches across search-year passes to a fixed budget.
- Fixed rounding out localized season folder support, including recognizing localized season folder names and parsing `sxxeyy` from hash-like TV filenames.
- Fixed redundant TMDb detail fetches: movie and TV lookups are now deduplicated across search-year passes and bounded to a fixed candidate budget so an unresolved title walks at most a fixed number of candidates.
- Fixed TV rescans re-querying TMDb for unchanged, already-matched files by reusing the existing provider-matched media item on rescan.

### Refactored

- Deduplicated and cleaned up metadata matching code, removed the scanner index barrel, split scanner index tests by concern, and loaded node-av as a static dependency.

### Changed

- Updated `hls.js`, `@lucide/svelte`, `vite`, `svelte-check`, `theintrodb`, and `vite-plugin-svelte` dependencies.

## 0.9.2 - 2026-08-05

### Added

- Added admin **Fix Match** to override TMDb matching for movies and shows ([#170](https://github.com/lunarr-app/lunarr-go/issues/170)): admins can point a wrong or unmatched item at the correct TMDb entry via URL/ID paste or name search with preview, persisting across scans and metadata refreshes. Includes a `media_item.manual_match` flag with migration, TMDb lookup-by-ID and top-10 search candidates, a TMDb URL/ID reference parser, and `POST /api/{movies,shows}/[id]/match` plus `GET /api/{movies,shows}/[id]/match/search` endpoints (admin-only, TMDb-config guard, 404 for unknown items) with OpenAPI docs.
- Added the ability to revert a manual Fix Match back to automatic matching: `DELETE /api/{movies,shows}/[id]/match` clears the manual flag and immediately re-matches via the existing refresh logic, with a Revert button in the metadata panel shown only when the title is manually matched. `manualMatch` is now exposed on movie/show detail responses.

### Changed

- Migration 0010 also tunes indexes: adds missing FK/lookup indexes (`scan_job_error`, `watchlist`, `playback_session.cache_id`, better-auth tables) and drops 11 redundant ones.
- Bumped `better-auth` and `@better-auth/api-key` to `1.6.26`.

## 0.9.1 - 2026-08-01

### Upgrade Note

- Upgrading from 0.8.0 or earlier? Run **Settings > Media probe > Repair** after updating to re-probe your library with the audio track data.

### Added

- Exposed probed audio track data on movie and episode detail APIs: files now include an `audio_tracks` list (language, codec, channels) alongside the existing primary-track fields, covering `GET /api/movies/{id}`, `GET /api/movies/{id}/overview`, and `GET /api/episodes/{id}`, with updated OpenAPI schemas. Backward compatible for existing clients.
- Updated the movie and episode detail file sections to surface the newly exposed audio tracks: a "Dual audio / N audio" badge appears when a file has more than one track, and each track is listed by language, codec, and channels (falling back to the single primary-track label otherwise).

### Changed

- Updated frontend dependencies (SvelteKit, Vite, `@lucide/svelte`).

### Fixed

- Fixed playback mode decisions for dual-audio files: when a preferred audio language is set and matches a stream, that stream's codec now decides direct/remux/transcode instead of always the first audio track, letting copy-compatible preferred tracks remux instead of fully transcoding. Falls back to the first track when no preference is set or no stream matches.
- Fixed items being marked watched based on a flat 90% threshold: completion now subtracts an estimated end-credits duration per kind (episode ~90s, movie ~7m) plus a small grace period, floored at 80% of runtime, so it adapts to content length.

## 0.9.0 - 2026-07-26

### Upgrade Note

- This release adds frame rate columns (`video_frame_rate`, `frame_rate`, `r_frame_rate`) to the database for improved HLS segmentation. For the best experience, go to **Settings > Media probe > Repair** after updating to re-probe your library with the new frame rate data.

### Added

- Frame-based HLS segmentation for exact GOP-to-segment alignment.
- Replaced movie-lookup parser with guessit-js for more accurate title resolution.
- Replaced custom tv-parser with guessit-js, including multi-episode filename support (S01E01E02).
- Added test coverage for guessit array title handling from full paths.

### Changed

- Default unknown video frame rate to 23.976 instead of 30.
- Pass container format hint to FFmpeg for remote playback.
- Pass hwaccel args for AMF to enable zero-copy decode pipeline.
- Regenerate missing HLS playlists from session metadata, passing segmentFormat from env var.
- Removed virtual playlist support, always read from disk.
- Updated dependencies.

### Fixed

- Fixed forced column layout on confirm modal buttons at 480px.
- Fixed player controls staying visible over the buffering overlay during transient states (buffering, starting, seeking), hiding controls by default behind the overlay instead.
- Fixed buffering overlay flashing on brief buffering events by debouncing the overlay with a 500ms threshold.
- Fixed HLS segment content-length from the served body.
- Fixed duplicate cache-binding query in HLS lookahead.
- Fixed media stream info replace to use a transaction.
- Fixed resolveFfmpegPath to return null when no FFmpeg is executable.
- Fixed enough bytes sniffed to detect MPEG-TS for remote files.
- Fixed fMP4 HLS segment default and init.mp4 naming mismatch.
- Fixed HLS segment pruning from both cache and session directories.
- Fixed prefetchAhead to generate all ahead segments instead of stopping after the first.
- Fixed acquirePlaybackCache stale-check and upsert race with a transaction.
- Fixed prefer fuller alternative title over generic episode_details for episode names.
- Fixed normalize array movie titles and drop noise tokens to avoid crash.
- Fixed combine title and alternative_title in movie lookup to preserve 'Title - Subtitle' names.
- Fixed prefer directory context for TV show title and pass root-relative path to guessit.
- Fixed filter guessit noise from alternative_title and use episode_details.
- Fixed handle guessit returning title as array for full paths.
- Fixed bundle VAAPI/QSV driver packages in the Docker image ([#162](https://github.com/lunarr-app/lunarr-go/pull/162)).
- Fixed reduce download progress verbosity to update only on percentage change.
- Fixed update Tears of Steel download URL to working Blender Foundation server.
- Fixed chunk unbounded IN() deletes to avoid SQLite variable limit.

### Refactored

- Inlined thin wrappers and deduplicated normalizedStartTimeSeconds.
- Deduplicated effectiveSegmentSeconds and video frame rate lookup.
- Reused hlsSegmentName in prefetchAhead.
- Simplified tv-parser and strip trailing year from directory titles.

## 0.8.0 - 2026-07-20

### Added

- Added a Discover page (`/discover`) in the primary navigation with because-you-watched movie and TV picks, ranked by shared genres, keywords, cast, and directors, each linking to a dedicated "View all" browse page (`/movies/discover`, `/shows/discover`).
- Added a zoom control to the web player that cycles Fit, Fill, and Stretch via a top-bar button or the `Z` shortcut, with a transient mode badge, matching the TV app.
- Added Movies, Shows, and Watchlist links to the account menu on small screens.
- Added a watchlist feature for movies and shows, including a watchlist toggle on detail pages and a dedicated Watchlist page rendered with the shared rail carousel layout.
- Added dedicated watchlist API endpoints (`GET /api/watchlist/movies`, `GET /api/watchlist/shows`, `GET /api/watchlist/{mediaItemId}` to check status) with a `limit` query parameter, SQL-level filtering, and pagination.
- Added dedicated continue-watching API endpoints (`GET /api/continue/movies`, `GET /api/continue/episodes`) alongside the existing next-up endpoint.
- Added `inWatchlist` to movie and show detail/overview API responses.
- Added support for sidecar `.srt` subtitle files with on-the-fly WebVTT conversion for playback.
- Added `-v`/`--version` and `-h`/`--help` flags to the start script.
- Added a persisted auth-secret fallback: when `AUTH_SECRET` is unset, a random secret is generated, saved to the data directory, and reused on later starts.

### Changed

- Adopted spacing and radius design tokens (replacing ad-hoc values) and aligned the dark theme accent with the TV app.
- Made Continue the primary landing page: the brand logo, root `/`, and post-login/setup/signup redirects now go to `/continue` (previously `/movies`), and Continue is listed first in the primary navigation.
- Tightened the app layout padding: horizontal max reduced to `2rem` and main vertical padding made symmetric (`1.6rem` top/bottom, was `1.4rem`/`3rem`).
- Turned the Movies and Shows pages into full paginated browse pages with inline search and sort controls (defaulting to recently added for movies and recently aired for shows), removing the previous carousel hub layout, the watch-status filter, and the `/movies/all`-style subroutes.
- Removed the dedicated Search page and nav item, moving library search inline onto the Movies and Shows browse pages.
- Removed the per-page "Discover" buttons from the Movies and Shows pages (now reached via the Discover page).
- Removed continue-watching and next-up rails from the Movies and Shows pages so resume lives only on the dedicated Continue page.
- Removed the redundant page titles and subtitles from the Continue, Discover, Movies, and Shows pages for a flatter layout.
- Changed the Continue sections (Movies, Episodes, Next up) to render as single-row horizontal carousels using the shared rail components. Each section loads the default 24-item rail limit.
- Consolidated the `MovieRail`, `ShowRail`, and `EpisodeRail` components into a single generic `Rail` component in `$lib/components` that takes the items, a `poster`/`episode` width `variant`, and a card-rendering snippet, so every page uses one implementation.
- Changed rails to always render as single-row horizontal carousels, removing the previous two-row grid fallback. Deleted the now-unused `twoRowRailItems` helper in `src/lib/media/rails.ts` and its tests.
- Redesigned the player control bar for small screens: subtitle and zoom controls moved to the top bar (AirPlay last), top-bar buttons no longer wrap and take priority over the now always-visible (truncated) Now playing title, and the volume slider is hidden on touch devices where mute alone is enough.
- Showed the episode release date in the detail hero chip as a human-readable locale date (the metadata card keeps the raw date).
- Standardized detail, similar, and Discover "View all" pages to 36 items per page.
- Removed the redundant `admin-cancel` playback API route because the owner cancel endpoint already permits admins.
- Removed duplicate TMDb credential flags from the settings response.
- Return RFC 9457 problem-details (`application/problem+json`) for API errors, including 204 No Content from DELETE endpoints, 500 for unexpected read-API errors, and consistent JSON error handling across GET endpoints.
- Aligned OpenAPI request schemas with runtime contracts and real enums.
- Redesigned the detail hero (unified watch-toggle icons, removed back-links, clickable show/season subtitle, global heading scale) and improved media hero chips and season rating/year data.
- Stopped trimming passwords in auth forms.
- Enabled VAAPI hardware decode with GPU scaling, fixed hardware transcode scaling for VideoToolbox, QSV, and NVENC, and unified FFmpeg scale-filter construction across hardware modes.
- Standardized the app environment configuration (`LUNARR_APP_VERSION`, `FFMPEG_PATH`, `FFMPEG_VAAPI_DEVICE`) in `appEnv` and removed a redundant transcode-policy call from the heartbeat endpoint.
- Bumped non-major dependencies (SvelteKit 2.70.1, Svelte 5.56.6, Vite 8.1.5, svelte-check 4.7.3, `@lucide/svelte` 1.25.0, `kysely` 0.29.4, `theintrodb` 3.1.2, `prettier` 3.9.5, `@ctrl/video-filename-parser` 5.11.4).

### Performance

- Rewrote the continue-watching and next-up episode rails using Kysely CTEs and optimized person filmography stats with aggregate queries.
- Added database indexes and optimized browse, auth, and session queries.

### Fixed

- Fixed a movie-credits response that incorrectly named a field as a show.
- Fixed an input-proxy drain-await hang on client disconnect and SFTP stream teardown race conditions, and extracted a shared byte-range parser.
- Fixed iOS Safari keeping its bottom browser toolbar visible by letting the document scroll instead of an inner container, and fixed the auth screen card centering/background under the collapsing toolbar using dynamic viewport units.

## 0.7.0 - 2026-07-12

### Added

- Added on-play IntroDB intro/recap/credits skip markers in playback responses via the official `theintrodb` client (TMDb lookup), with manual skip buttons in the web player ([TheIntroDB](https://theintrodb.org)).
- Added per-user segment skip preferences on Profile (`segmentSkipEnabled`, `segmentSkipAutomatic`) and in playback responses as `segmentSkip`, including optional automatic skipping in the web player.
- Added per-user Continue staleness filtering on Profile (`continueMaxAgeDays`, 0–3650 days), hiding idle in-progress items from Continue rails while keeping resume on detail pages.
- Continue rails now ignore accidental starts shorter than 60 seconds.
- Added scheduled TMDb metadata refresh settings for movies and TV shows, with separate hour-based intervals and staleness windows for admin-controlled background refreshes.
- Added optional `page` and `limit` query params (default limit 24) to browse, continue, discover, and similar APIs, with companion `*Page` metadata for every rail and continue section.
- Added paginated Continue section pages at `/continue/movies`, `/continue/episodes`, and `/continue/next-up`.

### Fixed

- Fixed an encode-coordinator reserved-job leak that could stall new encode reservations.
- Fixed a duplicate progress beacon firing when the player is destroyed.
- Fixed a catalog-search timer leak and aborted hung remote operations during metadata search.
- Fixed the Continue staleness cutoff to use ISO timestamps in SQL.
- Fixed the device-pairing expiry assertion for an optional seconds return type.

### Changed

- Playback prepare now loads segment skip preferences and IntroDB lookup metadata in parallel with the playback decision, and caches successful IntroDB responses for 24 hours.
- Replaced `PUT /api/profile/playback-preference` and `PUT /api/profile/continue-max-age` with a single partial-update `PATCH /api/profile` that returns an updated preferences snapshot, and aligned the playback cancel response shape.
- Documented Continue filtering for browse rails, transcoding admin settings, and `playback-cache` storage layout.
- Unified default catalog page size to 24 items. Web full-library pages still request 36 items per page.
- Continue hub and home rails now link to dedicated section list pages instead of relying on a single unpaginated `/continue` view.
- Replaced unsafe JSON body casts with zod validation across API routes.
- Made paired device API-key expiry and signed playback token TTL configurable via environment variables.
- Added a skip-to-content link and keyboard-navigation landmarks in the app shell for accessibility.
- Updated dependencies: SvelteKit 2.69.2, `@sveltejs/vite-plugin-svelte` 7.2.0, Vite 8.1.4, `@types/node` 24.13.3, `kysely` 0.29.3, `node-av` 6.1.1, `svelte-check` 4.7.2, `@lucide/svelte` 1.24.0, and `@ctrl/video-filename-parser` 5.11.1.
- Polished the web player: desktop seek-bar hover timestamp preview, reveal controls only after deliberate pointer movement, aligned control scrims, white control accents, and shared slider styling.

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

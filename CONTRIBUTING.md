# Contributing

Thanks for helping improve Lunarr. This guide covers the local workflow, checks, and review expectations for this repository.

## Local Setup

Lunarr uses Bun, SvelteKit, SQLite/libSQL, FFmpeg-backed playback, and NodeAV probing.

```sh
bun install
cp .env.example .env
```

Set `AUTH_SECRET` in `.env` to a stable random value with at least 32 characters. For normal app testing, start the dev server:

```sh
bun run dev
```

Open `http://127.0.0.1:5173`, create the first admin account, add a library, and scan it.

## Runtime Tools

Install FFmpeg locally if you work on playback, transcoding, stream routes, or related tests. The CI job installs FFmpeg before running the test suite.

Useful commands:

```sh
bun run verify:ffmpeg
bun run verify:nodeav
bun run smoke:transcode
```

If FFmpeg is installed somewhere outside `PATH`, set:

```sh
FFMPEG_PATH=/path/to/ffmpeg
```

Hardware acceleration checks are host-specific. Only run them on machines with the relevant device and driver exposed:

```sh
LUNARR_VERIFY_HARDWARE=vaapi bun run verify:runtime
FFMPEG_SMOKE_HARDWARE=vaapi bun run smoke:hardware
```

## Checks Before Submitting

Run the core checks before opening a pull request:

```sh
bun run check
bun run build
bun run test
```

For playback or transcoding changes, also run:

```sh
bun run verify:ffmpeg
bun run verify:nodeav
bun run smoke:transcode
```

For browser-player changes, run the relevant smoke tests:

```sh
bun run smoke:browser:player
bun run smoke:browser:seek
```

For TMDb or metadata connectivity work, verify against configured credentials:

```sh
bun run verify:tmdb
```

## Development Guidelines

- Keep changes scoped to the feature or bug being addressed.
- Keep code minimal and purposeful. Avoid speculative abstractions, broad rewrites, and cleanup that does not support the change.
- Prefer existing helpers, server modules, route patterns, and Svelte component conventions over new abstractions.
- Keep admin/configuration pages dense and utilitarian. Keep media browsing and detail pages more visual and content-led.
- Do not expose raw paths, scan errors, jobs, users, or settings to non-admin users.
- Prefer structured parsers and typed helpers over ad hoc string manipulation.
- Avoid committing generated local data, databases, playback artifacts, or media fixtures.
- Add or update tests when changing server behavior, playback/session logic, auth boundaries, scanner behavior, or storage contracts.
- AI-assisted contributions are welcome only when the contributor has reviewed, understood, and tested the result. Do not submit unreviewed generated code, vague "vibe coded" changes, or low-signal churn.

## Commit Hygiene

- Fork the repository and create a new branch for each contribution. Do not commit PR changes directly to your fork's primary branch, such as `main` or `master`.

```sh
git switch main
git pull --ff-only
git switch -c fix/playback-session-heartbeat
```

- Use a short branch name that describes the scope, such as `fix/cast-retarget-session`, `ui/movie-detail-files`, or `docs/contributing-workflow`. Push only that feature branch when opening a pull request:

```sh
git push -u origin fix/playback-session-heartbeat
```

- Do not put every change into one large commit when the work is broad.
- Split large changes into scoped commits that reviewers can understand independently, such as schema changes, server behavior, UI, tests, and docs.
- Keep each commit buildable and focused on one coherent purpose.
- Avoid mixing unrelated formatting, refactors, and behavior changes in the same commit.
- Use commit messages that describe what changed, not only that something was updated.

## Pull Request Checklist

- Describe the user-visible behavior change and any migration or configuration impact.
- Note which checks were run.
- Include screenshots or short screen recordings for meaningful UI changes.
- Mention any intentionally skipped checks and why.
- Keep unrelated formatting or cleanup out of behavioral PRs unless it directly supports the change.

## Security

Do not include real TMDb tokens, API keys, user credentials, media paths from private systems, or production secrets in issues, logs, screenshots, commits, or tests.

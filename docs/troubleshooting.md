# Troubleshooting

Practical recovery steps for common self-hosted deployment problems.

## Database location

Lunarr stores its SQLite database at `LUNARR_DATA_DIR/lunarr.db` (default `LUNARR_DATA_DIR=.lunarr` locally, `/var/lib/lunarr` in the Docker image). Stop the server before editing the database directly.

Open it with the `sqlite3` CLI:

```sh
sqlite3 "$LUNARR_DATA_DIR/lunarr.db"
```

## Locked out of the admin account

The first registered user becomes an admin, and admins can create or reset other accounts from **Users** in the admin console. If no admin can sign in, promote an existing account directly in the database:

```sql
update user set role = 'admin' where email = 'you@example.com';
```

Then restart Lunarr and sign in with that account. The server keeps at least one admin, so do not delete every admin row.

## Resetting a password

Passwords are managed by Better Auth and stored hashed in the `account` table. Do not hand-edit the `password` column. To recover access, promote an account to admin (above) and use the **Users** page to reset that user's password, or register a fresh account and promote it.

## Starting over

To wipe all data, stop the server and remove the data directory (the SQLite database, per-session HLS playlists under `playback-sessions`, and shared HLS segments under `playback-cache`). The next start recreates an empty database and the first sign-up becomes admin again.

## FFmpeg or playback failures

See [Transcoding Runtime](transcoding-runtime.md) for FFmpeg path, VAAPI device, and hardware smoke verification. The `bun run verify:ffmpeg` and `bun run verify:nodeav` commands confirm the runtime requirements during local checks.

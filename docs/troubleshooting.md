# Troubleshooting

Practical recovery steps for common self-hosted deployment problems.

## Database location

Lunarr stores its SQLite database at `LUNARR_DATA_DIR/lunarr.db` (default `LUNARR_DATA_DIR=.lunarr` locally, `/var/lib/lunarr` in the Docker image). Stop the server before editing the database directly.

Open it with the `sqlite3` CLI:

```sh
sqlite3 "$LUNARR_DATA_DIR/lunarr.db"
```

## Resetting a password

Lunarr stores credentials in the `account` table, managed by Better Auth, which hashes passwords with Node's `scrypt` (`N=16384`, `r=16`, `p=1`, `dkLen=64`) in the `salt:key` format (both halves hex, 16-byte salt). There is one `account` row per user with `provider_id = 'credential'`, linked by `user_id`.

### If another user account exists

If you are locked out of the only admin, or simply forgot a password, promote an existing account to admin and reset from the console:

```sql
update user set role = 'admin' where email = 'you@example.com';
```

Sign in with that account and use the admin **Users** page to set a new password for the locked-out user. The server keeps at least one admin, so do not delete every admin row.

### If no other user account exists

When there is no second account to promote, write a valid hash directly into the `account` table. Generate a hash for a new password (replace `ChangeMe!123`):

```sh
node -e "const {randomBytes,scrypt}=require('node:crypto');const pw='ChangeMe!123';const salt=randomBytes(16).toString('hex');scrypt(pw,salt,64,{N:16384,r:16,p:1,maxmem:128*16384*16*2},(e,k)=>{if(e)throw e;console.log(salt+':'+k.toString('hex'))})"
```

Stop the server and write the hash into the matching account row:

```sql
update account
set password = '998e731fce266631b50c8725eaf8d95d:3d29872b00276b055c450e54f7dce3fb25b96c48b1aafbea4f1f6638b7b3608b163c0ffc1ae5057b6663aed4617d35f21a9e99504dc5cd31c858f7689707ace9'
where provider_id = 'credential'
  and user_id = (select id from user where email = 'you@example.com');
```

The example hash above is the value for `ChangeMe!123` and is safe to use for testing. Sign in with the new password, then change it from the profile page.

## Starting over

To wipe all data, stop the server and remove the data directory (the SQLite database, per-session HLS playlists under `playback-sessions`, and shared HLS segments under `playback-cache`). The next start recreates an empty database and the first sign-up becomes admin again.

## FFmpeg or playback failures

See [Transcoding Runtime](transcoding-runtime.md) for FFmpeg path, VAAPI device, and hardware smoke verification. The `bun run verify:ffmpeg` and `bun run verify:nodeav` commands confirm the runtime requirements during local checks.

# Lunarr Transcoding Runtime

Lunarr uses NodeAV as its only media probing and transcoding backend. It does
not require `ffmpeg` or `ffprobe` binaries on `PATH`, and it should not fall
back to shelling out to those tools when NodeAV is unavailable.

## Runtime Requirements

- Install dependencies with Bun so the pinned `node-av` package is present.
- Run Lunarr on a platform supported by the installed NodeAV build.
- Keep temporary playback-session artifact storage on fast local disk. Generated HLS artifacts
  are stored under the configured Lunarr data directory in
  `playback-sessions/<sessionId>/` while the playback session exists.
- Local media files can be probed and transcoded directly.
- SFTP media files direct-play when browser-compatible. When duration, format,
  and a positive safe file size are known, files that require HLS can use
  request-driven segment generation through seekable SFTP range reads and
  NodeAV custom input callbacks. Adjacent remote input reads are served through
  a small bounded read-ahead buffer to reduce SFTP round trips during one segment
  generation. Seekable SFTP input setup, range stream creation, and range body
  reads are timeout-bounded so a stalled remote read fails the segment request
  clearly; storage handles or streams that resolve after timeout or
  cancellation are closed/destroyed. Truncated SFTP range reads fail instead of
  being treated as EOF. SFTP files that do not have enough duration, format, or
  size metadata for request-driven HLS fail clearly instead of staging the
  remote source.

## Playback Behavior

Direct play remains the default path. Lunarr starts HLS work only when the file
is not browser-compatible, or when the signed-in user chooses "prefer
transcoding" and global transcoding is enabled.
If an admin disables transcoding while an HLS session URL still exists, the HLS
playlist and segment routes return a disabled-transcoding error instead of
serving existing temporary HLS artifacts or generating missing segments.
HLS playlist and segment routes only serve sessions that are currently running
or inside the short same-session HLS artifact grace window. Queued sessions are
still treated as not ready even if a stale or malformed HLS artifact row exists.
The playback-session heartbeat endpoint follows the same policy and will not
keep an existing session alive while transcoding is disabled. If a heartbeat
arrives for an active session after transcoding has been disabled, Lunarr
cancels that session so backend work does not wait for the normal stale-session
cleanup.
The transcode manager checks the same policy before creating a new HLS session,
so direct manager callers cannot create queued/running transcode sessions after an
admin disables transcoding.
It also rechecks policy before starting backend work, so a setting change
during preparation fails the session instead of starting NodeAV work.
Request-driven HLS startup performs only cheap policy validation before
publishing the virtual playlist. It rechecks policy immediately before publish,
so a setting change during startup cannot expose a ready HLS URL.
If request-driven startup fails before the virtual playlist is published, Lunarr
removes the temporary session artifact directory before returning the failed
playback response.
The playback manager no longer has a normal or hidden linear HLS startup path.
Local and SFTP media that require HLS must use request-driven segment-window
generation or fail with a clear prerequisite error. SFTP playback no longer has
a full-source staging path for normal playback; remote media must use
request-driven range/custom-I/O input.
Saving the admin setting as disabled also cancels queued/running transcode
sessions immediately, so active backend work does not wait for idle cleanup.
Segment routes also recheck the current session state and policy after a
segment file is loaded or generated, just before returning it to the player.
That closes the race where an already-written segment could otherwise be served
after cancellation or after transcoding was disabled during the read.
Playlist routes apply the same post-read recheck before returning a playlist or
refreshing heartbeat, so a stale playlist response cannot keep playback alive
after cancellation or a policy change during the read.
Playlist and segment `HEAD` routes also recheck after reading filesystem
metadata. They still do not refresh heartbeat, trigger generation, read segment
bodies, or record segment consumption.
Playlist and segment `GET` routes also guard the final activity write. If the
session is cancelled after the post-read state check but before heartbeat or
segment-consumption state can be recorded, Lunarr rechecks session state and
returns the terminal session error instead of serving the stale response body.
Playlist and already-written segment file reads also receive the route request
cancellation signal, so a disconnected request cannot refresh heartbeat or
segment-consumption state after the client has gone away.
If that cancellation surfaces as a helper read error, playlist and segment
`GET` routes normalize it at the route boundary before any playback activity is
recorded.
If the HLS artifact path changes while a playlist or segment body or `HEAD`
metadata is being read, the route rejects the stale artifact with a
changed-session response and does not refresh heartbeat or segment-consumption
state.
Playlist and segment responses use `Cache-Control: no-store` so repeat HLS
requests continue to pass through the authenticated session and policy checks;
stable segment URLs are for player retry semantics, not browser-side reuse
after cancellation or a policy change.

When only the container is unsuitable for the browser, Lunarr tries Direct
Stream/remux before full transcoding. For example, a Matroska/MKV file with
H.264 video and AAC audio can be copied into HLS segments without decoding and
re-encoding the video. This still creates an ephemeral HLS session and uses the
same heartbeat, cancellation, and temporary cleanup behavior as full
transcoding.
Request-driven remux and full-transcode playback share the same virtual
playlist/session lifecycle. If request-driven remux segment generation fails,
Lunarr retries that same segment as a full transcode and switches the active
session to full transcode for later segment requests. The manager rechecks
session state and transcoding policy before starting that fallback, so
cancellation or disabled transcoding after the remux failure stops fallback
work before the full transcode encoder starts. After fallback generation
succeeds, switching the session from remux to transcode is also
active-session-only; if the session was cancelled before that mode switch, the
generated fallback segment is removed instead of being served from a stale
remux session. The watch page also responds to fatal remux HLS playback errors
by restarting near the current timestamp with an explicit full-transcode
override. That prevents repeated recovery attempts from choosing the same
failing remux path.

The first HLS implementation targets:

- H.264 video
- AAC audio
- HLS MPEG-TS segments
- 4 second segments

The default HLS segment duration is defined once in the HLS helper and reused
by request-driven virtual playlists and segment generation. Playlist `EXTINF`
windows and backend segment requests should not use separate hard-coded
durations.

Running HLS playback becomes available as soon as NodeAV has written a readable
playlist and initial segments. Ended playback artifacts are not reused by
default; new playback creates a new ephemeral session. Durable optimized media
can be a separate feature later, but live playback transcodes should remain
temporary.
The playable HLS artifact pointer for a session lives in `playback_hls_artifact.path`.
Normal playback does not have a separate `playback_session.output_path` pointer.
For duration-known local files and duration-known seekable SFTP files, Lunarr
skips the initial linear HLS run: it writes a virtual VOD playlist immediately
and lets segment requests generate bounded seek windows on demand. The current
NodeAV backend can publish the requested segment plus a small lookahead window
in one run, so the next adjacent browser request can reuse already-written
temporary HLS artifacts instead of starting another backend window.
Known-duration media that is eligible for request-driven HLS requires a backend
with bounded segment-window generation. If that backend capability is missing,
Lunarr fails the playback session clearly instead of silently starting a linear
compatibility path.
Duration-unknown local media fails clearly because a virtual VOD playlist cannot
safely map segment numbers to playback timestamps without a duration. SFTP media
uses request-driven range/custom-I/O only when duration, input format, and a
positive safe remote size are known. If any of those prerequisites are missing,
playback fails clearly instead of staging the remote source.
The requested segment is
published as soon as that first HLS fragment is closed; NodeAV can continue the
bounded lookahead run in the background while the route serves the requested
segment. SFTP request-driven generation reads byte ranges through the storage
adapter instead of first copying the whole remote source into temporary
playback-session artifact storage.
Before returning that virtual playlist as ready, Lunarr rechecks the current
transcode policy and rejects required-but-unimplemented hardware acceleration
without loading NodeAV modules. NodeAV availability is checked by the first
requested segment, so playlist startup stays metadata-fast.
Publishing a newly created HLS playlist is also active-session-only. If a user
or admin cancels the session while request-driven startup is still in flight,
Lunarr cancels pending work, removes temporary HLS artifacts, and does not
return a stale ready/preparing playback URL for that cancelled session.
When playback starts from saved progress, Lunarr passes that offset to NodeAV so
the HLS pipeline seeks near the resume position instead of transcoding from the
beginning first.
If the requested start is at or beyond a known media duration, Lunarr fails the
playback session before backend startup instead of falling back to
linear HLS work that cannot produce useful playback.
The watch route also accepts an explicit `start` query parameter. When that
parameter is present for HLS playback, Lunarr treats it as a reposition request:
every active session for the same user/file/mode at a different start point is
cancelled and replaced with, or reused as, a session near the requested
timestamp. This keeps rapid repeated seeks from leaving older HLS sessions
running behind the newest playback position.
The player uses that same path for large in-player HLS seeks. Small seeks stay
within the current playlist/session; large seeks navigate to the same watch page
with a new `start` value so the backend can restart the HLS pipeline near the
target time. Large HLS seeks are debounced briefly in the watch page so rapid
slider movement updates the pending reposition target; the latest requested
timestamp wins before the old playback session is cancelled and replaced.
After such a reposition, the browser media element starts at the beginning of
the new HLS playlist. Lunarr measures subsequent seek deltas in that player
timeline, then maps progress and future reposition requests back to the
original media timeline with the session start offset. This avoids treating a
small seek inside a repositioned playlist as another large seek.

The watch page polls while playback is preparing, then reloads into the HLS
player once the session is ready. The playback session can still be running
while the player consumes already-written segments.
If an HLS player error occurs after playback has started, the watch page
restarts playback near the current original-media timestamp. This supports
large seeks and also gives the current bounded-ahead prototype a recovery path
when the player reaches the end of a deliberately limited temporary segment
window.

Playlist and served segment `GET` requests refresh the session's playback
activity. Served segment `GET` requests also record the latest segment
name/index, which is the signal Lunarr uses for request-driven artifact cleanup
and seek-aware session recovery. Playlist and segment `HEAD` requests only
return metadata; they do not refresh playback heartbeat, generate missing
request-driven segments, read segment bodies, or count as playback consumption.
Segment routes only serve numbered HLS media fragments and HLS init artifacts;
playlists, diagnostics, unnumbered fragments, arbitrary `.mp4` files, and other
files in the temporary playback-session artifact directory are not served through the segment
endpoint.
Playlist responses canonicalize safe segment and init artifact URIs through the
authenticated segment route, including backend-written absolute paths or
external-looking segment URLs, so clients do not bypass Lunarr route policy.
Init artifacts can be served through the segment route, but they do not update
the latest consumed segment index used for cleanup and seek recovery.
Playlist `GET` refreshes heartbeat only after a playlist is successfully served,
so a missing temporary playlist cannot keep a broken session alive.
Ended playback transcodes remain temporary, and the route boundary enforces the
same short same-session HLS artifact grace window used by cleanup. Active
segment requests keep their artifacts from being expired while the same player is
still consuming them, but playlist-only traffic does not extend that grace.
Ended sessions can serve only already-written temporary segments; missing
segments do not restart generation from an ended session.
If transcoding is disabled while HLS routes are serving a playlist or segment,
the route returns the disabled-policy error and cancels the active playback
session immediately. That stops backend work and removes temporary HLS artifacts
instead of leaving the session running until heartbeat expiry.
The watch page maps the HLS stream timeline back to the original media timeline
when saving progress.
After a segment is served, Lunarr prunes older segment files behind the active
playback window. This keeps active-session disk use bounded while preserving a
small back-seek/retry window for the player.
Heartbeat alone is not enough to keep a ready HLS pipeline alive forever. Once
a playlist artifact exists, Lunarr expects recent segment requests too. If the page
continues heartbeating but the player stops requesting segments, the cleanup
loop cancels the playback session and removes its temporary HLS artifacts so a
paused or stuck browser does not keep backend generation running in the
background.
Request-driven sessions can have sparse temporary segment files after seeks or
retries, and those files are not treated as proof that a background encoder has
run too far ahead.
Concurrent requests for the same segment share one in-flight segment load, so a
player retry or duplicate browser request does not trigger duplicate disk work.
The same route boundary now supports request-driven segment generation: if a
segment is missing and the configured backend can generate a bounded window
starting at that segment, Lunarr coalesces duplicate generation requests and
then retries serving the segment. The current NodeAV backend implements this as
a temporary bounded-window HLS run: it seeks near the requested segment start,
publishes the requested segment as soon as the first fragment is closed, keeps
publishing the small lookahead window in the background, then deletes the
temporary work directory.
Generation for different missing segments is serialized per playback session.
That keeps one HLS player from starting several NodeAV segment encoders at the
same time when it prefetches adjacent segments. Before queued generation work
invokes NodeAV, Lunarr rechecks whether the segment appeared while it was
waiting and serves that file instead. If the session became failed or cancelled
while the queued request was waiting, the queued request returns the stored
terminal transcode error instead of falling through as a generic missing
segment.
Large seeks do not wait behind stale request-driven work from the old playback
position. The manager tracks the active bounded segment window for each
playback session; when a new canonical segment request is clearly outside that
nearby window, it aborts the older setup/generation, cancels pending lookahead
and queued stale segment waiters for that session, and starts work near the new
segment instead. Adjacent requests inside the current bounded window still share
the existing generation/lookahead path.
Active request-driven NodeAV segment generation is also registered with backend
cancellation. If a session is cancelled or expires while a segment is being
generated, Lunarr aborts that segment encoder immediately instead of leaving it
running until the segment timeout. The manager also rechecks session status and
the current transcoding policy after the backend returns, before reporting
generation success. A backend that finishes after the session was cancelled, or
after an admin disabled transcoding, cannot make the stale route request serve
the newly written segment or mark it as consumed. If a generated segment appears
but the request is then rejected because the session was cancelled, policy was
disabled, or the generation otherwise fails, Lunarr removes that requested
segment file from the temporary session artifacts.
The same cancellation signal is passed into bounded-window backend startup, so
request cancellation can stop NodeAV status/module-load preparation before the
window is registered as an active backend generation.
If that cancellation wins while NodeAV modules are still loading, Lunarr clears
the pending module-load state so the next playback attempt can retry backend
initialization instead of waiting on a cancelled startup.
The segment route also passes HTTP request cancellation into request-driven
generation. If a client disconnects while a missing segment is being prepared,
Lunarr aborts that in-flight setup/generation and leaves the playback session
running so a later player retry can request the segment again.
Duplicate requests for the same missing segment share one backend generation
window, but cancellation is tracked per request. If one duplicate request
disconnects while another request is still waiting, Lunarr keeps the shared
generation alive for the active waiter; if all waiters disconnect, the shared
generation is aborted.
The same per-request cancellation rule applies while a route is waiting for a
bounded lookahead segment that another request already started. A disconnected
request stops waiting, but the shared lookahead can still finish and satisfy a
later retry.
The session state that records latest consumed segment uses the same strict HLS
segment parser as the route boundary. Arbitrary `.mp4` names or other
segment-like filenames cannot update playback consumption or keep completed
temporary HLS artifacts alive.
For request-driven sessions, the playlist maps deterministic segment names to
fixed time windows from the session start offset. When media duration is known,
Lunarr refuses segment numbers outside that duration before invoking NodeAV, so
arbitrary segment URLs cannot make the encoder seek far beyond the playable
window. Request-driven generation requires known duration; duration-unknown HLS
sessions do not generate arbitrary missing segments from URL input.
Explicit virtual playlist requests still require the temporary playlist artifact
to exist before the route responds or refreshes heartbeat. Completed temporary
sessions serve only their existing playlist and segment files; they do not
synthesize a new virtual playlist.
Missing-segment generation only accepts canonical virtual segment names from
the playlist, so alternate aliases for the same segment number cannot create
extra temporary HLS artifacts. Request-driven NodeAV seek windows reset encoded
video and audio timestamps onto the session-relative HLS timeline, so the
virtual playlist does not insert artificial discontinuities between normal
contiguous VOD segments. It intentionally does not advertise
`EXT-X-INDEPENDENT-SEGMENTS` for the virtual request-driven playlist until
keyframe alignment is proven across the supported sources/codecs. The final
segment request is also clamped to the remaining duration so the backend request
matches the `EXTINF` duration advertised by the virtual playlist. Request-driven
segment work has an explicit backend timeout. When the backend supports bounded
window generation, the manager requests the missing segment and a small number
of near-future canonical segments, bounded by known media duration. Generated
segment files are copied into place through a temporary file plus rename so the
segment route does not expose partially copied artifact. Before each rename,
Lunarr asks NodeAV to probe the generated segment and verifies that it contains
a video stream, contains at least one video packet, starts with a video
keyframe, has monotonic comparable video decode timestamps over the first
bounded packet sample, keeps comparable video timestamp span within a bounded
envelope, and has a duration within a bounded envelope for that virtual
segment's advertised duration. Normal-length request-driven segments must have
at least two comparable video packet timestamps; container duration alone is
not enough evidence to publish the segment. If the scanned source file reports
an audio codec, the same validation also requires a probeable audio stream in
each published request-driven segment.
The requested segment does not wait for the whole lookahead window to finish:
once it is validated and published, the route can respond while the same
tracked NodeAV run continues publishing near-future segments until the bounded
window is complete, cancelled, or timed out. The NodeAV backend returns that
background completion to the manager, so SFTP custom-I/O handles and adjacent
lookahead waiters are tied to the real backend window lifecycle. The shared
transcode backend contract now exposes request-driven generation through the
bounded-window method only; it no longer has a separate exact single-segment
generation hook. The manager also tracks those expected lookahead segments
briefly, so an adjacent browser request waits for the already-running lookahead
artifacts before starting another seek-window run.
After that wait, the manager rechecks session state and transcode policy before
falling back to another backend run, so cancellation or disabled transcoding
during the wait surfaces as a controlled playback error instead of duplicate
generation. Session cancellation aborts those pending lookahead waiters
immediately and clears pending request-driven segment queue state for that
session, so an adjacent segment request does not sit until the lookahead timeout
after the playback session is cancelled. The waiter also checks session state
and the current transcode policy while it waits, so a disabled policy wakes the
adjacent request even before the active-session cancellation step runs.
If segment generation fails, discovers an inactive session, or marks a session
failed because transcoding was disabled, Lunarr also aborts pending lookahead
waiters and backend segment work for that session immediately. That prevents
stale adjacent segment requests from waiting on a bounded window that can no
longer publish useful artifacts, and prevents the NodeAV window from continuing
after the route has already rejected the generated segment.
Nested stale-state checks share one stop operation per segment request, so a
single cancelled or disabled request does not repeatedly call into backend
cancellation while unwinding.
To keep that coordination cheap, the waiter polls for the expected segment file
more frequently than it polls SQLite-backed session/policy state; explicit
cancellation still wakes it immediately through an abort signal. If the backend
lookahead completion settles without producing an expected adjacent segment,
the waiter wakes early and the request can start its own bounded window instead
of waiting for the full lookahead timeout.
For SFTP-backed request-driven windows, the manager keeps the seekable remote
input source open until the backend's background lookahead completion settles.
That prevents early-return playback from closing the SFTP handle while NodeAV is
still reading near-future segments.
The validation path also rejects invalid segment-generation requests that do
not provide a positive expected segment duration, so caller bugs do not silently
skip duration checks.
The real-media smoke script reports both requested-segment-ready time and full
bounded-window completion time for regular file input and custom-I/O input, so
latency regressions in the request-driven path are visible during manual
verification. Its late-seek checks also assert that skipped intermediate
segments are absent, proving the backend generated the requested far window
instead of linearly filling every segment before the seek target.
Normal multi-second requests also reject extremely short artifacts so a failed
one-window run is not published as a playable segment; short final segments
remain allowed. If request-driven generation fails, publishes an unreadable or
wildly mismatched segment, returns without publishing the requested segment, or
marks the session failed, the segment route returns the stored transcode error
with a conflict response instead of hiding it as a generic missing segment.
If a missing segment cannot be generated because session state or transcoding
policy changed after the route's initial authorization check, the route rechecks
state before returning a missing-segment 404. Disabled sessions cancel active
playback work and failed sessions surface as controlled playback errors.
If the backend throws after transcoding is disabled mid-generation, the disabled
policy error takes precedence over the backend error so the Jobs page and player
show the actual administrative stop condition.
This same contract applies after a remux segment failure falls back to full
transcode: the fallback must publish the requested segment or the session is
marked failed with the combined remux/fallback error. If fallback generation
writes the requested segment but then fails because transcoding was disabled,
that temporary fallback segment is removed before the disabled-policy error is
reported. The next step is to
harden timestamp drift and seek
behavior enough to treat this as production-ready across more sources and
codecs.

Queued or running playback sessions can be cancelled from the Jobs page. A
watch page sends a heartbeat while HLS playback is preparing or playing, and
asks the server to cancel its playback session when the user leaves the page.
The Jobs page labels playback sessions as request-driven or pending. There is
no runtime linear-fallback pipeline label; the compatibility helper is kept out
of normal playback state.
The watch page also cancels the current playback session when navigating to the
same watch route with different query parameters, such as a different file or
start position. Client-side cancellation is deduplicated per session so seek
recovery and navigation cleanup do not send repeated cancel requests for the
same playback session.
Cancelled or stale sessions are marked clearly and partial temporary HLS
artifacts are removed.

## Restart Recovery

On server startup, Lunarr reconciles interrupted transcode sessions:

- Active sessions are marked failed with a restart interruption message.
- Temporary session artifacts under the Lunarr data directory are removed, and the
  HLS artifact pointer is cleared from the database.
- Completed, failed, and cancelled temporary artifacts are eligible for age and
  size-based cleanup. Completed playback artifacts use a short grace period;
  failed/cancelled diagnostics can remain longer. Live playback transcodes are
  temporary session data, not reusable optimized media.

While the server is running, active sessions with no recent playback heartbeat
are cancelled and their temporary HLS artifacts are removed. Ready HLS sessions
with no recent segment consumption are also cancelled, even if the page
heartbeat still arrives. Running HLS sessions that generate too many segments
ahead of the last consumed segment are stopped and left as temporary playable
artifacts for the current session. The same cleanup loop also prunes running
HLS segment files behind the last consumed playback segment, periodically
removes old inactive artifacts, clears their HLS artifact pointers, and prunes
the oldest inactive session directories when the temporary playback-session artifact store
exceeds its size cap.

## Hardware Acceleration

Admins can configure the hardware acceleration preference in settings. The
stable baseline is NodeAV software H.264/AAC encoding.

Current behavior:

- `off` uses software encoding.
- Non-`off` hardware modes are accepted as policy values.
- If hardware is required, playback fails clearly because hardware HLS encoding
  is not implemented yet.
- If hardware is not required, Lunarr uses the software path.

## Troubleshooting

Run a real local NodeAV smoke test with:

```bash
bun run smoke:transcode
```

By default it uses the playable sample directory created by the Radarr fixture
seeder. To test a specific file:

```bash
bun run smoke:transcode -- --input /path/to/video.mp4
```

To require audio preservation coverage, pass an audio-bearing file and enable
the audio gate:

```bash
bun run smoke:transcode -- --input /path/to/video-with-audio.mp4 --require-audio
```

For a small public H.264 + AAC fixture, download SampleFile.com's
`mp4_h264_aac_360p_sample.mp4` into the local ignored fixture directory:

```bash
mkdir -p .lunarr/fixtures/transcode
curl -L -o .lunarr/fixtures/transcode/mp4_h264_aac_360p_sample.mp4 \
  https://samplefile.com/samples/download/video/mp4/mp4_h264_aac_360p_sample.mp4/
bun run smoke:transcode -- --input .lunarr/fixtures/transcode/mp4_h264_aac_360p_sample.mp4 --require-audio
```

The smoke script can also scan a directory and pick the first probeable file
that satisfies the requested gate:

```bash
bun run smoke:transcode -- --input-dir /path/to/media --require-audio
```

If playback says NodeAV failed to load, verify the pinned dependencies were
installed and the host platform can load the NodeAV native package. Lunarr does
not try to repair this by discovering `ffmpeg` or `ffprobe` on `PATH`; NodeAV
backend failures should stay explicit.

If playback stays in "preparing", check the Jobs page. Playback sessions show
the latest session status, pipeline, and backend error message.

The smoke test probes the first generated compatibility-HLS segment, runs a real
HLS remux pass, asks NodeAV to generate an initial and later seek-window
request-driven HLS segment from a local file, and repeats those request-driven
windows through a seekable custom-I/O input source. The JSON report includes
requested-segment ready time, full bounded-window completion time, lookahead
segment sizes, and a boolean showing that the requested segment was available no
later than the full lookahead window completion for each window. When the input
has audio, the smoke test also requires the generated compatibility-helper,
remux, local request-driven, and custom-I/O segments to preserve a probeable
audio stream. That gives backend coverage for NodeAV's lower-level HLS helper,
Direct Stream/remux, repeated local request-driven generation, and repeated
seekable SFTP-style input windows; normal playback does not call the
compatibility helper.

If a transcode playlist or segment returns 404, the temporary session artifacts were
likely removed or the session expired. Retry playback to start a new session.

If a duration-known file from an SFTP library needs transcoding, the request
driven path opens seekable SFTP range reads as NodeAV asks for input. It still
writes short-lived HLS segment artifacts locally, but it does not stage the full
remote source first.
If the remote input cannot be opened for request-driven generation, Lunarr marks
the playback session failed and returns the stored error from the segment route
instead of hiding the failure as a missing segment.
Seekable SFTP input setup, range stream creation, and range body reads use
explicit operation timeouts; if the remote server stalls, the active playback
session is marked failed and the player receives the stored timeout error
instead of waiting indefinitely. If a timed-out setup or stream creation later
resolves, Lunarr closes/destroys that late resource.
Input setup and range stream creation also listen to cancellation signals, so
session cancellation does not wait for the full remote operation timeout before
unwinding. A storage handle or stream that resolves after cancellation is
closed or destroyed.
If a range read returns fewer bytes than requested before the expected end of
file, Lunarr fails the segment request instead of passing a short EOF-like
buffer to NodeAV.

If an SFTP file does not have enough duration, format, or size information for
a virtual request-driven playlist, Lunarr fails playback with a clear
prerequisite error. It does not download a temporary full-source copy into the
transcode work area for normal playback. Keep the data directory on fast local
storage for temporary HLS segment artifacts, and check the Jobs page if remote
range reads fail.

The seekable SFTP path keeps only one in-memory read-ahead window per active
input source. This is meant to smooth normal sequential demuxer reads without
turning remote playback into a large memory buffer.

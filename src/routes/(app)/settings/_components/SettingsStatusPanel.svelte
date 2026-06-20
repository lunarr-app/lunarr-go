<script lang="ts">
  import { formatDateTime, formatGibibytes } from "$lib/media/format";

  let {
    signupOpen,
    version,
    playbackSessionArtifactMaxBytes,
    playbackCacheTtlHours,
    status,
  }: {
    signupOpen: boolean;
    version: string;
    playbackSessionArtifactMaxBytes: number;
    playbackCacheTtlHours: number;
    status: {
      libraries: number;
      movies: number;
      shows: number;
      activeScanJobs: number;
      playbackCacheBytes: number;
      playbackCacheEntries: number;
      playbackCacheActiveRefs: number;
      playbackCacheIdleEntries: number;
      dataDir: string;
      dbFile: string;
      episodes: number;
      matchedMovies: number;
      moviesWithPosters: number;
      matchedShows: number;
      showsWithPosters: number;
      matchedEpisodes: number;
      mediaFiles: number;
      scanJobs: number;
      scanErrors: number;
      lastScan:
        | {
            status: string;
            finished_at: string | null;
            created_at: string;
          }
        | null
        | undefined;
    };
  } = $props();
</script>

<section class="ops-panel status-panel">
  <div class="ops-panel-header">
    <div>
      <h2>Server status</h2>
      <p class="muted">Library, scan, and storage counts.</p>
    </div>
  </div>

  <div class="ops-panel-body">
    <div class="status-cards" aria-label="Server summary">
      <div class="ops-stat-card">
        <span>Registration</span><strong>{signupOpen ? "Open" : "Closed"}</strong>
      </div>
      <div class="ops-stat-card">
        <span>Libraries</span><strong>{status.libraries}</strong>
      </div>
      <div class="ops-stat-card">
        <span>Movies</span><strong>{status.movies}</strong>
      </div>
      <div class="ops-stat-card">
        <span>Shows</span><strong>{status.shows}</strong>
      </div>
      <div class="ops-stat-card">
        <span>Active scans</span><strong>{status.activeScanJobs}</strong>
      </div>
      <div class="ops-stat-card">
        <span>HLS cache</span><strong>{formatGibibytes(status.playbackCacheBytes)}</strong>
      </div>
    </div>

    <dl class="ops-status-dl">
      <div>
        <dt>HLS cache entries</dt>
        <dd>
          {status.playbackCacheEntries} ({status.playbackCacheActiveRefs} active refs, {status.playbackCacheIdleEntries}
          idle)
        </dd>
      </div>
      <div>
        <dt>HLS cache limits</dt>
        <dd>
          {formatGibibytes(playbackSessionArtifactMaxBytes)} cap, {playbackCacheTtlHours}h idle TTL
        </dd>
      </div>
      <div>
        <dt>Version</dt>
        <dd>{version}</dd>
      </div>
      <div>
        <dt>Data directory</dt>
        <dd>{status.dataDir}</dd>
      </div>
      <div>
        <dt>Database</dt>
        <dd>{status.dbFile}</dd>
      </div>
      <div>
        <dt>Playable episodes</dt>
        <dd>{status.episodes}</dd>
      </div>
      <div>
        <dt>Movie metadata</dt>
        <dd>{status.matchedMovies} / {status.movies} matched</dd>
      </div>
      <div>
        <dt>Movie posters</dt>
        <dd>{status.moviesWithPosters} / {status.movies}</dd>
      </div>
      <div>
        <dt>TV show metadata</dt>
        <dd>{status.matchedShows} / {status.shows} matched</dd>
      </div>
      <div>
        <dt>TV show posters</dt>
        <dd>{status.showsWithPosters} / {status.shows}</dd>
      </div>
      <div>
        <dt>Episode metadata</dt>
        <dd>{status.matchedEpisodes} / {status.episodes} matched</dd>
      </div>
      <div>
        <dt>Media files</dt>
        <dd>{status.mediaFiles}</dd>
      </div>
      <div>
        <dt>Scan jobs</dt>
        <dd>{status.scanJobs}</dd>
      </div>
      <div>
        <dt>Scan errors</dt>
        <dd>{status.scanErrors}</dd>
      </div>
      <div>
        <dt>Last scan</dt>
        <dd>
          {status.lastScan
            ? `${status.lastScan.status} - ${formatDateTime(status.lastScan.finished_at ?? status.lastScan.created_at, { fallback: "never" })}`
            : "Never"}
        </dd>
      </div>
    </dl>
  </div>
</section>

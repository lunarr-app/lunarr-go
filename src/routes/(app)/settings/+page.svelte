<script lang="ts">
  import { formatDateTime, formatGibibytes } from "$lib/media/format";
  import { RefreshCw, Save, ScanSearch, SearchCheck, Trash2, Wrench } from "@lucide/svelte";

  let { data, form } = $props();

  let registrationForm: HTMLFormElement | null = $state(null);
  let transcodingForm: HTMLFormElement | null = $state(null);
  let signupOpen = $state(false);
  let tmdbAccessToken = $state("");
  let tmdbApiKey = $state("");
  let clearTmdbAccessToken = $state(false);
  let clearTmdbApiKey = $state(false);
  let transcodingEnabled = $state(true);
  let hardwareAcceleration = $state("off");
  let hardwareAccelerationRequired = $state(false);
  let transcodeQualityPreset = $state("auto");
  let encodeAheadSegmentCount = $state(4);
  let playbackCacheTtlHours = $state(24);

  const metadataChanged = $derived(
    tmdbAccessToken.trim().length > 0 || tmdbApiKey.trim().length > 0 || clearTmdbAccessToken || clearTmdbApiKey,
  );

  $effect(() => {
    signupOpen = data.signupOpen;
    transcodingEnabled = data.transcodePolicy.transcodingEnabled;
    hardwareAcceleration = data.transcodePolicy.hardwareAcceleration;
    hardwareAccelerationRequired = data.transcodePolicy.hardwareAccelerationRequired;
    transcodeQualityPreset = data.transcodePolicy.transcodeQualityPreset;
    encodeAheadSegmentCount = data.encodeAheadSegmentCount;
    playbackCacheTtlHours = data.playbackCacheTtlHours;
  });

  function submitRegistration() {
    registrationForm?.requestSubmit();
  }

  function submitTranscoding() {
    transcodingForm?.requestSubmit();
  }
</script>

<svelte:head>
  <title>Settings - Lunarr</title>
  <meta
    name="description"
    content="Configure Lunarr server settings, metadata credentials, library scans, and instance status."
  />
</svelte:head>

<div class="ops-page-header">
  <div>
    <h1>Settings</h1>
    <p class="muted">Server configuration for this self-hosted Lunarr instance.</p>
  </div>
</div>

<div class="settings-grid">
  <section class="left-column" aria-label="Access and metadata settings">
    <form class="ops-panel" method="POST" action="?/saveRegistration" bind:this={registrationForm}>
      <div class="ops-panel-header">
        <div>
          <h2>User registration</h2>
          <p class="muted">New account creation.</p>
        </div>
      </div>

      <div class="ops-panel-body">
        <label class="switch-row">
          <span>
            <strong>Allow new users</strong>
            <small>{signupOpen ? "Registration open" : "Registration closed"}</small>
          </span>
          <span class="switch">
            <input type="checkbox" name="signupOpen" bind:checked={signupOpen} onchange={submitRegistration} />
            <span class="switch-track" aria-hidden="true"></span>
          </span>
        </label>
        <p class="muted detail-copy">
          Existing users and admins are unaffected when registration is disabled. Manage per-library sharing from
          Libraries.
        </p>

        {#if form?.registrationError}
          <p class="error">{form.registrationError}</p>
        {/if}
      </div>
    </form>

    <section class="ops-panel" aria-label="Transcoding settings">
      <div class="ops-panel-header">
        <div>
          <h2>Transcoding</h2>
          <p class="muted">Temporary HLS playback policy.</p>
        </div>
      </div>

      <form method="POST" action="?/saveTranscoding" bind:this={transcodingForm}>
        <div class="ops-panel-body">
          <label class="switch-row">
            <span>
              <strong>Allow transcoding</strong>
              <small>{transcodingEnabled ? "Unsupported files can use HLS playback" : "Direct play only"}</small>
            </span>
            <span class="switch">
              <input
                type="checkbox"
                name="transcodingEnabled"
                bind:checked={transcodingEnabled}
                onchange={submitTranscoding}
              />
              <span class="switch-track" aria-hidden="true"></span>
            </span>
          </label>

          <label>
            Hardware acceleration
            <select name="hardwareAcceleration" bind:value={hardwareAcceleration} onchange={submitTranscoding}>
              <option value="off">Off</option>
              <option value="auto">Auto</option>
              <option value="videotoolbox">VideoToolbox</option>
              <option value="vaapi">VAAPI</option>
              <option value="qsv">Intel Quick Sync</option>
              <option value="nvenc">NVIDIA NVENC</option>
              <option value="amf">AMD AMF</option>
            </select>
          </label>

          <label>
            HLS quality
            <select name="transcodeQualityPreset" bind:value={transcodeQualityPreset} onchange={submitTranscoding}>
              <option value="auto">Auto</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="original">Original resolution</option>
            </select>
          </label>

          <label>
            Temporary transcode storage
            <select name="playbackSessionArtifactMaxBytes" onchange={submitTranscoding}>
              {#each data.playbackSessionArtifactMaxBytesOptions as bytes}
                <option value={bytes} selected={bytes === data.playbackSessionArtifactMaxBytes}>
                  {formatGibibytes(bytes)}
                </option>
              {/each}
            </select>
          </label>

          <label>
            Encode-ahead segments
            <input
              type="number"
              name="encodeAheadSegmentCount"
              min="1"
              max="16"
              bind:value={encodeAheadSegmentCount}
              onchange={submitTranscoding}
            />
          </label>

          <label>
            Shared HLS cache TTL (hours)
            <input
              type="number"
              name="playbackCacheTtlHours"
              min="1"
              step="1"
              bind:value={playbackCacheTtlHours}
              onchange={submitTranscoding}
            />
          </label>

          <label class="check subdued">
            <input
              type="checkbox"
              name="hardwareAccelerationRequired"
              bind:checked={hardwareAccelerationRequired}
              disabled={hardwareAcceleration === "off"}
              onchange={submitTranscoding}
            />
            <span>Require hardware acceleration, fail if not available.</span>
          </label>

          <p class="muted detail-copy">
            Direct play stays first. Transcoding uses temporary FFmpeg HLS sessions when the browser cannot play a file
            directly or the user prefers HLS. HLS quality controls FFmpeg transcode resolution and bitrate, and Auto
            keeps the current server default. Encoded HLS segments are cached under LUNARR_DATA_DIR/playback-cache and
            reused across sessions, and per-session playlists live under playback-sessions. Encode-ahead limits how many
            segments FFmpeg may generate beyond the current playhead. Hardware acceleration is best-effort unless
            required, and playback fails if FFmpeg cannot use the selected device or H.264 encoder.
          </p>

          {#if form?.transcodingError}
            <p class="error">{form.transcodingError}</p>
          {/if}
        </div>
      </form>

      <div class="ops-panel-body transcoding-cleanup">
        <div class="action-row transcoding-action-row">
          <div class="action-copy">
            <h3>Force cleanup</h3>
            <p class="muted">
              Clear idle shared HLS segments and expired session artifacts immediately, ignoring cache TTL and storage
              limits. Active playback is preserved.
            </p>
            {#if form?.playbackCleanupError}
              <p class="error">{form.playbackCleanupError}</p>
            {/if}
            {#if form?.playbackCleanupMessage}
              <p>{form.playbackCleanupMessage}</p>
            {/if}
          </div>
          <form method="POST" action="?/cleanupPlaybackArtifacts">
            <button type="submit" class="secondary compact-action">
              <Trash2 size={16} aria-hidden="true" />
              Force cleanup
            </button>
          </form>
        </div>
      </div>
    </section>

    <form class="ops-panel" method="POST" action="?/saveMetadata">
      <div class="ops-panel-header">
        <div>
          <h2>TMDb metadata</h2>
          <p class="muted">Movie and TV metadata lookup.</p>
        </div>
      </div>

      <div class="ops-panel-body">
        <p class="muted detail-copy">
          Provide either a TMDb read access token or an API key; both are not required. A read access token is
          preferred.
        </p>

        <label>
          TMDb access token
          <input
            name="tmdbAccessToken"
            type="text"
            bind:value={tmdbAccessToken}
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder={data.tmdbAccessTokenConfigured ? "Configured" : "Read access token"}
          />
        </label>

        {#if data.tmdbAccessTokenSaved}
          <label class="check subdued">
            <input type="checkbox" name="clearTmdbAccessToken" bind:checked={clearTmdbAccessToken} />
            <span>Clear saved TMDb access token</span>
          </label>
        {/if}

        <label>
          TMDb API key
          <input
            name="tmdbApiKey"
            type="text"
            bind:value={tmdbApiKey}
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder={data.tmdbApiKeyConfigured ? "Configured" : "API key"}
          />
        </label>

        {#if data.tmdbApiKeySaved}
          <label class="check subdued">
            <input type="checkbox" name="clearTmdbApiKey" bind:checked={clearTmdbApiKey} />
            <span>Clear saved TMDb API key</span>
          </label>
        {/if}

        {#if form?.metadataSaveError}
          <p class="error">{form.metadataSaveError}</p>
        {/if}
        <button disabled={!metadataChanged}>
          <Save size={16} aria-hidden="true" />
          Save metadata
        </button>
      </div>
    </form>
  </section>

  <section class="ops-panel maintenance-panel" aria-label="Settings actions">
    <div class="ops-panel-header">
      <div>
        <h2>Actions</h2>
        <p class="muted">Checks, metadata repair, and scans.</p>
      </div>
    </div>

    <div class="ops-panel-body">
      {#if !data.tmdbConfigured}
        <p class="muted action-note">TMDb actions need metadata credentials.</p>
      {/if}

      <div class="action-row">
        <div class="action-copy">
          <h3>TMDb connection</h3>
          <p class="muted">Validate the active credential.</p>
          {#if form?.tmdbTestMessage}
            <p class:error={form.tmdbTestOk === false}>
              {form.tmdbTestMessage}
            </p>
          {/if}
        </div>
        <form method="POST" action="?/testTmdb">
          <button class="secondary compact-action">
            <SearchCheck size={16} aria-hidden="true" />
            Test
          </button>
        </form>
      </div>

      <div class="action-row">
        <div class="action-copy">
          <h3>Metadata repair</h3>
          <p class="muted">Refresh stored TMDb data.</p>
          <div class="action-messages">
            {#if form?.metadataError}
              <p class="error">{form.metadataError}</p>
            {/if}
            {#if form?.metadataMessage}
              <p>{form.metadataMessage}</p>
            {/if}
            {#if form?.tvMetadataError}
              <p class="error">{form.tvMetadataError}</p>
            {/if}
            {#if form?.tvMetadataMessage}
              <p>{form.tvMetadataMessage}</p>
            {/if}
          </div>
        </div>
        <div class="button-group">
          <form method="POST" action="?/refreshMetadata">
            <button class="secondary compact-action" disabled={!data.tmdbConfigured}>
              <RefreshCw size={16} aria-hidden="true" />
              Movies
            </button>
          </form>
          <form method="POST" action="?/refreshTvMetadata">
            <button class="secondary compact-action" disabled={!data.tmdbConfigured}>
              <RefreshCw size={16} aria-hidden="true" />
              TV
            </button>
          </form>
        </div>
      </div>

      <div class="action-row">
        <div class="action-copy">
          <h3>Library scans</h3>
          <p class="muted">Detect file additions, changes, and removals.</p>
          {#if form?.scanError}
            <p class="error">{form.scanError}</p>
          {/if}
          {#if form?.scanMessage}
            <p>{form.scanMessage}</p>
          {/if}
        </div>
        <form method="POST" action="?/scanAll">
          <button class="secondary compact-action">
            <ScanSearch size={16} aria-hidden="true" />
            Scan all
          </button>
        </form>
      </div>

      <div class="action-row">
        <div class="action-copy">
          <h3>Media probes</h3>
          <p class="muted">Backfill duration and codec details for playback.</p>
          {#if form?.probeError}
            <p class="error">{form.probeError}</p>
          {/if}
          {#if form?.probeMessage}
            <p>{form.probeMessage}</p>
          {/if}
        </div>
        <form method="POST" action="?/repairMediaProbes">
          <button class="secondary compact-action">
            <Wrench size={16} aria-hidden="true" />
            Repair
          </button>
        </form>
      </div>
    </div>
  </section>
</div>

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
        <span>Registration</span><strong>{data.signupOpen ? "Open" : "Closed"}</strong>
      </div>
      <div class="ops-stat-card">
        <span>Libraries</span><strong>{data.status.libraries}</strong>
      </div>
      <div class="ops-stat-card">
        <span>Movies</span><strong>{data.status.movies}</strong>
      </div>
      <div class="ops-stat-card">
        <span>Shows</span><strong>{data.status.shows}</strong>
      </div>
      <div class="ops-stat-card">
        <span>Active scans</span><strong>{data.status.activeScanJobs}</strong>
      </div>
      <div class="ops-stat-card">
        <span>HLS cache</span><strong>{formatGibibytes(data.status.playbackCacheBytes)}</strong>
      </div>
    </div>

    <dl>
      <div>
        <dt>HLS cache entries</dt>
        <dd>
          {data.status.playbackCacheEntries} ({data.status.playbackCacheActiveRefs} active refs, {data.status
            .playbackCacheIdleEntries}
          idle)
        </dd>
      </div>
      <div>
        <dt>HLS cache limits</dt>
        <dd>
          {formatGibibytes(data.playbackSessionArtifactMaxBytes)} cap, {data.playbackCacheTtlHours}h idle TTL
        </dd>
      </div>
      <div>
        <dt>Version</dt>
        <dd>{data.version}</dd>
      </div>
      <div>
        <dt>Data directory</dt>
        <dd>{data.status.dataDir}</dd>
      </div>
      <div>
        <dt>Database</dt>
        <dd>{data.status.dbFile}</dd>
      </div>
      <div>
        <dt>Playable episodes</dt>
        <dd>{data.status.episodes}</dd>
      </div>
      <div>
        <dt>Movie metadata</dt>
        <dd>{data.status.matchedMovies} / {data.status.movies} matched</dd>
      </div>
      <div>
        <dt>Movie posters</dt>
        <dd>{data.status.moviesWithPosters} / {data.status.movies}</dd>
      </div>
      <div>
        <dt>TV show metadata</dt>
        <dd>{data.status.matchedShows} / {data.status.shows} matched</dd>
      </div>
      <div>
        <dt>TV show posters</dt>
        <dd>{data.status.showsWithPosters} / {data.status.shows}</dd>
      </div>
      <div>
        <dt>Episode metadata</dt>
        <dd>{data.status.matchedEpisodes} / {data.status.episodes} matched</dd>
      </div>
      <div>
        <dt>Media files</dt>
        <dd>{data.status.mediaFiles}</dd>
      </div>
      <div>
        <dt>Scan jobs</dt>
        <dd>{data.status.scanJobs}</dd>
      </div>
      <div>
        <dt>Scan errors</dt>
        <dd>{data.status.scanErrors}</dd>
      </div>
      <div>
        <dt>Last scan</dt>
        <dd>
          {data.status.lastScan
            ? `${data.status.lastScan.status} - ${formatDateTime(data.status.lastScan.finished_at ?? data.status.lastScan.created_at, { fallback: "never" })}`
            : "Never"}
        </dd>
      </div>
    </dl>
  </div>
</section>

<style>
  h2 {
    font-size: 1.02rem;
  }

  h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  h2,
  p {
    margin: 0;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(18rem, 0.85fr);
    gap: 0.75rem;
    align-items: start;
    margin-top: 0.8rem;
  }

  .left-column {
    display: grid;
    gap: 0.75rem;
  }

  .maintenance-panel {
    align-self: start;
  }

  .action-note {
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
    padding: 0.5rem 0.6rem;
    font-size: 0.86rem;
  }

  .action-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.65rem;
  }

  .action-copy,
  .action-messages {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .action-row form,
  .button-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: flex-end;
    margin: 0;
  }

  .compact-action {
    min-height: 2rem;
    padding: 0 0.65rem;
    font-size: 0.86rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .check input {
    width: auto;
    min-height: 0;
  }

  .subdued {
    color: var(--color-subtle);
    font-size: 0.9rem;
  }

  .detail-copy {
    line-height: 1.5;
    font-size: 0.88rem;
  }

  .switch-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-faint);
    padding: 0.6rem 0.7rem;
  }

  .switch-row > span:first-child {
    display: grid;
    gap: 0.12rem;
    min-width: 0;
  }

  .switch-row strong {
    color: var(--color-text);
  }

  .switch-row small {
    color: var(--color-dim);
    font-size: 0.86rem;
  }

  .switch {
    position: relative;
    display: inline-grid;
    width: 2.8rem;
    height: 1.55rem;
    flex-shrink: 0;
  }

  .switch input {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    min-height: 0;
    margin: 0;
    cursor: pointer;
    opacity: 0;
  }

  .switch-track {
    position: relative;
    border: 1px solid var(--color-border-strong);
    border-radius: 999px;
    background: var(--color-border-strong);
    transition:
      background 140ms ease,
      border-color 140ms ease;
  }

  .switch-track::after {
    content: "";
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 999px;
    background: var(--color-text-soft);
    transition: transform 140ms ease;
  }

  .switch input:checked + .switch-track {
    border-color: var(--color-accent-border);
    background: var(--color-accent-soft);
  }

  .switch input:checked + .switch-track::after {
    transform: translateX(1.22rem);
    background: var(--color-accent);
  }

  .switch input:focus-visible + .switch-track {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  dt {
    color: var(--ops-muted);
  }

  .status-panel {
    margin-top: 0.75rem;
  }

  .status-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: 0.5rem;
  }

  .status-cards div {
    display: grid;
    gap: 0.15rem;
    align-items: center;
  }

  .status-cards span {
    color: var(--ops-muted);
    font-size: 0.86rem;
  }

  .status-cards strong {
    font-size: 1.05rem;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem 1.25rem;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: right;
  }

  @media (max-width: 920px) {
    .settings-grid,
    dl {
      grid-template-columns: 1fr;
    }

    .action-row {
      grid-template-columns: 1fr;
    }

    .action-row form,
    .button-group {
      justify-self: start;
      justify-content: flex-start;
    }
  }

  @media (max-width: 560px) {
    dl div {
      display: grid;
      gap: 0.2rem;
    }

    dd {
      text-align: left;
    }
  }
</style>

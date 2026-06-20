<script lang="ts">
  import { formatGibibytes } from "$lib/media/format";
  import { Trash2 } from "@lucide/svelte";

  let {
    transcodePolicy,
    encodeAheadSegmentCount: initialEncodeAheadSegmentCount,
    playbackCacheTtlHours: initialPlaybackCacheTtlHours,
    playbackSessionArtifactMaxBytes,
    playbackSessionArtifactMaxBytesOptions,
    transcodingError,
    playbackCleanupError,
    playbackCleanupMessage,
  }: {
    transcodePolicy: {
      transcodingEnabled: boolean;
      hardwareAcceleration: string;
      hardwareAccelerationRequired: boolean;
      transcodeQualityPreset: string;
    };
    encodeAheadSegmentCount: number;
    playbackCacheTtlHours: number;
    playbackSessionArtifactMaxBytes: number;
    playbackSessionArtifactMaxBytesOptions: readonly number[];
    transcodingError?: string;
    playbackCleanupError?: string;
    playbackCleanupMessage?: string;
  } = $props();

  let transcodingForm: HTMLFormElement | null = $state(null);
  let transcodingEnabled = $state(true);
  let hardwareAcceleration = $state("off");
  let hardwareAccelerationRequired = $state(false);
  let transcodeQualityPreset = $state("auto");
  let encodeAheadSegmentCount = $state(4);
  let playbackCacheTtlHours = $state(24);

  $effect(() => {
    transcodingEnabled = transcodePolicy.transcodingEnabled;
    hardwareAcceleration = transcodePolicy.hardwareAcceleration;
    hardwareAccelerationRequired = transcodePolicy.hardwareAccelerationRequired;
    transcodeQualityPreset = transcodePolicy.transcodeQualityPreset;
    encodeAheadSegmentCount = initialEncodeAheadSegmentCount;
    playbackCacheTtlHours = initialPlaybackCacheTtlHours;
  });

  function submitTranscoding() {
    transcodingForm?.requestSubmit();
  }
</script>

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
          {#each playbackSessionArtifactMaxBytesOptions as bytes}
            <option value={bytes} selected={bytes === playbackSessionArtifactMaxBytes}>
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
        directly or the user prefers HLS. HLS quality controls FFmpeg transcode resolution and bitrate, and Auto keeps
        the current server default. Encoded HLS segments are cached under LUNARR_DATA_DIR/playback-cache and reused
        across sessions, and per-session playlists live under playback-sessions. Encode-ahead limits how many segments
        FFmpeg may generate beyond the current playhead. Hardware acceleration is best-effort unless required, and
        playback fails if FFmpeg cannot use the selected device or H.264 encoder.
      </p>

      {#if transcodingError}
        <p class="error">{transcodingError}</p>
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
        {#if playbackCleanupError}
          <p class="error">{playbackCleanupError}</p>
        {/if}
        {#if playbackCleanupMessage}
          <p>{playbackCleanupMessage}</p>
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

<style>
  h2,
  h3 {
    margin: 0;
  }

  h2 {
    font-size: 1.02rem;
  }

  h3 {
    font-size: 0.95rem;
  }

  .detail-copy {
    line-height: 1.5;
    font-size: 0.88rem;
  }

  .action-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.65rem;
  }

  .action-copy {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .action-row form {
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

  @media (max-width: 920px) {
    .action-row {
      grid-template-columns: 1fr;
    }

    .action-row form {
      justify-self: start;
      justify-content: flex-start;
    }
  }
</style>

<script lang="ts">
  import { formatGibibytes } from "$lib/media/format";
  import SettingsActionRow from "./SettingsActionRow.svelte";
  import SettingsSwitchField from "./SettingsSwitchField.svelte";
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
      <SettingsSwitchField
        name="transcodingEnabled"
        title="Allow transcoding"
        description={transcodingEnabled ? "Unsupported files can use HLS playback" : "Direct play only"}
        bind:checked={transcodingEnabled}
        onchange={submitTranscoding}
      />

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

  <div class="ops-panel-body">
    <SettingsActionRow>
      {#snippet copy()}
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
      {/snippet}

      {#snippet actions()}
        <form method="POST" action="?/cleanupPlaybackArtifacts">
          <button type="submit" class="secondary compact-action">
            <Trash2 size={16} aria-hidden="true" />
            Force cleanup
          </button>
        </form>
      {/snippet}
    </SettingsActionRow>
  </div>
</section>

<style>
  .detail-copy {
    line-height: 1.5;
    font-size: 0.88rem;
  }
</style>

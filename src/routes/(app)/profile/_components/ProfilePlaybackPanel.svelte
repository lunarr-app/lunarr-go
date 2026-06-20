<script lang="ts">
  import { Save } from "@lucide/svelte";

  let {
    transcodePolicy,
    playbackPreferenceError,
  }: {
    transcodePolicy: {
      playbackPreference: string;
      preferredAudioLanguage: string | null;
      preferredSubtitleLanguage: string | null;
      transcodingEnabled: boolean;
    };
    playbackPreferenceError?: string;
  } = $props();

  let playbackForm: HTMLFormElement | null = $state(null);
  let playbackPreference = $state("auto");
  let preferredAudioLanguage = $state("");
  let preferredSubtitleLanguage = $state("");

  function normalizeLanguage(value: string) {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized.slice(0, 32) : "";
  }

  const playbackDirty = $derived(
    playbackPreference !== transcodePolicy.playbackPreference ||
      normalizeLanguage(preferredAudioLanguage) !== (transcodePolicy.preferredAudioLanguage ?? "") ||
      normalizeLanguage(preferredSubtitleLanguage) !== (transcodePolicy.preferredSubtitleLanguage ?? ""),
  );

  $effect(() => {
    playbackPreference = transcodePolicy.playbackPreference;
    preferredAudioLanguage = transcodePolicy.preferredAudioLanguage ?? "";
    preferredSubtitleLanguage = transcodePolicy.preferredSubtitleLanguage ?? "";
  });

  function submitPlaybackPreference() {
    playbackForm?.requestSubmit();
  }
</script>

<form class="ops-panel" method="POST" action="?/savePlaybackPreference" bind:this={playbackForm}>
  <div class="ops-panel-header">
    <div>
      <h2>Playback</h2>
      <p class="muted">Default behavior when direct play and temporary HLS are both available.</p>
    </div>
  </div>

  <div class="ops-panel-body">
    <label>
      Playback preference
      <select name="playbackPreference" bind:value={playbackPreference} onchange={submitPlaybackPreference}>
        <option value="auto">Auto</option>
        <option value="prefer_direct">Prefer direct play</option>
        <option value="prefer_transcode">Prefer temporary HLS</option>
      </select>
    </label>

    <label>
      Preferred audio language
      <input
        name="preferredAudioLanguage"
        type="text"
        maxlength="32"
        placeholder="eng, jpn, en"
        bind:value={preferredAudioLanguage}
        onchange={submitPlaybackPreference}
      />
    </label>

    <label>
      Preferred subtitle language
      <input
        name="preferredSubtitleLanguage"
        type="text"
        maxlength="32"
        placeholder="eng, jpn, en"
        bind:value={preferredSubtitleLanguage}
        onchange={submitPlaybackPreference}
      />
    </label>

    <p class="muted detail-copy">
      Auto uses direct play for browser-compatible files and temporary HLS only when needed. Preferred audio language is
      used for temporary HLS when probe metadata has a matching audio stream. Preferred subtitle language chooses the
      default external subtitle track when available.
    </p>

    {#if !transcodePolicy.transcodingEnabled}
      <p class="muted status-note">
        Temporary HLS playback is currently disabled by an admin. Compatible files still use direct play.
      </p>
    {/if}

    {#if playbackPreferenceError}
      <p class="error">{playbackPreferenceError}</p>
    {/if}

    <button type="submit" disabled={!playbackDirty}>
      <Save size={16} aria-hidden="true" />
      Save playback
    </button>
  </div>
</form>

<style>
  .detail-copy {
    line-height: 1.5;
    font-size: 0.88rem;
  }

  .status-note {
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
    padding: 0.5rem 0.6rem;
    font-size: 0.86rem;
  }
</style>

<script lang="ts">
  import { normalizePreferredLanguage } from "$lib/media/preferred-language";

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

  function preferredLanguageInput(value: string) {
    return normalizePreferredLanguage(value) ?? "";
  }

  const playbackDirty = $derived(
    playbackPreference !== transcodePolicy.playbackPreference ||
      preferredLanguageInput(preferredAudioLanguage) !== (transcodePolicy.preferredAudioLanguage ?? "") ||
      preferredLanguageInput(preferredSubtitleLanguage) !== (transcodePolicy.preferredSubtitleLanguage ?? ""),
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
      <p class="muted">Default behavior when direct play and transcoding are both available.</p>
    </div>
  </div>

  <div class="ops-panel-body">
    <label>
      Playback preference
      <select name="playbackPreference" bind:value={playbackPreference} onchange={submitPlaybackPreference}>
        <option value="auto">Auto</option>
        <option value="prefer_direct">Prefer direct play</option>
        <option value="prefer_transcode">Prefer transcoding</option>
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
        Transcoding is currently disabled by an admin. Compatible files still use direct play.
      </p>
    {/if}

    {#if playbackPreferenceError}
      <p class="error">{playbackPreferenceError}</p>
    {/if}

    <button type="submit" disabled={!playbackDirty}>
      Save playback
    </button>
  </div>
</form>

<style>
  .status-note {
    border: 1px solid var(--color-warning-border);
    border-radius: 8px;
    background: var(--color-warning-soft);
    padding: var(--space-2) 0.6rem;
    font-size: 0.86rem;
  }
</style>

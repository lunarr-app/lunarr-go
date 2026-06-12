<script lang="ts">
  import { Save, UserRound } from "@lucide/svelte";

  let { data, form } = $props();
  let playbackPreference = $state("auto");
  let preferredAudioLanguage = $state("");
  let preferredSubtitleLanguage = $state("");
  let playbackForm: HTMLFormElement | null = $state(null);

  $effect(() => {
    playbackPreference = data.transcodePolicy.playbackPreference;
    preferredAudioLanguage = data.transcodePolicy.preferredAudioLanguage ?? "";
    preferredSubtitleLanguage =
      data.transcodePolicy.preferredSubtitleLanguage ?? "";
  });

  function submitPlaybackPreference() {
    playbackForm?.requestSubmit();
  }
</script>

<svelte:head>
  <title>Profile - Lunarr</title>
  <meta
    name="description"
    content="Manage your Lunarr profile and playback preferences."
  />
</svelte:head>

<div class="page-heading">
  <h1>Profile</h1>
  <p class="muted">Account and playback preferences.</p>
</div>

<div class="profile-grid">
  <section class="panel account-panel" aria-label="Account details">
    <div class="avatar" aria-hidden="true">
      <span
        >{(data.user.name || data.user.email || "L")
          .slice(0, 1)
          .toUpperCase()}</span
      >
    </div>
    <div class="account-copy">
      <h2>{data.user.name || "Lunarr user"}</h2>
      {#if data.user.email}
        <p class="muted">{data.user.email}</p>
      {/if}
      <span>{data.user.role === "admin" ? "Admin" : "User"}</span>
    </div>
  </section>

  <form
    class="panel"
    method="POST"
    action="?/savePlaybackPreference"
    bind:this={playbackForm}
  >
    <div class="section-heading">
      <div>
        <h2>Playback</h2>
        <p class="muted">
          Default behavior when direct play and temporary HLS are both
          available.
        </p>
      </div>
      <UserRound size={18} aria-hidden="true" />
    </div>

    <label>
      Playback preference
      <select
        name="playbackPreference"
        bind:value={playbackPreference}
        onchange={submitPlaybackPreference}
      >
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
      Auto uses direct play for browser-compatible files and temporary HLS only
      when needed. Preferred audio language is used for temporary HLS when probe
      metadata has a matching audio stream. Preferred subtitle language chooses
      the default external subtitle track when available.
    </p>

    {#if !data.transcodePolicy.transcodingEnabled}
      <p class="muted status-note">
        Temporary HLS playback is currently disabled by an admin. Compatible
        files still use direct play.
      </p>
    {/if}

    {#if form?.playbackPreferenceError}
      <p class="error">{form.playbackPreferenceError}</p>
    {/if}

    <button>
      <Save size={16} aria-hidden="true" />
      Save playback
    </button>
  </form>
</div>

<style>
  .page-heading {
    display: grid;
    gap: 0.25rem;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  h2 {
    font-size: 1.02rem;
  }

  .profile-grid {
    display: grid;
    grid-template-columns: minmax(16rem, 0.7fr) minmax(0, 1.3fr);
    gap: 0.75rem;
    align-items: start;
    margin-top: 0.8rem;
  }

  .panel {
    display: grid;
    gap: 0.65rem;
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    padding: 0.75rem;
  }

  .account-panel {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: #17212a;
    color: #f7f9fb;
    font-size: 1rem;
    font-weight: 800;
  }

  .account-copy {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .account-copy h2,
  .account-copy p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-copy span {
    width: fit-content;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    color: #dce4e8;
    background: rgba(255, 255, 255, 0.05);
    padding: 0.18rem 0.5rem;
    font-size: 0.76rem;
    font-weight: 700;
  }

  .section-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
  }

  .detail-copy {
    line-height: 1.5;
    font-size: 0.88rem;
  }

  .status-note {
    border: 1px solid rgba(255, 217, 154, 0.16);
    border-radius: 8px;
    background: rgba(255, 217, 154, 0.06);
    padding: 0.5rem 0.6rem;
    font-size: 0.86rem;
  }

  @media (max-width: 760px) {
    .profile-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

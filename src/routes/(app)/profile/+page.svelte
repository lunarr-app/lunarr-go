<script lang="ts">
  import ProfileAccountPanel from "./_components/ProfileAccountPanel.svelte";
  import ProfileApiKeysPanel from "./_components/ProfileApiKeysPanel.svelte";
  import ProfileAppearancePanel from "./_components/ProfileAppearancePanel.svelte";
  import ProfileDevicePairingPanel from "./_components/ProfileDevicePairingPanel.svelte";
  import ProfilePlaybackPanel from "./_components/ProfilePlaybackPanel.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Profile - Lunarr</title>
  <meta name="description" content="Manage your Lunarr profile and playback preferences." />
</svelte:head>

<div class="ops-page-header">
  <div>
    <h1>Profile</h1>
    <p class="muted">Account and playback preferences.</p>
  </div>
</div>

<div class="profile-grid">
  <ProfileAccountPanel user={data.user} accountError={form?.accountError} passwordError={form?.passwordError} />

  <div class="profile-stack">
    <ProfileAppearancePanel />
    <ProfilePlaybackPanel
      transcodePolicy={data.transcodePolicy}
      playbackPreferenceError={form?.playbackPreferenceError}
    />
    <ProfileDevicePairingPanel
      initialUserCode={data.initialUserCode}
      pairingSuccess={form?.pairingSuccess}
      pairingError={form?.pairingError}
    />
    <ProfileApiKeysPanel
      apiKeys={data.apiKeys}
      createdApiKeyToken={form?.createdApiKeyToken}
      apiKeySuccess={form?.apiKeySuccess}
      apiKeyError={form?.apiKeyError}
    />
  </div>
</div>

<style>
  .profile-grid {
    display: grid;
    grid-template-columns: minmax(16rem, 0.85fr) minmax(0, 1.15fr);
    gap: 0.75rem;
    align-items: start;
    margin-top: 0.8rem;
  }

  .profile-stack {
    display: grid;
    gap: 0.75rem;
  }

  @media (max-width: 920px) {
    .profile-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

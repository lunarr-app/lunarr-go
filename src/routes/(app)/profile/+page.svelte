<script lang="ts">
  import ProfileAccountPanel from "./_components/ProfileAccountPanel.svelte";
  import ProfileApiKeysPanel from "./_components/ProfileApiKeysPanel.svelte";
  import ProfileAppearancePanel from "./_components/ProfileAppearancePanel.svelte";
  import ProfileLinkDevicePanel from "./_components/ProfileLinkDevicePanel.svelte";
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
  <div class="profile-stack">
    <div class="profile-panel profile-panel--account">
      <ProfileAccountPanel user={data.user} accountError={form?.accountError} passwordError={form?.passwordError} />
    </div>

    <div class="profile-panel profile-panel--link">
      <ProfileLinkDevicePanel devicePairingApiKeyExpiry={data.devicePairingApiKeyExpiry} />
    </div>

    <div class="profile-panel profile-panel--api">
      <ProfileApiKeysPanel
        apiKeys={data.apiKeys}
        createdApiKeyToken={form?.createdApiKeyToken}
        apiKeySuccess={form?.apiKeySuccess}
        apiKeyError={form?.apiKeyError}
      />
    </div>
  </div>

  <div class="profile-stack">
    <div class="profile-panel profile-panel--appearance">
      <ProfileAppearancePanel />
    </div>

    <div class="profile-panel profile-panel--playback">
      <ProfilePlaybackPanel
        transcodePolicy={data.transcodePolicy}
        playbackPreferenceError={form?.playbackPreferenceError}
      />
    </div>
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
    min-width: 0;
  }

  .profile-panel {
    min-width: 0;
  }

  @media (max-width: 920px) {
    .profile-grid {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
      width: 100%;
    }

    .profile-stack {
      display: contents;
    }

    .profile-panel {
      width: 100%;
      align-self: stretch;
    }

    .profile-panel :global(.ops-panel) {
      width: 100%;
    }

    .profile-panel--account {
      order: 1;
    }

    .profile-panel--appearance {
      order: 2;
    }

    .profile-panel--link {
      order: 3;
    }

    .profile-panel--api {
      order: 4;
    }

    .profile-panel--playback {
      order: 5;
    }
  }
</style>

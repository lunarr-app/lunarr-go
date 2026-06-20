<script lang="ts">
  import SettingsActionsPanel from "./_components/SettingsActionsPanel.svelte";
  import SettingsMetadataPanel from "./_components/SettingsMetadataPanel.svelte";
  import SettingsRegistrationPanel from "./_components/SettingsRegistrationPanel.svelte";
  import SettingsStatusPanel from "./_components/SettingsStatusPanel.svelte";
  import SettingsTranscodingPanel from "./_components/SettingsTranscodingPanel.svelte";

  let { data, form } = $props();
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
    <SettingsRegistrationPanel signupOpen={data.signupOpen} registrationError={form?.registrationError} />
    <SettingsTranscodingPanel
      transcodePolicy={data.transcodePolicy}
      encodeAheadSegmentCount={data.encodeAheadSegmentCount}
      playbackCacheTtlHours={data.playbackCacheTtlHours}
      playbackSessionArtifactMaxBytes={data.playbackSessionArtifactMaxBytes}
      playbackSessionArtifactMaxBytesOptions={data.playbackSessionArtifactMaxBytesOptions}
      transcodingError={form?.transcodingError}
      playbackCleanupError={form?.playbackCleanupError}
      playbackCleanupMessage={form?.playbackCleanupMessage}
    />
    <SettingsMetadataPanel
      tmdbAccessTokenConfigured={data.tmdbAccessTokenConfigured}
      tmdbApiKeyConfigured={data.tmdbApiKeyConfigured}
      tmdbAccessTokenSaved={data.tmdbAccessTokenSaved}
      tmdbApiKeySaved={data.tmdbApiKeySaved}
      metadataSaveError={form?.metadataSaveError}
    />
  </section>

  <SettingsActionsPanel
    tmdbConfigured={data.tmdbConfigured}
    tmdbTestMessage={form?.tmdbTestMessage}
    tmdbTestOk={form?.tmdbTestOk}
    metadataError={form?.metadataError}
    metadataMessage={form?.metadataMessage}
    tvMetadataError={form?.tvMetadataError}
    tvMetadataMessage={form?.tvMetadataMessage}
    scanError={form?.scanError}
    scanMessage={form?.scanMessage}
    probeError={form?.probeError}
    probeMessage={form?.probeMessage}
  />
</div>

<SettingsStatusPanel
  signupOpen={data.signupOpen}
  version={data.version}
  playbackSessionArtifactMaxBytes={data.playbackSessionArtifactMaxBytes}
  playbackCacheTtlHours={data.playbackCacheTtlHours}
  status={data.status}
/>

<style>
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

  @media (max-width: 920px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

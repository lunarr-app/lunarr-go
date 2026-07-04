<script lang="ts">
  import ProfileDevicePairingPanel from "../profile/_components/ProfileDevicePairingPanel.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Link device - Lunarr</title>
  <meta name="description" content="Approve a TV or mobile app pairing code for Lunarr." />
</svelte:head>

<div class="ops-page-header">
  <div>
    <h1>Link device</h1>
    <p class="muted">Approve the code shown on your TV or mobile app.</p>
  </div>
</div>

<ProfileDevicePairingPanel
  initialUserCode={data.initialUserCode}
  pairingSuccess={form?.pairingSuccess}
  pairingError={form?.pairingError}
/>

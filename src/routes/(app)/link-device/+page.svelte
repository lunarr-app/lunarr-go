<script lang="ts">
  import LinkDeviceForm from "./_components/LinkDeviceForm.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Link device - Lunarr</title>
  <meta name="description" content="Approve a TV or mobile app pairing code for Lunarr." />
</svelte:head>

<div class="link-device-layout">
  <div class="ops-page-header">
    <div>
      <h1>Link device</h1>
      <p class="muted">Enter the code shown on your TV or mobile app.</p>
    </div>
  </div>

  <LinkDeviceForm
    initialUserCode={data.initialUserCode}
    initialDeviceName={data.initialDeviceName}
    pairingSuccess={form?.pairingSuccess}
    pairingError={form?.pairingError}
  />
</div>

<style>
  .link-device-layout {
    display: grid;
    gap: 0.8rem;
  }
</style>

<script lang="ts">
  import { resolve } from "$app/paths";
  import { DEVICE_PAIRING_CODE_EXPIRY_MINUTES } from "$lib/device-pairing/constants";
  import { Link2, Tv } from "@lucide/svelte";

  let { devicePairingApiKeyExpiryLabel = "2 years" }: { devicePairingApiKeyExpiryLabel?: string } = $props();
</script>

<section class="ops-panel">
  <div class="ops-panel-header">
    <div>
      <h2>Link a device</h2>
      <p class="muted">Approve TVs and mobile apps with the short code shown on the device.</p>
    </div>
    <Tv size={18} aria-hidden="true" />
  </div>

  <div class="ops-panel-body link-device-panel-body">
    <p class="muted link-device-summary">
      Pairing codes expire after {DEVICE_PAIRING_CODE_EXPIRY_MINUTES} minutes. Linked devices receive an API key that
      {#if devicePairingApiKeyExpiryLabel === "never"}
        does not expire.
      {:else}
        expires after {devicePairingApiKeyExpiryLabel}.
      {/if}
      Revoke linked keys in API Keys below.
    </p>
    <a class="button link-device-action" href={resolve("/link-device")}>
      <Link2 size={16} aria-hidden="true" />
      Link a device
    </a>
  </div>
</section>

<style>
  .link-device-panel-body {
    gap: 0.75rem;
  }

  .link-device-summary {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .link-device-action {
    width: fit-content;
    text-decoration: none;
  }

  .ops-panel-header :global(svg) {
    color: var(--ops-muted);
    flex-shrink: 0;
  }
</style>

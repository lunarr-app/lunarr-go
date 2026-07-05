<script lang="ts">
  import { DEVICE_PAIRING_CODE_EXPIRY_MINUTES } from "$lib/device-pairing/constants";
  import type { DevicePairingApiKeyExpirySettings } from "$lib/device-pairing/expiry-settings";
  import { formatUserCode, normalizeUserCode } from "$lib/device-pairing/format";
  import { Link2 } from "@lucide/svelte";

  let {
    initialUserCode = "",
    initialDeviceName = "",
    devicePairingApiKeyExpiry = { neverExpires: false, label: "2 years" },
    pairingSuccess,
    pairingError,
  }: {
    initialUserCode?: string;
    initialDeviceName?: string;
    devicePairingApiKeyExpiry?: DevicePairingApiKeyExpirySettings;
    pairingSuccess?: string;
    pairingError?: string;
  } = $props();

  let userCodeInput = $state("");
  let deviceName = $state("");

  $effect(() => {
    userCodeInput = initialUserCode;
    deviceName = initialDeviceName;
  });
</script>

<section class="ops-panel">
  <div class="ops-panel-body pairing-panel-body">
    {#if pairingSuccess}
      <p class="success" role="status">{pairingSuccess}</p>
    {/if}

    <form class="pairing-form" method="POST" action="?/approveDevicePairing">
      <label>
        Pairing code
        <input
          name="userCode"
          bind:value={userCodeInput}
          maxlength="9"
          autocomplete="one-time-code"
          inputmode="text"
          placeholder="ABCD-1234"
          aria-describedby="pairing-code-help"
        />
      </label>
      <p id="pairing-code-help" class="muted code-preview">
        {#if normalizeUserCode(userCodeInput)}
          Normalized: {formatUserCode(userCodeInput)}
        {:else}
          Enter the 8-character code from the device.
        {/if}
      </p>

      <label>
        Device name
        <input name="deviceName" bind:value={deviceName} maxlength="80" placeholder="Living room TV" />
      </label>

      {#if pairingError}
        <p class="error">{pairingError}</p>
      {/if}

      <button>
        <Link2 size={16} aria-hidden="true" />
        Link device
      </button>
    </form>

    <p class="muted pairing-footnote">
      Codes expire after {DEVICE_PAIRING_CODE_EXPIRY_MINUTES} minutes. Device keys
      {#if devicePairingApiKeyExpiry.neverExpires}
        do not expire
      {:else}
        last {devicePairingApiKeyExpiry.label}
      {/if}
      and can be revoked in Profile.
    </p>
  </div>
</section>

<style>
  .pairing-panel-body {
    gap: 0.75rem;
    padding-top: 0.85rem;
  }

  .pairing-footnote {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .pairing-form {
    display: grid;
    gap: 0.65rem;
  }

  .code-preview {
    margin: -0.2rem 0 0;
    font-size: 0.82rem;
  }

  .success {
    margin: 0;
    color: var(--color-success-strong, #1f7a43);
    font-size: 0.9rem;
  }
</style>

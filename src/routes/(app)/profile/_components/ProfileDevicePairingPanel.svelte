<script lang="ts">
  import { formatUserCode, normalizeUserCode } from "$lib/device-pairing/format";
  import { Link2, Tv } from "@lucide/svelte";

  let {
    initialUserCode = "",
    pairingSuccess,
    pairingError,
  }: {
    initialUserCode?: string;
    pairingSuccess?: string;
    pairingError?: string;
  } = $props();

  let userCodeInput = $state("");
  let deviceName = $state("");

  $effect(() => {
    userCodeInput = initialUserCode;
  });
</script>

<section class="ops-panel">
  <div class="ops-panel-header">
    <div>
      <h2>Link a device</h2>
      <p class="muted">Approve TV and mobile apps with the short code shown on the device.</p>
    </div>
    <Tv size={18} aria-hidden="true" />
  </div>

  <div class="ops-panel-body pairing-panel-body">
    <p class="muted pairing-help">
      On the device, enter your server URL and note the pairing code. Then enter that code here to create a personal API
      key automatically.
    </p>

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
  </div>
</section>

<style>
  .pairing-panel-body {
    gap: 0.75rem;
  }

  .pairing-help {
    margin: 0;
    font-size: 0.9rem;
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

  .ops-panel-header :global(svg) {
    color: var(--ops-muted);
    flex-shrink: 0;
  }
</style>

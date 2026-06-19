<script lang="ts">
  let { href }: { href?: string } = $props();
</script>

{#if href}
  <a class="brand" {href} aria-label="Lunarr home">
    <img class="brand-logo brand-logo-dark" src="/images/lunarr-logo.svg" alt="Lunarr" />
    <img class="brand-logo brand-logo-light" src="/images/lunarr-logo-light.svg" alt="Lunarr" />
  </a>
{:else}
  <div class="brand" aria-label="Lunarr">
    <img class="brand-logo brand-logo-dark" src="/images/lunarr-logo.svg" alt="Lunarr" />
    <img class="brand-logo brand-logo-light" src="/images/lunarr-logo-light.svg" alt="Lunarr" />
  </div>
{/if}

<style>
  .brand {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .brand-logo {
    width: 8rem;
    max-width: 100%;
    height: auto;
    display: block;
  }

  .brand-logo-light {
    display: none;
  }

  :global(:root[data-theme="light"]) .brand-logo-dark {
    display: none;
  }

  :global(:root[data-theme="light"]) .brand-logo-light {
    display: block;
  }

  @media (max-width: 820px) {
    .brand {
      min-height: 2.15rem;
    }

    .brand-logo {
      width: 6.5rem;
    }
  }
</style>

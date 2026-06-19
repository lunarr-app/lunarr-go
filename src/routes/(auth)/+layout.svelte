<script lang="ts">
  import AuthPosterCollage from "$lib/components/AuthPosterCollage.svelte";
  import { page } from "$app/state";

  let { data, children } = $props();
  const isErrorPage = $derived(Boolean(page.error));
  const hasPosterCollage = $derived(data.authBackgroundPosters.length > 0);
</script>

{#if isErrorPage}
  {@render children()}
{:else}
  <main class="auth-shell" class:has-collage={hasPosterCollage}>
    {#if hasPosterCollage}
      <AuthPosterCollage posters={data.authBackgroundPosters} />
    {/if}
    <section class="auth-card">
      <img class="brand brand-dark" src="/images/lunarr-logo.svg" alt="Lunarr" />
      <img class="brand brand-light" src="/images/lunarr-logo-light.svg" alt="Lunarr" />
      {@render children()}
    </section>
  </main>
{/if}

<style>
  .auth-shell {
    position: relative;
    isolation: isolate;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
    background:
      linear-gradient(rgba(2, 8, 12, 0.54), rgba(2, 8, 12, 0.78)),
      url("/images/lunarr-auth-background.png") center / cover;
  }

  .auth-shell.has-collage {
    background: var(--color-bg);
  }

  .auth-card {
    position: relative;
    z-index: 1;
    width: min(100%, 28rem);
    border: 1px solid var(--color-border-strong);
    border-radius: 8px;
    background: var(--color-surface);
    padding: clamp(1.25rem, 4vw, 2rem);
    box-shadow: 0 24px 80px var(--color-shadow);
    backdrop-filter: blur(14px);
  }

  .brand {
    display: block;
    width: min(13rem, 72%);
    height: auto;
    margin: 0 auto 1.45rem;
  }

  .brand-light {
    display: none;
  }

  :global(:root[data-theme="light"]) .brand-dark {
    display: none;
  }

  :global(:root[data-theme="light"]) .brand-light {
    display: block;
  }

  .auth-card :global(h1) {
    margin: 0 0 0.35rem;
  }

  .auth-card :global(form) {
    display: grid;
    gap: 1rem;
    margin-top: 1.4rem;
  }

  .auth-card :global(.auth-link) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-top: 1rem;
    font-size: 0.92rem;
  }

  .auth-card :global(.auth-link a) {
    color: var(--color-accent);
    font-weight: 700;
  }
</style>

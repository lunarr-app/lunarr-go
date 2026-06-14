<script lang="ts">
  import { page } from "$app/state";
  import { getErrorMessage, getErrorTitle, shouldShowRetry } from "$lib/errors/page-copy";
  import { Film, RotateCw, Tv } from "@lucide/svelte";

  const status = $derived(page.status);
  const title = $derived(getErrorTitle(status));
  const message = $derived(getErrorMessage(status, page.error?.message));
  const showRetry = $derived(shouldShowRetry(status));
</script>

<svelte:head>
  <title>{status} - {title} - Lunarr</title>
  <meta name="description" content={`${status} ${title}`} />
</svelte:head>

<main class="error-shell">
  <section class="error-panel" aria-labelledby="error-title">
    <div class="status-code">{status}</div>
    <h1 id="error-title">{title}</h1>
    <p class="muted">{message}</p>

    <div class="actions" aria-label="Navigation">
      <a class="button" href="/movies">
        <Film size={16} aria-hidden="true" />
        Movies
      </a>
      <a class="button secondary" href="/shows">
        <Tv size={16} aria-hidden="true" />
        Shows
      </a>
      {#if showRetry}
        <a class="button secondary" href={page.url.pathname}>
          <RotateCw size={16} aria-hidden="true" />
          Retry
        </a>
      {/if}
    </div>
  </section>
</main>

<style>
  .error-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: clamp(1rem, 4vw, 2rem);
    background:
      radial-gradient(circle at 20% 15%, var(--color-accent-soft), transparent 28rem),
      linear-gradient(135deg, var(--color-bg) 0%, var(--color-bg-soft) 62%, var(--color-bg-warm) 100%);
  }

  .error-panel {
    width: min(100%, 28rem);
    border: 1px solid var(--color-border-strong);
    border-radius: 8px;
    background: var(--color-surface);
    padding: clamp(1rem, 3vw, 1.35rem);
    box-shadow: 0 24px 80px var(--color-shadow);
    display: grid;
    gap: 0.6rem;
  }

  .status-code {
    width: fit-content;
    border: 1px solid var(--color-accent-border);
    border-radius: 6px;
    background: var(--color-accent-soft);
    color: var(--color-accent);
    padding: 0.25rem 0.55rem;
    font-size: 0.82rem;
    font-weight: 850;
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    font-size: clamp(1.35rem, 4vw, 1.65rem);
    line-height: 1.15;
  }

  p {
    max-width: 32rem;
    font-size: 0.92rem;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.15rem;
  }

  @media (max-width: 520px) {
    .actions {
      display: grid;
    }
  }
</style>

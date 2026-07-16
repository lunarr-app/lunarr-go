<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    posterUrl,
    backdropUrl,
    overview,
    genres = [],
    facts,
    subtitle,
    actions,
    secondaryActions,
    below,
    bottomMargin = "0",
    standalone = false,
  }: {
    title: string;
    posterUrl: string | null;
    backdropUrl: string | null;
    overview: string | null;
    genres?: string[];
    facts?: Snippet;
    subtitle?: Snippet;
    actions?: Snippet;
    secondaryActions?: Snippet;
    below?: Snippet;
    bottomMargin?: string;
    standalone?: boolean;
  } = $props();
</script>

<section
  class="hero"
  class:standalone
  style={`--backdrop: url('${backdropUrl ?? ""}'); --hero-bottom-margin: ${bottomMargin}`}
>
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="hero-inner">
    <div class="poster-column">
      <div class="poster">
        {#if posterUrl}
          <img src={posterUrl} alt="" />
        {:else}
          <span>{title}</span>
        {/if}
      </div>
    </div>

    <div class="copy">
      <div class="copy-top">
        {#if facts}
          <div class="facts">
            {@render facts()}
          </div>
        {/if}

        <h2>{title}</h2>

        {#if subtitle}
          {@render subtitle()}
        {/if}

        {#if genres.length}
          <div class="genres" aria-label="Genres">
            {#each genres as genre}
              <span>{genre}</span>
            {/each}
          </div>
        {/if}
      </div>

      <div class="copy-bottom">
        <p class="overview">{overview ?? "No overview available."}</p>

        {#if actions}
          <div class="hero-actions">
            {@render actions()}
          </div>
        {/if}

        {#if secondaryActions}
          <div class="hero-secondary-actions">
            {@render secondaryActions()}
          </div>
        {/if}

        {#if below}
          {@render below()}
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .hero {
    --hero-text: #f8fafc;
    --hero-text-soft: rgba(248, 250, 252, 0.82);
    --hero-chip-bg: rgba(247, 249, 251, 0.1);
    --hero-chip-border: rgba(247, 249, 251, 0.22);
    --hero-genre: #f7f9fb;
    --hero-genre-border: rgba(247, 249, 251, 0.22);
    position: relative;
    min-height: clamp(20rem, 44vh, 30rem);
    margin: -1.4rem calc(-1 * clamp(1rem, 3vw, 2.4rem)) var(--hero-bottom-margin);
    padding: clamp(1rem, 2vw, 1.5rem) clamp(1rem, 3vw, 2.4rem);
    overflow: hidden;
  }

  .hero-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background:
      linear-gradient(
        90deg,
        rgba(8, 12, 17, 0.96) 0%,
        rgba(8, 12, 17, 0.82) 35%,
        rgba(8, 12, 17, 0.2) 65%,
        rgba(8, 12, 17, 0) 85%
      ),
      linear-gradient(0deg, #080c11 0%, rgba(8, 12, 17, 0.35) 42%, rgba(8, 12, 17, 0.75) 100%),
      var(--backdrop) center / cover;
  }

  .hero.standalone {
    margin: 0;
    min-height: 0;
    padding-block: clamp(1.25rem, 3vw, 2rem);
  }

  .hero.standalone .hero-inner {
    margin: 0 auto;
    width: 100%;
    min-height: 0;
    align-items: start;
  }

  .hero-inner {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(8.5rem, 12.5rem) minmax(0, 46rem);
    gap: clamp(1rem, 2.5vw, 1.8rem);
    align-items: center;
    min-height: calc(clamp(20rem, 44vh, 30rem) - clamp(2rem, 4vw, 3rem));
    max-width: 64rem;
  }

  .poster-column {
    display: grid;
    gap: 0.65rem;
    align-content: start;
    justify-items: start;
  }

  .poster {
    aspect-ratio: 2 / 3;
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-card);
    border: 1px solid var(--color-border-strong);
    display: grid;
    place-items: center;
    box-shadow: 0 1.2rem 3rem rgba(0, 0, 0, 0.42);
  }

  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .poster span {
    padding: var(--space-3);
    color: var(--color-subtle);
    text-align: center;
    overflow-wrap: anywhere;
  }

  .copy {
    display: grid;
    justify-items: start;
    gap: 0.65rem;
    color: var(--hero-text);
  }

  .copy-top,
  .copy-bottom {
    display: grid;
    justify-items: start;
    gap: 0.65rem;
    width: 100%;
  }

  h2 {
    max-width: 42rem;
    font-size: 2rem;
    line-height: 1.05;
  }

  .facts,
  .genres {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .facts :global(span),
  .genres span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.7rem;
    border: 1px solid var(--hero-chip-border);
    border-radius: 999px;
    background: var(--hero-chip-bg);
    color: var(--hero-text-soft);
    padding: 0.16rem 0.58rem;
    font-size: 0.82rem;
    font-weight: 700;
    -webkit-backdrop-filter: blur(9px);
    backdrop-filter: blur(9px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }

  .genres span {
    border-color: var(--hero-genre-border);
    color: var(--hero-genre);
  }

  .overview {
    max-width: 40rem;
    color: var(--hero-text-soft);
    line-height: 1.5;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .hero-secondary-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 0.25rem;
  }

  .hero-actions :global(.primary-action) {
    min-width: 8rem;
  }

  @media (max-width: 820px) {
    .hero:not(.standalone) {
      --mh: clamp(15rem, 52vh, 22rem);
      margin-inline: -1rem;
      overflow: visible;
      min-height: 0;
      padding: 0;
    }

    .hero:not(.standalone) .hero-bg {
      position: absolute;
      inset: 0 0 auto 0;
      height: var(--mh);
      background:
        linear-gradient(
          0deg,
          rgba(8, 12, 17, 0.95) 0%,
          rgba(8, 12, 17, 0.78) 22%,
          rgba(8, 12, 17, 0.28) 50%,
          rgba(8, 12, 17, 0) 82%
        ),
        var(--backdrop) center / cover;
    }

    .hero:not(.standalone) .hero-inner {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      min-height: 0;
      max-width: none;
      padding: 0;
    }

    .hero:not(.standalone) .poster-column {
      display: none;
    }

    .hero:not(.standalone) .copy {
      gap: 0;
    }

    .hero:not(.standalone) .copy-top {
      min-height: var(--mh);
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 0.6rem;
      padding: 1rem 1rem 0.75rem;
    }

    .hero:not(.standalone) .copy-bottom {
      grid-template-columns: 1fr;
      padding: 1rem;
      gap: 0.7rem;
    }
  }

  @media (max-width: 560px) {
    .hero {
      min-height: 0;
    }
  }
</style>

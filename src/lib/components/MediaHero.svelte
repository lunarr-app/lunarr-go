<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    posterUrl,
    backdropUrl,
    overview,
    genres = [],
    facts,
    actions,
    below,
    bottomMargin = "0",
  }: {
    title: string;
    posterUrl: string | null;
    backdropUrl: string | null;
    overview: string | null;
    genres?: string[];
    facts?: Snippet;
    actions?: Snippet;
    below?: Snippet;
    bottomMargin?: string;
  } = $props();
</script>

<section class="hero" style={`--backdrop: url('${backdropUrl ?? ""}'); --hero-bottom-margin: ${bottomMargin}`}>
  <div class="hero-inner">
    <div class="poster">
      {#if posterUrl}
        <img src={posterUrl} alt="" />
      {:else}
        <span>{title}</span>
      {/if}
    </div>

    <div class="copy">
      {#if facts}
        <div class="facts">
          {@render facts()}
        </div>
      {/if}

      <h1>{title}</h1>

      {#if genres.length}
        <div class="genres" aria-label="Genres">
          {#each genres as genre}
            <span>{genre}</span>
          {/each}
        </div>
      {/if}

      <p class="overview">{overview ?? "No overview available."}</p>

      {#if actions}
        <div class="hero-actions">
          {@render actions()}
        </div>
      {/if}

      {#if below}
        {@render below()}
      {/if}
    </div>
  </div>
</section>

<style>
  .hero {
    --hero-text: #f8fafc;
    --hero-text-soft: rgba(248, 250, 252, 0.82);
    --hero-chip-bg: rgba(248, 250, 252, 0.08);
    --hero-chip-border: rgba(255, 255, 255, 0.18);
    --hero-genre: #ffd99a;
    --hero-genre-border: rgba(255, 217, 154, 0.24);
    position: relative;
    min-height: clamp(20rem, 44vh, 30rem);
    margin: -1.4rem calc(-1 * clamp(1rem, 3vw, 2.4rem)) var(--hero-bottom-margin);
    padding: clamp(1rem, 2vw, 1.5rem) clamp(1rem, 3vw, 2.4rem);
    overflow: hidden;
    background:
      linear-gradient(90deg, rgba(8, 12, 17, 0.96) 0%, rgba(8, 12, 17, 0.82) 38%, rgba(8, 12, 17, 0.42) 100%),
      linear-gradient(0deg, #080c11 0%, rgba(8, 12, 17, 0.35) 42%, rgba(8, 12, 17, 0.75) 100%),
      var(--backdrop) center / cover;
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
    padding: 1rem;
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

  h1 {
    margin: 0;
    max-width: 42rem;
    font-size: clamp(1.8rem, 4vw, 3.35rem);
    line-height: 1;
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
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  @media (max-width: 820px) {
    .hero {
      margin-inline: -1rem;
    }

    .hero-inner {
      align-items: center;
      min-height: 0;
      grid-template-columns: 1fr;
    }

    .poster {
      width: min(11rem, 50vw);
    }
  }

  @media (max-width: 560px) {
    .hero {
      min-height: 0;
    }

    h1 {
      font-size: clamp(2rem, 12vw, 3.4rem);
    }
  }
</style>

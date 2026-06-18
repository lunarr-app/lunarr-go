<script lang="ts">
  import MovieCard from "$lib/components/MovieCard.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import ShowCard from "$lib/components/ShowCard.svelte";
  import type { CatalogPageInfo, MovieSummary, ShowSummary } from "$lib/media/types";
  import { ArrowLeft } from "@lucide/svelte";

  let {
    kind,
    mediaId,
    title,
    emptyMessage,
    movies = [],
    shows = [],
    pageInfo,
  }: {
    kind: "movie" | "show";
    mediaId: string;
    title: string;
    emptyMessage: string;
    movies?: MovieSummary[];
    shows?: ShowSummary[];
    pageInfo: CatalogPageInfo;
  } = $props();

  const catalogBase = $derived(kind === "movie" ? `/movies/${mediaId}` : `/shows/${mediaId}`);
  const backHref = $derived(catalogBase);
  const hrefForPage = (page: number) => (page > 1 ? `${catalogBase}/similar?page=${page}` : `${catalogBase}/similar`);

  const range = $derived({
    first: pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1,
    last: Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total),
  });
  const summary = $derived(`Showing ${range.first}-${range.last} of ${pageInfo.total}`);
</script>

<svelte:head>
  <title>Similar to {title} - Lunarr</title>
  <meta name="description" content={`Browse titles similar to ${title} in Lunarr.`} />
</svelte:head>

<header class="page-header">
  <a class="back-link" href={backHref}>
    <ArrowLeft size={16} aria-hidden="true" />
    Back
  </a>
  <div>
    <h1>Similar to {title}</h1>
    <p class="muted">
      Based on genres, keywords, cast, and {kind === "movie" ? "directors" : "creators"} from your library.
    </p>
  </div>
</header>

{#if pageInfo.total === 0}
  <section class="empty">
    <p class="muted">{emptyMessage}</p>
    <a class="button secondary" href={backHref}>Return to {title}</a>
  </section>
{:else}
  <section aria-label={`Similar titles for ${title}`}>
    <div class="grid">
      {#if kind === "movie"}
        {#each movies as movie (movie.id)}
          <MovieCard {movie} />
        {/each}
      {:else}
        {#each shows as show (show.id)}
          <ShowCard {show} />
        {/each}
      {/if}
    </div>
    {#if pageInfo.totalPages > 1}
      <Pagination
        page={pageInfo.page}
        totalPages={pageInfo.totalPages}
        hasPrevious={pageInfo.hasPrevious}
        hasNext={pageInfo.hasNext}
        {hrefForPage}
        {summary}
        ariaLabel={`Similar titles for ${title}`}
      />
    {/if}
  </section>
{/if}

<style>
  .page-header {
    display: grid;
    gap: 0.85rem;
    margin-bottom: 1.6rem;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    width: fit-content;
    color: var(--color-muted);
    font-size: 0.92rem;
    font-weight: 700;
  }

  .back-link:hover {
    color: var(--color-text);
  }

  h1 {
    margin: 0;
    font-size: clamp(1.45rem, 2.2vw, 2rem);
  }

  .empty {
    display: grid;
    gap: 1rem;
    justify-items: start;
    padding: 1.5rem 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 1.1rem;
  }
</style>

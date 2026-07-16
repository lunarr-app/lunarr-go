<script lang="ts">
  import EpisodeCard from "$lib/components/EpisodeCard.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import type { EpisodeSummary } from "$lib/media/types";

  type PageInfo = {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };

  let {
    title,
    description,
    episodes,
    pageInfo,
    hrefForPage,
    emptyTitle = "Nothing here yet",
    emptyDescription = "Return to Continue to resume in-progress movies and episodes.",
  }: {
    title: string;
    description: string;
    episodes: EpisodeSummary[];
    pageInfo: PageInfo;
    hrefForPage: (page: number) => string;
    emptyTitle?: string;
    emptyDescription?: string;
  } = $props();

  const range = $derived({
    first: pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1,
    last: Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total),
  });
  const summary = $derived(`Showing ${range.first}-${range.last} of ${pageInfo.total}`);
</script>

<header class="page-header">
  <div>
    <h1>{title}</h1>
    <p class="muted">{description}</p>
  </div>
</header>

{#if episodes.length}
  <section aria-label={title}>
    <div class="grid">
      {#each episodes as episode (episode.id)}
        <EpisodeCard {episode} />
      {/each}
    </div>
    {#if pageInfo.totalPages > 1}
      <Pagination
        page={pageInfo.page}
        totalPages={pageInfo.totalPages}
        hasPrevious={pageInfo.hasPrevious}
        hasNext={pageInfo.hasNext}
        {hrefForPage}
        {summary}
        ariaLabel={`${title} pages`}
      />
    {/if}
  </section>
{:else}
  <section class="empty">
    <h2>{emptyTitle}</h2>
    <p class="muted">{emptyDescription}</p>
  </section>
{/if}

<style>
  .page-header {
    margin-bottom: 1.6rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: clamp(1.55rem, 2.4vw, 2.25rem);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 1.1rem;
  }

  .empty {
    display: grid;
    justify-items: start;
    gap: 0.8rem;
    margin-top: 3rem;
    max-width: 34rem;
  }

  .empty h2 {
    margin: 0;
  }
</style>

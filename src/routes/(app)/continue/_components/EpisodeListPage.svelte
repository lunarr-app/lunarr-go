<script lang="ts">
  import EpisodeCard from "$lib/components/EpisodeCard.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import type { EpisodeSummary } from "$lib/media/types";
  import { ArrowLeft } from "@lucide/svelte";

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
    backHref = "/continue",
    backLabel = "Continue",
    emptyHref = "/continue",
    emptyTitle = "Nothing here yet",
    emptyDescription = "Return to Continue to resume in-progress movies and episodes.",
    emptyActionLabel = "Back to continue",
  }: {
    title: string;
    description: string;
    episodes: EpisodeSummary[];
    pageInfo: PageInfo;
    hrefForPage: (page: number) => string;
    backHref?: string;
    backLabel?: string;
    emptyHref?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyActionLabel?: string;
  } = $props();

  const range = $derived({
    first: pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1,
    last: Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total),
  });
  const summary = $derived(`Showing ${range.first}-${range.last} of ${pageInfo.total}`);
</script>

<header class="page-header">
  <div>
    <a class="back-link" href={backHref}>
      <ArrowLeft size={16} aria-hidden="true" />
      <span>{backLabel}</span>
    </a>
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
    <a class="button secondary" href={emptyHref}>
      <ArrowLeft size={16} aria-hidden="true" />
      {emptyActionLabel}
    </a>
  </section>
{/if}

<style>
  .page-header {
    margin-bottom: 1.6rem;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.35rem;
    color: var(--color-muted);
    font-size: 0.9rem;
    font-weight: 700;
  }

  .back-link:hover {
    color: var(--color-text);
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

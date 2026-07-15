<script lang="ts">
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";

  type PaginationItem = { type: "page"; page: number } | { type: "ellipsis"; key: string };

  let {
    page,
    totalPages,
    hasPrevious = page > 1,
    hasNext = page < totalPages,
    hrefForPage,
    summary,
    ariaLabel = "Pagination",
  }: {
    page: number;
    totalPages: number;
    hasPrevious?: boolean;
    hasNext?: boolean;
    hrefForPage: (page: number) => string;
    summary?: string;
    ariaLabel?: string;
  } = $props();

  const items = $derived.by(() => {
    const pages = new Set([1, page - 1, page, page + 1, totalPages]);
    const visiblePages = [...pages]
      .filter((item) => item >= 1 && item <= totalPages)
      .sort((left, right) => left - right);
    const paginationItems: PaginationItem[] = [];

    for (const pageNumber of visiblePages) {
      const previous = paginationItems.at(-1);
      if (previous?.type === "page" && pageNumber - previous.page > 1) {
        paginationItems.push({
          type: "ellipsis",
          key: `${previous.page}-${pageNumber}`,
        });
      }
      paginationItems.push({ type: "page", page: pageNumber });
    }

    return paginationItems;
  });
</script>

<div class="pagination">
  {#if summary}
    <span class="summary">{summary}</span>
  {/if}
  <nav class="pager" aria-label={ariaLabel}>
    {#if hasPrevious}
      <a class="edge" href={hrefForPage(page - 1)} aria-label="Previous page">
        <ChevronLeft size={16} aria-hidden="true" />
        <span>Prev</span>
      </a>
    {:else}
      <span class="disabled edge">
        <ChevronLeft size={16} aria-hidden="true" />
        <span>Prev</span>
      </span>
    {/if}

    {#each items as item}
      {#if item.type === "ellipsis"}
        <span class="ellipsis" aria-hidden="true">...</span>
      {:else if item.page === page}
        <span class="current" aria-current="page">{item.page}</span>
      {:else}
        <a href={hrefForPage(item.page)}>{item.page}</a>
      {/if}
    {/each}

    {#if hasNext}
      <a class="edge" href={hrefForPage(page + 1)} aria-label="Next page">
        <span>Next</span>
        <ChevronRight size={16} aria-hidden="true" />
      </a>
    {:else}
      <span class="disabled edge">
        <span>Next</span>
        <ChevronRight size={16} aria-hidden="true" />
      </span>
    {/if}
  </nav>
</div>

<style>
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: 1.1rem;
  }

  .summary {
    color: var(--color-muted);
    font-size: 0.92rem;
  }

  .pager {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem;
  }

  .pager a,
  .pager span {
    display: inline-flex;
    min-width: 2rem;
    min-height: 2rem;
    align-items: center;
    justify-content: center;
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 700;
  }

  .pager .edge {
    gap: 0.25rem;
    min-width: 3.7rem;
  }

  .pager a {
    border-radius: 6px;
    text-decoration: none;
  }

  .pager a:hover {
    background: var(--color-surface-muted);
    color: var(--color-text);
  }

  .pager .current {
    color: var(--color-text);
  }

  .pager .disabled,
  .pager .ellipsis {
    color: var(--color-scrollbar-hover);
    cursor: default;
  }

  @media (max-width: 760px) {
    .pagination {
      align-items: flex-start;
      flex-direction: column;
    }

    .pager {
      width: 100%;
      flex-wrap: wrap;
      justify-content: flex-start;
    }
  }
</style>

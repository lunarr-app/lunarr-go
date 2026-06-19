<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import Pagination from "$lib/components/Pagination.svelte";
  import { formatDateTime } from "$lib/media/format";
  import { revokeShare, shareLinkUrl } from "$lib/shares/client";
  import { SHARE_LIST_STATUSES, type ShareListStatus } from "$lib/shares/constants";
  import { shareScopeLabel, shareStatusDetail, shareStatusLabel } from "$lib/shares/format";
  import type { AdminShareRecord } from "$lib/shares/types";
  import { Copy, ExternalLink, Trash2 } from "@lucide/svelte";

  let { data } = $props();

  let error = $state<string | null>(null);
  let copiedShareId = $state<string | null>(null);
  let revokingShareId = $state<string | null>(null);

  const shares = $derived(data.shares);
  const status = $derived(data.status);
  const counts = $derived(data.counts);
  const pageInfo = $derived(data.page);

  const range = $derived({
    first: pageInfo.total === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1,
    last: Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total),
  });
  const paginationSummary = $derived(`Showing ${range.first}-${range.last} of ${pageInfo.total}`);

  function sharesHref(nextPage: number, nextStatus: ShareListStatus = status) {
    const params = new URLSearchParams();
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    return query ? `/shares?${query}` : "/shares";
  }

  const statusLabels: Record<ShareListStatus, string> = {
    all: "All",
    active: "Active",
    expired: "Expired",
    revoked: "Revoked",
  };

  async function copyShareLink(share: AdminShareRecord) {
    error = null;
    try {
      await navigator.clipboard.writeText(shareLinkUrl(share));
      copiedShareId = share.id;
      window.setTimeout(() => {
        if (copiedShareId === share.id) copiedShareId = null;
      }, 2000);
    } catch {
      error = "Could not copy link to clipboard.";
    }
  }

  async function revokeShareLink(share: AdminShareRecord) {
    if (!share.active) return;
    revokingShareId = share.id;
    error = null;
    try {
      await revokeShare(share.id);
      await invalidateAll();
    } catch (revokeError) {
      error = revokeError instanceof Error ? revokeError.message : "Could not revoke share link.";
    } finally {
      revokingShareId = null;
    }
  }

  function statusClass(share: AdminShareRecord) {
    if (share.active) return "active";
    if (share.revokedAt) return "revoked";
    return "expired";
  }
</script>

<svelte:head>
  <title>Shares - Lunarr</title>
  <meta name="description" content="Review and revoke guest share links across your Lunarr library." />
</svelte:head>

<header class="ops-page-header">
  <div class="page-heading">
    <h1>Shares</h1>
    <p class="muted">View and revoke guest links across movies and shows.</p>
  </div>
</header>

{#if error}
  <p class="page-error" role="alert">{error}</p>
{/if}

<div class="content">
  <section class="ops-panel">
    <div class="ops-panel-header">
      <div class="panel-heading">
        <h2>Guest links</h2>
        <p class="muted">{counts.all} total · {counts.active} active</p>
      </div>
      <div class="segmented" role="group" aria-label="Share status filter">
        {#each SHARE_LIST_STATUSES as shareStatus (shareStatus)}
          <a
            class:active={status === shareStatus}
            href={sharesHref(1, shareStatus)}
            aria-current={status === shareStatus ? "page" : undefined}
          >
            {statusLabels[shareStatus]} ({counts[shareStatus]})
          </a>
        {/each}
      </div>
    </div>

    <div class="ops-table">
      {#each shares as share (share.id)}
        <article class="ops-row share-row" class:inactive={!share.active}>
          <div class="share-summary">
            <div class="share-title-row">
              <a class="title-link" href={share.contentHref}>{share.title}</a>
              <span class="status-badge {statusClass(share)}">{shareStatusLabel(share)}</span>
              <span class="kind-badge">{share.kind === "movie" ? "Movie" : "Show"}</span>
            </div>
            <span class="muted">{shareScopeLabel(share)} · {shareStatusDetail(share)}</span>
            <span class="muted">
              Created {formatDateTime(share.createdAt)} by {share.createdByName || share.createdByEmail}
            </span>
          </div>

          <div class="actions" role="toolbar" aria-label={`Actions for ${share.title}`}>
            <a class="ops-action-link" href={share.sharePath} target="_blank" rel="noreferrer">
              <ExternalLink size={15} aria-hidden="true" />
              Open
            </a>
            <button class="ops-action-link secondary" type="button" onclick={() => copyShareLink(share)}>
              <Copy size={15} aria-hidden="true" />
              {copiedShareId === share.id ? "Copied" : "Copy"}
            </button>
            {#if share.active}
              <button
                class="ops-action-link danger"
                type="button"
                disabled={revokingShareId === share.id}
                onclick={() => revokeShareLink(share)}
              >
                <Trash2 size={15} aria-hidden="true" />
                {revokingShareId === share.id ? "Revoking…" : "Revoke"}
              </button>
            {/if}
          </div>
        </article>
      {:else}
        <p class="muted empty-state">No share links match this filter.</p>
      {/each}
    </div>

    {#if pageInfo.totalPages > 1}
      <div class="pagination-wrap">
        <Pagination
          page={pageInfo.page}
          totalPages={pageInfo.totalPages}
          hasPrevious={pageInfo.hasPrevious}
          hasNext={pageInfo.hasNext}
          hrefForPage={(nextPage) => sharesHref(nextPage)}
          summary={paginationSummary}
          ariaLabel="Share links pages"
        />
      </div>
    {/if}
  </section>
</div>

<style>
  .page-heading,
  .panel-heading {
    display: grid;
    gap: 0.45rem;
  }

  .content {
    display: grid;
    gap: 1rem;
    margin-top: 1.25rem;
  }

  .ops-panel-header {
    gap: 1.25rem;
    padding: 1rem 1rem 0.95rem;
  }

  .segmented {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 0.2rem;
    padding: 0.15rem;
    border-radius: 6px;
    background: var(--color-popover);
    border: 1px solid var(--color-border);
  }

  .segmented a {
    min-height: 1.85rem;
    padding: 0 0.55rem;
    border-radius: 5px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-subtle);
    font-size: 0.82rem;
    font-weight: 650;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }

  .segmented a.active {
    background: var(--color-button-secondary);
    color: var(--color-text);
    border-color: var(--color-button-secondary-border);
  }

  .share-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.75rem 1rem;
    padding: 0.85rem 1rem;
  }

  .share-row.inactive {
    opacity: 0.82;
  }

  .share-summary {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }

  .share-title-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .title-link {
    color: var(--color-text);
    font-weight: 700;
    text-decoration: none;
  }

  .title-link:hover {
    color: var(--color-accent);
  }

  .kind-badge,
  .status-badge {
    display: inline-flex;
    align-items: center;
    min-height: 1.45rem;
    padding: 0 0.45rem;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 700;
    border: 1px solid var(--color-border);
    background: var(--color-surface-faint);
    color: var(--color-subtle);
  }

  .status-badge.active {
    color: var(--color-success);
    border-color: var(--color-success-border);
    background: var(--color-success-soft);
  }

  .status-badge.revoked,
  .status-badge.expired {
    color: var(--color-muted);
  }

  .actions {
    display: flex;
    gap: 0.45rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .empty-state {
    padding: 1rem;
    margin: 0;
  }

  .pagination-wrap {
    padding: 0 1rem 1rem;
  }

  .pagination-wrap :global(.pagination) {
    margin-top: 0;
  }

  .page-error {
    color: var(--color-danger);
    margin: 0.75rem 0 0;
  }

  @media (max-width: 760px) {
    .share-row {
      grid-template-columns: 1fr;
    }

    .actions {
      justify-content: flex-start;
    }

    .segmented {
      width: 100%;
      overflow-x: auto;
    }
  }
</style>

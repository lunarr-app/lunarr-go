<script lang="ts">
  import { formatDateTime } from "$lib/media/format";
  import { RefreshCw } from "@lucide/svelte";

  let {
    show,
    canManageMetadata,
    tmdbConfigured,
    ratingLabel,
    voteCountLabel,
    providerLabel,
    creatorLabel,
    seasonCountLabel,
    episodeCountLabel,
    productionCompanies,
    keywords,
    metadataError,
  }: {
    show: {
      certification: string | null;
      status: string | null;
      releaseDate: string | null;
      originalLanguage: string | null;
      providerId: string | null;
      updatedAt: string;
    };
    canManageMetadata: boolean;
    tmdbConfigured: boolean;
    ratingLabel: string | null;
    voteCountLabel: string | null;
    providerLabel: string;
    creatorLabel: string;
    seasonCountLabel: string;
    episodeCountLabel: string;
    productionCompanies: string[];
    keywords: string[];
    metadataError?: string;
  } = $props();
</script>

<div class="section-heading">
  <h2 id="metadata-heading">Metadata</h2>
  {#if canManageMetadata}
    <form class="metadata-refresh" method="POST" action="?/refreshMetadata">
      <button
        class="text-button"
        disabled={!tmdbConfigured}
        title={tmdbConfigured ? "Refresh metadata from TMDb" : "TMDb credentials are not configured"}
      >
        <RefreshCw size={14} aria-hidden="true" />
        Refresh
      </button>
    </form>
  {/if}
</div>
{#if metadataError}
  <p class="error">{metadataError}</p>
{/if}
<div class="metadata-score">
  <div>
    <strong>{ratingLabel ?? "-"}</strong>
    <span>{voteCountLabel ? `${voteCountLabel} votes` : "Unrated"}</span>
  </div>
  <div>
    <strong>{show.certification ?? "NR"}</strong>
    <span>{show.status ?? "Unknown status"}</span>
  </div>
</div>
<div class="metadata-chips" aria-label="Show metadata facts">
  <span>{providerLabel}</span>
  {#if show.releaseDate}
    <span>{show.releaseDate}</span>
  {/if}
  {#if show.originalLanguage}
    <span>{show.originalLanguage.toUpperCase()}</span>
  {/if}
</div>
<div class="metadata-blocks">
  <section>
    <h3>Credits</h3>
    <dl>
      <div>
        <dt>Created by</dt>
        <dd>{creatorLabel || "Unknown"}</dd>
      </div>
    </dl>
  </section>
  <section>
    <h3>Library</h3>
    <dl>
      <div>
        <dt>Seasons</dt>
        <dd>{seasonCountLabel}</dd>
      </div>
      <div>
        <dt>Episodes</dt>
        <dd>{episodeCountLabel}</dd>
      </div>
      <div>
        <dt>Provider ID</dt>
        <dd>{show.providerId ?? "None"}</dd>
      </div>
      <div>
        <dt>Last updated</dt>
        <dd>{formatDateTime(show.updatedAt)}</dd>
      </div>
    </dl>
  </section>
  {#if productionCompanies.length}
    <section>
      <h3>Production</h3>
      <dl>
        <div>
          <dt>Studios</dt>
          <dd>{productionCompanies.join(", ")}</dd>
        </div>
      </dl>
    </section>
  {/if}
</div>
{#if keywords.length}
  <section class="metadata-keywords">
    <h3>Keywords</h3>
    <div class="keyword-list">
      {#each keywords as keyword}
        <span>{keyword}</span>
      {/each}
    </div>
  </section>
{/if}

<style>
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0;
  }

  .section-heading h2 {
    margin: 0;
  }

  .metadata-refresh {
    margin: 0;
    flex-shrink: 0;
  }

  dl {
    display: grid;
    gap: 0.5rem;
    margin: 0;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
  }

  dt {
    color: var(--color-dim);
    flex-shrink: 0;
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: right;
  }

  .text-button {
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 650;
    justify-content: flex-start;
    gap: 0.35rem;
  }

  .text-button:hover:not(:disabled) {
    color: var(--color-accent);
  }

  .text-button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .metadata-score {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .metadata-score > div {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-faint);
    padding: 0.75rem;
    display: grid;
    gap: 0.15rem;
  }

  .metadata-score strong {
    font-size: 1.6rem;
    line-height: 1;
  }

  .metadata-score span {
    color: var(--color-muted);
    font-size: 0.82rem;
  }

  .metadata-chips,
  .keyword-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .metadata-chips span,
  .keyword-list span {
    border-radius: 999px;
    background: var(--color-surface-muted);
    color: var(--color-text-soft);
    padding: 0.18rem 0.5rem;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .metadata-chips span {
    border: 1px solid var(--color-border);
  }

  .metadata-blocks,
  .metadata-blocks section,
  .metadata-keywords {
    display: grid;
    gap: 0.7rem;
  }

  .metadata-blocks section,
  .metadata-keywords {
    border-top: 1px solid var(--color-border);
    padding-top: 0.8rem;
  }

  .metadata-blocks h3,
  .metadata-keywords h3 {
    margin: 0;
    color: var(--color-dim);
    font-size: 0.9rem;
  }
</style>

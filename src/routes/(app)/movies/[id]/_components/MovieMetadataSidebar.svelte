<script lang="ts">
  import { formatDateTime, formatFileSize } from "$lib/media/format";
  import { RefreshCw } from "@lucide/svelte";

  let {
    movie,
    canManageMetadata,
    tmdbConfigured,
    ratingLabel,
    voteCountLabel,
    runtimeLabel,
    providerLabel,
    directorLabel,
    writerLabel,
    fileCountLabel,
    totalSizeBytes,
    productionCompanies,
    keywords,
    metadataError,
  }: {
    movie: {
      certification: string | null;
      status: string | null;
      release_date: string | null;
      original_language: string | null;
      provider_id: string | null;
      updated_at: string;
      collection_name: string | null;
    };
    canManageMetadata: boolean;
    tmdbConfigured: boolean;
    ratingLabel: string | null;
    voteCountLabel: string | null;
    runtimeLabel: string | null;
    providerLabel: string;
    directorLabel: string;
    writerLabel: string;
    fileCountLabel: string;
    totalSizeBytes: number;
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
    <strong>{movie.certification ?? "NR"}</strong>
    <span>{movie.status ?? "Unknown status"}</span>
  </div>
</div>
<div class="metadata-chips" aria-label="Movie metadata facts">
  <span>{providerLabel}</span>
  {#if movie.release_date}
    <span>{movie.release_date}</span>
  {/if}
  {#if runtimeLabel}
    <span>{runtimeLabel}</span>
  {/if}
  {#if movie.original_language}
    <span>{movie.original_language.toUpperCase()}</span>
  {/if}
</div>
<div class="metadata-blocks">
  <section>
    <h3>Credits</h3>
    <dl>
      <div>
        <dt>Director</dt>
        <dd>{directorLabel || "Unknown"}</dd>
      </div>
      <div>
        <dt>Writers</dt>
        <dd>{writerLabel || "Unknown"}</dd>
      </div>
    </dl>
  </section>
  <section>
    <h3>Library</h3>
    <dl>
      <div>
        <dt>Files</dt>
        <dd>{fileCountLabel}</dd>
      </div>
      <div>
        <dt>Total size</dt>
        <dd>{formatFileSize(totalSizeBytes)}</dd>
      </div>
      <div>
        <dt>Provider ID</dt>
        <dd>{movie.provider_id ?? "None"}</dd>
      </div>
      <div>
        <dt>Last updated</dt>
        <dd>{formatDateTime(movie.updated_at)}</dd>
      </div>
    </dl>
  </section>
  {#if movie.collection_name || productionCompanies.length}
    <section>
      <h3>Production</h3>
      <dl>
        <div>
          <dt>Collection</dt>
          <dd>{movie.collection_name ?? "None"}</dd>
        </div>
        {#if productionCompanies.length}
          <div>
            <dt>Studios</dt>
            <dd>{productionCompanies.join(", ")}</dd>
          </div>
        {/if}
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

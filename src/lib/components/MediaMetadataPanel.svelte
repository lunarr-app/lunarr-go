<script lang="ts">
  import { PencilLine, RefreshCw } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  let {
    chipsLabel,
    ratingLabel,
    voteCountLabel,
    certificationLabel,
    statusLabel,
    canManageMetadata,
    tmdbConfigured,
    metadataError,
    chips,
    blocks,
    keywords = [],
    onFixMatchOpen,
  }: {
    chipsLabel: string;
    ratingLabel: string | null;
    voteCountLabel: string | null;
    certificationLabel: string;
    statusLabel: string;
    canManageMetadata: boolean;
    tmdbConfigured: boolean;
    metadataError?: string;
    chips: Snippet;
    blocks: Snippet;
    keywords?: string[];
    onFixMatchOpen?: () => void;
  } = $props();
</script>

<div class="media-metadata">
  <div class="media-metadata-heading">
    <h2 id="metadata-heading">Metadata</h2>
    {#if canManageMetadata}
      <div class="media-metadata-actions">
        {#if onFixMatchOpen}
          <button
            class="text-button"
            type="button"
            disabled={!tmdbConfigured}
            title={tmdbConfigured
              ? "Manually point this title at the correct TMDb entry"
              : "TMDb credentials are not configured"}
            onclick={() => onFixMatchOpen?.()}
          >
            <PencilLine size={14} aria-hidden="true" />
            Fix match
          </button>
        {/if}
        <form class="media-metadata-refresh" method="POST" action="?/refreshMetadata">
          <button
            class="text-button"
            disabled={!tmdbConfigured}
            title={tmdbConfigured ? "Refresh metadata from TMDb" : "TMDb credentials are not configured"}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        </form>
      </div>
    {/if}
  </div>
  {#if metadataError}
    <p class="error">{metadataError}</p>
  {/if}
  <div class="media-metadata-score">
    <div>
      <strong>{ratingLabel ?? "-"}</strong>
      <span>{voteCountLabel ? `${voteCountLabel} votes` : ratingLabel ? "TMDb rating" : "Unrated"}</span>
    </div>
    <div>
      <strong>{certificationLabel}</strong>
      <span>{statusLabel}</span>
    </div>
  </div>
  <div class="media-metadata-chips" aria-label={chipsLabel}>
    {@render chips()}
  </div>
  <div class="media-metadata-blocks">
    {@render blocks()}
  </div>
  {#if keywords.length}
    <section class="media-metadata-keywords">
      <h3>Keywords</h3>
      <div class="media-keyword-list">
        {#each keywords as keyword (keyword)}
          <span>{keyword}</span>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .media-metadata {
    display: grid;
    gap: var(--space-3);
  }

  .media-metadata-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: 0;
  }

  .media-metadata-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  .media-metadata-refresh {
    margin: 0;
    flex-shrink: 0;
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

  .media-metadata-score {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .media-metadata-score > div {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-faint);
    padding: 0.75rem;
    display: grid;
    gap: 0.15rem;
  }

  .media-metadata-score strong {
    font-size: 1.6rem;
    line-height: 1;
  }

  .media-metadata-score span {
    color: var(--color-muted);
    font-size: 0.82rem;
  }

  .media-metadata-chips,
  .media-keyword-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .media-metadata-chips :global(span),
  .media-keyword-list span {
    border-radius: 999px;
    background: var(--color-surface-muted);
    color: var(--color-text-soft);
    padding: 0.18rem var(--space-2);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .media-metadata-chips :global(span) {
    border: 1px solid var(--color-border);
  }

  .media-metadata-blocks,
  .media-metadata-blocks :global(section),
  .media-metadata-keywords {
    display: grid;
    gap: 0.7rem;
  }

  .media-metadata-blocks :global(section),
  .media-metadata-keywords {
    border-top: 1px solid var(--color-border);
    padding-top: 0.8rem;
  }

  .media-metadata-blocks :global(h3),
  .media-metadata-keywords h3 {
    margin: 0;
    color: var(--color-dim);
    font-size: 0.9rem;
  }

  .media-metadata-blocks :global(dl) {
    display: grid;
    gap: var(--space-2);
    margin: 0;
  }

  .media-metadata-blocks :global(dl div) {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
  }

  .media-metadata-blocks :global(dt) {
    color: var(--color-dim);
    flex-shrink: 0;
  }

  .media-metadata-blocks :global(dd) {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: right;
  }

  .media-metadata-blocks :global(dd a) {
    color: var(--color-accent);
    text-decoration: none;
    font-weight: 700;
  }

  .media-metadata-blocks :global(dd a:hover) {
    text-decoration: underline;
  }
</style>

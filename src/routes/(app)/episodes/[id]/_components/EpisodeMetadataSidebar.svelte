<script lang="ts">
  import MediaMetadataPanel from "$lib/components/MediaMetadataPanel.svelte";
  import { formatFileSize } from "$lib/media/format";

  let {
    episodeCode,
    releaseLabel,
    runtimeLabel,
    ratingLabel,
    voteCountLabel,
    showTitle,
    showHref,
    seasonTitle,
    seasonHref,
    fileCountLabel,
    totalSizeBytes,
  }: {
    episodeCode: string | null;
    releaseLabel: string | null;
    runtimeLabel: string | null;
    ratingLabel: string | null;
    voteCountLabel: string | null;
    showTitle: string;
    showHref: string;
    seasonTitle: string;
    seasonHref: string;
    fileCountLabel: string;
    totalSizeBytes: number;
  } = $props();
</script>

<div class="episode-metadata">
  <MediaMetadataPanel
    chipsLabel="Episode metadata facts"
    {ratingLabel}
    {voteCountLabel}
    certificationLabel={episodeCode ?? "Episode"}
    statusLabel={seasonTitle}
    canManageMetadata={false}
    tmdbConfigured={false}
  >
    {#snippet chips()}
      {#if releaseLabel}
        <span>{releaseLabel}</span>
      {/if}
      {#if runtimeLabel}
        <span>{runtimeLabel}</span>
      {/if}
    {/snippet}

    {#snippet blocks()}
      <section>
        <h3>Series</h3>
        <dl>
          <div>
            <dt>Show</dt>
            <dd><a href={showHref}>{showTitle}</a></dd>
          </div>
          <div>
            <dt>Season</dt>
            <dd><a href={seasonHref}>{seasonTitle}</a></dd>
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
        </dl>
      </section>
    {/snippet}
  </MediaMetadataPanel>
</div>

<style>
  .episode-metadata :global(.media-metadata-blocks a) {
    color: var(--color-accent);
    text-decoration: none;
    font-weight: 700;
  }

  .episode-metadata :global(.media-metadata-blocks a:hover) {
    text-decoration: underline;
  }
</style>
